"""Preserve the owner's native Mogger skin and bake a complete motion vocabulary.

Missing motions use evaluated Ogre poses, mapped through both skeletons' world
rest matrices. The supplied ground-slam is retained on its own native rig.
No source file, mesh topology, rig or weights are simplified or overwritten.
"""
from pathlib import Path
import hashlib
import json
import math
import statistics
import sys
import tempfile
import zipfile
import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import action_fcurves, export_glb

SOURCE = ROOT.parent/'bible/models/mobs/comunity/mogger.zip'
DONOR = ROOT.parent/'bible/models/mobs/mixamo_rigged/ogre_animated_meshy_skeleton.zip'
DONOR_IDLE = ROOT.parent/'bible/models/mobs/mixamo_rigged/ogre_animated_meshy_idle.zip'
WORK = ROOT/'tmp/mogger-import'
OUTPUT = ROOT/'tmp/asset_src/community_mogger/community_mogger.glb'
SHA = 'fd269fd0cb9685b65751a8ee6ae6196c780adc3ca8df178d695a30087e757e66'
FPS = 60
HEIGHT = 2.4
ENTITY_SCALE = 1.28
SEMANTIC = {'Spine02':'Spine', 'Spine01':'Spine1', 'Spine':'Spine2', 'neck':'Neck'}


def extract(source, folder, suffixes=None):
    folder.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        for item in archive.infolist():
            target=(folder/item.filename).resolve()
            if not target.is_relative_to(folder.resolve()):
                raise ValueError('Archive member escapes workspace')
            if target.suffix.lower() not in ('.fbx', '.png'):
                continue
            if suffixes is None or any(item.filename.endswith(s) for s in suffixes):
                archive.extract(item, folder)


def depth(bone):
    return 1+depth(bone.parent) if bone.parent else 0


def snapshot(rig):
    return {b.name:b.matrix_basis.copy() for b in rig.pose.bones}


def apply(rig, pose):
    for bone in rig.pose.bones:
        bone.matrix_basis=pose[bone.name]
    bpy.context.view_layer.update()


def blend(a,b,t):
    result={}
    for name,m in a.items():
        p,q,s=m.decompose(); pp,qq,ss=b[name].decompose()
        result[name]=Matrix.LocRotScale(p.lerp(pp,t),q.slerp(qq,t),s.lerp(ss,t))
    return result


def floor_height(meshes):
    graph=bpy.context.evaluated_depsgraph_get()
    return min((m.evaluated_get(graph).matrix_world@Vector(v)).z
               for m in meshes for v in m.evaluated_get(graph).bound_box)


def donor_poses(path, rig):
    old=set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=str(path))
    objects=[o for o in bpy.context.scene.objects if o not in old]
    donor=next(o for o in objects if o.type=='ARMATURE')
    source_action=donor.animation_data.action
    bones=sorted(rig.pose.bones,key=depth)
    target_rest={b.name:rig.matrix_world@b.bone.matrix_local for b in bones}
    donor_rest={b.name:donor.matrix_world@b.bone.matrix_local for b in donor.pose.bones}
    target_relative={b.name:b.parent.bone.matrix_local.inverted()@b.bone.matrix_local
                     if b.parent else b.bone.matrix_local.copy() for b in bones}
    inv=rig.matrix_world.inverted()
    height_ratio=target_rest['Hips'].translation.z/donor_rest['mixamorig:Hips'].translation.z
    poses=[]
    for frame in range(round(source_action.frame_range[0]),round(source_action.frame_range[1])+1):
        bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
        solved={}
        for bone in bones:
            name=bone.name; mapped='mixamorig:'+SEMANTIC.get(name,name)
            if mapped in donor.pose.bones:
                world=donor.matrix_world@donor.pose.bones[mapped].matrix
                rotation=(world.to_quaternion()@donor_rest[mapped].to_quaternion().inverted()
                          @target_rest[name].to_quaternion()).normalized()
                if bone.parent:
                    location=(solved[bone.parent.name]@target_relative[name]).translation
                else:
                    location=inv@(target_rest[name].translation+(world.translation-donor_rest[mapped].translation)*height_ratio)
                target=Matrix.LocRotScale(location,(inv.to_quaternion()@rotation).normalized(),Vector((1,1,1)))
            else:
                target=solved[bone.parent.name]@target_relative[name]
            solved[name]=target
            bone.matrix_basis=target_relative[name].inverted()@(solved[bone.parent.name].inverted()@target if bone.parent else target)
        bpy.context.view_layer.update();poses.append(snapshot(rig))
    for obj in objects:
        bpy.data.objects.remove(obj,do_unlink=True)
    return poses


