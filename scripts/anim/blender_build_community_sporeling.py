"""Import the owner's animated Meshy mushroom with original PBR textures.

Use the supplied animation FBX's own mesh/rig together, avoiding incompatible
rest axes in Character_output.fbx. No re-skinning or mesh simplification.
"""
from pathlib import Path
import hashlib
import json
import math
import sys
import tempfile
import zipfile
import bpy
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import export_glb, action_fcurves

SOURCE = ROOT.parent/'bible/models/mobs/comunity/sporling.zip'
EXTRACT = ROOT/'tmp/sporeling-import/source'
OUTPUT = ROOT/'tmp/asset_src/community_sporeling/community_sporeling.glb'


def main():
    local_temp=ROOT/'tmp/sporeling-import/blender-temp'
    local_temp.mkdir(parents=True,exist_ok=True)
    tempfile.tempdir=str(local_temp)
    EXTRACT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(SOURCE) as archive:
        for item in archive.infolist():
            target=(EXTRACT/item.filename).resolve()
            if not target.is_relative_to(EXTRACT.resolve()):
                raise ValueError('Archive path escapes workspace')
            if target.suffix.lower() in ('.fbx','.png'):
                archive.extract(item,EXTRACT)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(next(EXTRACT.rglob('*Merged_Animations.fbx'))))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    if len(rig.data.bones)!=23 or sum(sum(p.loop_total-2 for p in o.data.polygons) for o in meshes)!=9994:
        raise RuntimeError('Unexpected sporeling animation rig/topology')
    material=bpy.data.materials.new('CommunitySporelingAuthored');material.use_nodes=True
    nodes,links=material.node_tree.nodes,material.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    base=next(EXTRACT.rglob('*_texture_0.png'))
    for suffix,socket in [('', 'Base Color'),('_normal','Normal'),('_roughness','Roughness'),('_metallic','Metallic')]:
        tex=nodes.new('ShaderNodeTexImage')
        tex.image=bpy.data.images.load(str(base.with_name(base.stem+suffix+'.png')),check_existing=True)
        if suffix:tex.image.colorspace_settings.name='Non-Color'
        if suffix=='_normal':
            normal=nodes.new('ShaderNodeNormalMap')
            links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs[socket])
        else:links.new(tex.outputs['Color'],bsdf.inputs[socket])
    for mesh in meshes:
        mesh.data.materials.clear();mesh.data.materials.append(material)
        mesh['source_sha256']=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
        mesh['source']='Owner sporling.zip, supplied animation FBX mesh and original PBR maps'
        mesh['original_triangles']=9994
    scene=bpy.context.scene;scene.render.fps=120
    actions={a.name.rsplit('|',1)[-1]:a for a in list(bpy.data.actions)}
    bones=list(rig.pose.bones);hips=rig.pose.bones['mixamorig:Hips']
    configs=[('Idle_11','Sporeling_Idle',None,True),('Idle_5','Sporeling_CombatIdle',None,True),
             ('Walking','Sporeling_Walk',.4,True),('Running','Sporeling_Run',.19,True),
             ('Charged_Slash','Sporeling_Attack',1.2,False),
             ('Simple_Kick','Sporeling_Kick',None,False),
             ('Axe_Spin_Attack','Sporeling_Spin',None,False),
             ('Weapon_Combo_2','Sporeling_Combo',None,False),
             ('Shot_and_Slow_Fall_Backward','Sporeling_Death',2.2,False),
             ('Idle_11','Sporeling_Hit',.45,False)]
    report={}
    # Capture every evaluated native pose before assigning new NLA actions.
    cached={}
    for donor,_,_,_ in configs:
        if donor in cached:continue
        action=actions[donor];rig.animation_data.action=action
        start,end=action.frame_range;frames=[]
        for f in range(round(start),round(end)+1):
            scene.frame_set(f);bpy.context.view_layer.update()
            frames.append({b.name:(b.location.copy(),b.rotation_quaternion.copy(),b.scale.copy()) for b in bones})
        cached[donor]=frames
    rig.animation_data.action=None
    world_to_rig=rig.matrix_world.to_3x3().inverted()
    for donor,name,duration,loop in configs:
        poses=cached[donor]
        length=duration or (len(poses)-1)/30
        count=max(2,round(length*scene.render.fps))
        action=bpy.data.actions.new(name);rig.animation_data.action=action
        endpoints=[]
        # Root-only displacement is removed; authored bob and limb motion remain.
        for source_pose in (poses[0],poses[-1]):
            for b in bones:
                b.location,b.rotation_quaternion,b.scale=source_pose[b.name]
            bpy.context.view_layer.update();endpoints.append(rig.matrix_world@hips.head)
        net=endpoints[-1]-endpoints[0];net.z=0
        if loop:
            # Loop closure above already removes the tiny source endpoint drift.
            net=Vector((0,0,0))
        for frame in range(count+1):
            p=frame/count
            sample_phase=min(1,p/.92) if name=='Sporeling_Death' else p
            source_index=sample_phase*(len(poses)-1)
            low=int(source_index);high=min(low+1,len(poses)-1);blend=source_index-low
            for b in bones:
                a,q,s=poses[low][b.name];aa,qq,ss=poses[high][b.name]
                b.location=a.lerp(aa,blend);b.rotation_mode='QUATERNION'
                b.rotation_quaternion=q.slerp(qq,blend);b.scale=s.lerp(ss,blend)
                if loop and p>.9:
                    t=(p-.9)/.1;t=t*t*(3-2*t)
                    first=poses[0][b.name]
                    b.location=b.location.lerp(first[0],t)
                    b.rotation_quaternion=b.rotation_quaternion.slerp(first[1],t)
                    b.scale=b.scale.lerp(first[2],t)
            bpy.context.view_layer.update()
            matrix=hips.matrix.copy();matrix.translation-=world_to_rig@(net*sample_phase)
            hips.matrix=matrix
            if name=='Sporeling_Hit':
                # A brief native flinch from neutral; no weapon pose or new rig.
                for b in bones:
                    b.location,b.rotation_quaternion,b.scale=poses[0][b.name]
                recoil=math.sin(math.pi*p)**2
                torso=rig.pose.bones['mixamorig:Spine2']
                torso.rotation_quaternion @= Quaternion((1,0,0),-.14*recoil)
            bpy.context.view_layer.update()
            # Source stances have different floor heights. Keep the short-legged
            # creature on the same floor through idle/travel/strikes and the
            # complete fall. Resolve deformed geometry, not a bind-pose box.
            evaluated=meshes[0].evaluated_get(bpy.context.evaluated_depsgraph_get())
            floor=min((evaluated.matrix_world@Vector(v)).z for v in evaluated.bound_box)
            matrix=hips.matrix.copy();matrix.translation+=world_to_rig@Vector((0,0,-floor));hips.matrix=matrix
            bpy.context.view_layer.update()
            for b in bones:
                b.rotation_quaternion.normalize()
                for key in ('location','rotation_quaternion','scale'):
                    b.keyframe_insert(key,frame=frame,group=b.name)
        for curve in action_fcurves(action):
            for key in curve.keyframe_points:key.interpolation='LINEAR'
        rig.animation_data.action=None
        track=rig.animation_data.nla_tracks.new();track.name=name
        track.strips.new(name,0,action);track.mute=True
        report[name]={'donor':donor,'seconds':count/scene.render.fps,'rootMotionRemoved':list(net)}
    for track in rig.animation_data.nla_tracks:track.mute=False
    for b in bones:b.matrix_basis.identity()
    export_glb(OUTPUT,rig,meshes)
    OUTPUT.with_suffix('.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'bones':23,'triangles':9994,'clips':report},indent=2))
    print(json.dumps(report),flush=True)


if __name__=='__main__':main()