def preview(rig, meshes, actions, selected=None):
    scene=bpy.context.scene
    for track in rig.animation_data.nla_tracks:track.mute=True
    scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.resolution_x=650;scene.render.resolution_y=650;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('MoggerPreviewWorld')
    scene.world.color=(.35,.35,.35)
    world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.45,.45,.45,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006));plane=bpy.context.object
    mat=bpy.data.materials.new('PreviewFloor');mat.diffuse_color=(.24,.26,.28,1);plane.data.materials.append(mat)
    bpy.ops.object.light_add(type='AREA',location=(3,-4,5));bpy.context.object.data.energy=450;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=4
    bpy.ops.object.camera_add(location=(2.8,-4.8,2.6));camera=bpy.context.object
    camera.rotation_euler=(Vector((0,0,.85))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.8;scene.camera=camera
    for name,phase in selected or [('Idle',.4),('Run',.22),('Attack',.55),('Cast',.55),('GroundPound',.55),('GroundPoundRelease',.05),('Order',.4),('Death',1)]:
        action=actions['Mogger_'+name];rig.animation_data.action=action;scene.frame_set(round(action.frame_range[1]*phase));bpy.context.view_layer.update()
        scene.render.filepath=str(WORK/('Mogger_'+name+'.png'));bpy.ops.render.render(write_still=True)
    rig.animation_data.action=None


def main():
    WORK.mkdir(parents=True,exist_ok=True);tempfile.tempdir=str(WORK)
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest()!=SHA:raise RuntimeError('Source fingerprint mismatch')
    extract(SOURCE,WORK/'source')
    extract(DONOR_IDLE,WORK/'donor', ['Animation_Idle_11_withSkin.fbx'])
    extract(DONOR,WORK/'donor',['Animation_Walking_withSkin.fbx','Animation_Running_withSkin.fbx',
                                'Animation_Attack_withSkin.fbx','Animation_Dead_withSkin.fbx'])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source=next((WORK/'source').rglob('*Animation_*.fbx'));bpy.ops.import_scene.fbx(filepath=str(source))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    triangles=sum(p.loop_total-2 for m in meshes for p in m.data.polygons)
    if len(rig.data.bones)!=24 or triangles!=19110:raise RuntimeError('Unexpected Mogger rig or topology')
    native=rig.animation_data.action;native_poses=[];scene=bpy.context.scene
    for frame in range(round(native.frame_range[0]),round(native.frame_range[1])+1):
        scene.frame_set(frame);bpy.context.view_layer.update();native_poses.append(snapshot(rig))
    rig.animation_data.action=None
    for b in rig.pose.bones:b.rotation_mode='QUATERNION';b.matrix_basis.identity()
    bpy.context.view_layer.update()
    material=bpy.data.materials.new('MoggerAuthoredMatte');material.use_nodes=True
    bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=1;bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['Specular IOR Level'].default_value=0
    base=next((WORK/'source').rglob('*texture_0.png'));texture=material.node_tree.nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(str(base));material.node_tree.links.new(texture.outputs['Color'],bsdf.inputs['Base Color'])
    for mesh in meshes:
        mesh.data.materials.clear();mesh.data.materials.append(material);mesh['source_sha256']=SHA;mesh['original_triangles']=19110
        mesh['source']='Owner mogger.zip native animation rig, mesh, weights and base color retained'
    cache={}
    for key,suffix in [('Idle','Idle_11'),('Walk','Walking'),('Run','Running'),('Attack','Attack'),('Death','Dead')]:
        cache[key]=donor_poses(next((WORK/'donor').rglob('*Animation_'+suffix+'_withSkin.fbx')),rig)
    scene.render.fps=FPS;bones=list(rig.pose.bones);hips=rig.pose.bones['Hips'];inv=rig.matrix_world.inverted().to_3x3();report={};actions={}

    def bake(name,poses,seconds,loop=False,death=False,hit=False):
        frames=max(2,round(seconds*FPS));action=bpy.data.actions.new(name);rig.animation_data.action=action
        foot_samples={'LeftFoot':[],'RightFoot':[]}
        for frame in range(frames+1):
            p=frame/frames;t=min(p/.9,1) if death else p;index=t*(len(poses)-1);lo=int(index)
            pose=blend(poses[lo],poses[min(lo+1,len(poses)-1)],index-lo)
            if loop and p>.9:
                u=(p-.9)/.1;pose=blend(pose,poses[0],u*u*(3-2*u))
            if hit:pose={n:m.copy() for n,m in poses[0].items()}
            apply(rig,pose)
            if hit:rig.pose.bones['Spine'].rotation_quaternion@=Quaternion((1,0,0),-.2*math.sin(math.pi*p)**2)
            bpy.context.view_layer.update()
            current=rig.matrix_world@hips.head;matrix=hips.matrix.copy();matrix.translation+=inv@Vector((-current.x,-current.y,0));hips.matrix=matrix;bpy.context.view_layer.update()
            floor=floor_height(meshes);matrix=hips.matrix.copy();matrix.translation+=inv@Vector((0,0,-floor));hips.matrix=matrix;bpy.context.view_layer.update()
            for side in foot_samples:foot_samples[side].append(list(rig.matrix_world@rig.pose.bones[side].head))
            for b in bones:
                b.rotation_quaternion.normalize()
                for key in ('location','rotation_quaternion','scale'):b.keyframe_insert(key,frame=frame,group=b.name)
        for curve in action_fcurves(action):
            for key in curve.keyframe_points:key.interpolation='LINEAR'
        rig.animation_data.action=None;track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,0,action);track.mute=True
        stats={}
        for side,samples in foot_samples.items():
            threshold=min(p[2] for p in samples)+.25*(max(p[2] for p in samples)-min(p[2] for p in samples))
            speeds=[(b[1]-a[1])*FPS for a,b in zip(samples,samples[1:]) if a[2]<=threshold and b[2]<=threshold and b[1]>a[1]]
            stats[side]=statistics.median(speeds) if speeds else 0
        report[name]={'seconds':frames/FPS,'loop':loop,'stanceFootVelocitySourceUnits':stats}
        actions[name]=action
        return stats,action,track

    bake('Mogger_Idle',cache['Idle'],3.2,True)
    bake('Mogger_CombatIdle',cache['Idle'],2.4,True)
    for key,speed in [('Walk',2.5),('Run',5.3)]:
        stats,action,track=bake('Mogger_'+key,cache[key],1,True)
        velocity=statistics.mean(stats.values());rig.animation_data.nla_tracks.remove(track);bpy.data.actions.remove(action)
        seconds=max(.3,velocity*(HEIGHT/1.7)*ENTITY_SCALE/speed)
        stats,_,_=bake('Mogger_'+key,cache[key],seconds,True)
        report['Mogger_'+key]['recommendedReferenceSpeed']=statistics.mean(stats.values())*(HEIGHT/1.7)*ENTITY_SCALE
    bake('Mogger_Attack',cache['Attack'],1.15)
    bake('Mogger_Hit',cache['Idle'],.45,hit=True)
    bake('Mogger_Death',cache['Death'],2.2,death=True)
    bake('Mogger_Cast',native_poses,3)
    bake('Mogger_GroundPound',native_poses,1.4)
    # AoE resolves instantly in the simulation. Retain the full windup for the
    # editor, but start the runtime cue just ahead of the native hand impact.
    release=native_poses[39:]
    for i in range(1,14):
        u=i/13
        release.append(blend(native_poses[-1],cache['Idle'][0],u*u*(3-2*u)))
    bake('Mogger_GroundPoundRelease',release,1.0)
    # A short upright call to nearby allies, sampled from the native raised-arm
    # gesture before the ground strike, and explicitly returned to relaxed idle.
    order_pose={n:m.copy() for n,m in cache['Idle'][0].items()}
    for name in ['LeftShoulder','LeftArm','LeftForeArm','LeftHand',
                 'RightShoulder','RightArm','RightForeArm','RightHand']:
        order_pose[name]=native_poses[18][name].copy()
    gesture=[]
    for i in range(61):
        p=i/60
        if p<.35:
            u=p/.35; pose=blend(cache['Idle'][0],order_pose,u*u*(3-2*u))
        elif p<.5:
            pose=order_pose
        else:
            u=(p-.5)/.5; pose=blend(order_pose,cache['Idle'][0],u*u*(3-2*u))
        gesture.append(pose)
    bake('Mogger_Order',gesture,1.0)
    report['Mogger_GroundPound']['impactSeconds']=.65
    report['Mogger_Cast']['impactSeconds']=1.4
    report['Mogger_GroundPoundRelease']['impactSeconds']=.05
    for track in rig.animation_data.nla_tracks:track.mute=False
    for b in bones:b.matrix_basis.identity()
    scene.frame_set(0);export_glb(OUTPUT,rig,meshes)
    metadata={'sourceSha256':SHA,'bones':24,'triangles':triangles,'sourceHeight':1.7,'suggestedVisualHeight':HEIGHT,'entityScale':ENTITY_SCALE,'baseColorPath':str(base),'clips':report}
    (WORK/'report.json').write_text(json.dumps(metadata,indent=2));OUTPUT.with_suffix('.json').write_text(json.dumps(metadata,indent=2))
    bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'authored.blend'))
    if '--no-preview' not in sys.argv:
        preview(rig,meshes,actions)
    print(json.dumps(metadata),flush=True)


if __name__=='__main__':main()
