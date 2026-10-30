"""Import only the infected mushroom's supplied merged native animation pack.

The merged FBX mesh and its own 66-joint rig stay together. No ordinary mushroom
or unrelated animation is loaded. All supplied actions are retained; supplemental
Hit comes from the owner's separate exact-rig reaction pack. Native locomotion is retimed for the live
mob scale, loops close, full death lands and holds, and jump keeps its airtime.
"""
from pathlib import Path
import hashlib
import json
import statistics
import sys
import tempfile
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import action_fcurves, export_glb
from blender_import_community_native import extract, snapshot, apply, blend, floor_height, material_from_original

SOURCE = ROOT.parent/'bible/models/mobs/comunity/sporling-infected.zip'
SHA = '18559f9d58a1c88e9ac8d904e7e200931cc2e26b866b6eefc9138625cac2689b'
REACTION_SOURCE = ROOT.parent/'bible/models/mobs/comunity/sporling-reaction.zip'
REACTION_SHA = 'be163d6475363392f26bb9e61dffaed2dccd734277072435a063738c00c679d0'
WORK = ROOT/'tmp/infected-sporeling-native'
OUTPUT = ROOT/'tmp/asset_src/community_sporeling_infected/community_sporeling_infected.glb'
FPS = 120
HEIGHT = 1.45
SCALE = .85
MOVE_SPEED = 7.5
ALIASES = {
    'Idle_8':'Infected_Idle', 'Idle_5':'Infected_CombatIdle',
    'Walking':'Infected_Walk', 'Running':'Infected_Run',
    'dying_backwards':'Infected_Death', 'Hit_Reaction':'Infected_Hit',
}
LOOPS = {'Idle_8','Idle_5','Walking','Running'}
EXPECTED_NATIVE = {
    'Axe_Spin_Attack','Basic_Jump','Charged_Slash','dying_backwards','Idle_5','Idle_8',
    'Left_Hook_from_Guard','Proud_Strut','Right_Hand_Sword_Slash','Running','Simple_Kick',
    'Spartan_Kick','Triple_Combo_Attack','Walking',
}


def load_reaction(rig):
    if hashlib.sha256(REACTION_SOURCE.read_bytes()).hexdigest()!=REACTION_SHA:
        raise RuntimeError('Provided reaction archive fingerprint changed')
    folder=WORK/'reaction'
    extract(REACTION_SOURCE,folder)
    existing=set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=str(next(folder.rglob('*Hit_Reaction*.fbx'))))
    objects=[obj for obj in bpy.context.scene.objects if obj not in existing]
    source=next(obj for obj in objects if obj.type=='ARMATURE')
    same_bones=set(rig.data.bones.keys())==set(source.data.bones.keys())
    object_error=max(abs(rig.matrix_world[i][j]-source.matrix_world[i][j]) for i in range(4) for j in range(4))
    rest_error=0
    parents_equal=True
    for bone in rig.data.bones:
        other=source.data.bones.get(bone.name)
        if not other:
            continue
        parents_equal &= (bone.parent.name if bone.parent else None)==(other.parent.name if other.parent else None)
        rest_error=max(rest_error,max(abs(bone.matrix_local[i][j]-other.matrix_local[i][j]) for i in range(4) for j in range(4)))
    if not same_bones or not parents_equal or object_error>1e-6 or rest_error>1e-5:
        raise RuntimeError('Provided reaction no longer has the exact native rig; inspect before adapting')
    action=source.animation_data.action
    fps=bpy.context.scene.render.fps/bpy.context.scene.render.fps_base
    start,end=(round(value)for value in action.frame_range)
    poses=[]
    for frame in range(start,end+1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        poses.append(snapshot(source))
    source.animation_data.action=None
    for obj in objects:
        bpy.data.objects.remove(obj,do_unlink=True)
    provenance={'archive':REACTION_SOURCE.name,'sha256':REACTION_SHA,'nativeAction':'Hit_Reaction',
                'frames':[start,end],'seconds':(end-start)/fps,'exactNativeRig':True,
                'maxLocalRestError':rest_error,'armatureTransformError':object_error,'retargeted':False}
    print('SUPPLIED REACTION',provenance,flush=True)
    return poses,(end-start)/fps,provenance


def build():
    WORK.mkdir(parents=True,exist_ok=True)
    tempfile.tempdir = str(WORK)
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest()!=SHA:
        raise RuntimeError('Infected sporeling source fingerprint changed')
    folder = WORK/'source'
    extract(SOURCE,folder)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    merged = next(folder.rglob('*Merged_Animations.fbx'))
    bpy.ops.import_scene.fbx(filepath=str(merged))
    rigs = [obj for obj in bpy.context.scene.objects if obj.type=='ARMATURE']
    meshes = [obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    if len(rigs)!=1 or len(meshes)!=1:
        raise RuntimeError('Expected exactly one native rig and mesh')
    rig = rigs[0]
    triangles = sum(poly.loop_total-2 for mesh in meshes for poly in mesh.data.polygons)
    if len(rig.data.bones)!=66 or triangles!=104386:
        raise RuntimeError('Infected source topology or bone inventory changed')
    scene = bpy.context.scene
    source_fps = scene.render.fps/scene.render.fps_base
    originals = {action.name.rsplit('|',1)[-1]:action for action in bpy.data.actions}
    if set(originals)!=EXPECTED_NATIVE:
        raise RuntimeError('Native action inventory changed; review missing states before import')
    print('Primary pack has no Hit; verifying the separate owner-provided native reaction',flush=True)
    cached,original_seconds = {},{}
    for name,action in originals.items():
        rig.animation_data.action = action
        if action.slots:
            rig.animation_data.action_slot = action.slots[0]
        start,end = (round(value) for value in action.frame_range)
        poses = []
        for frame in range(start,end+1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            poses.append(snapshot(rig))
        cached[name] = poses
        original_seconds[name] = (end-start)/source_fps
    rig.animation_data.action = None
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'
        bone.matrix_basis.identity()
    bpy.context.view_layer.update()
    reaction,reaction_seconds,reaction_provenance=load_reaction(rig)
    cached['Hit_Reaction']=reaction
    original_seconds['Hit_Reaction']=reaction_seconds
    source_height = max((mesh.matrix_world@Vector(p)).z for mesh in meshes for p in mesh.bound_box)-min((mesh.matrix_world@Vector(p)).z for mesh in meshes for p in mesh.bound_box)
    material = material_from_original(folder,'InfectedSporelingNative')
    for mesh in meshes:
        mesh.data.materials.clear()
        mesh.data.materials.append(material)
        mesh['source_sha256'] = SHA
        mesh['original_triangles'] = triangles
        mesh['original_joint_count'] = 66
        mesh['native_animation_source'] = merged.name
        mesh['reaction_sha256'] = REACTION_SHA
        mesh['source'] = 'Owner sporling-infected.zip merged native FBX, original geometry, Smart Rig, skin and PBR'
    scene.render.fps = FPS
    hips = rig.pose.bones['mixamorig:Hips']
    inv = rig.matrix_world.inverted().to_3x3()
    report,actions = {},{}

    def bake(name,input_poses,seconds,loop=False,death=False,export_name=None):
        centers = []
        for pose in [input_poses[0],input_poses[-1]]:
            apply(rig,pose)
            centers.append(rig.matrix_world@hips.head)
        origin = centers[0]
        net = centers[1]-origin
        net.z = 0
        poses = []
        for i,pose in enumerate(input_poses):
            apply(rig,pose)
            matrix = hips.matrix.copy()
            matrix.translation += inv@(Vector((-origin.x,-origin.y,0))-net*i/max(1,len(input_poses)-1))
            hips.matrix = matrix
            bpy.context.view_layer.update()
            poses.append(snapshot(rig))
        apply(rig,poses[0])
        initial_floor = floor_height(meshes)
        count = max(2,round(seconds*FPS))
        export_name = export_name or ALIASES.get(name,'Infected_'+name)
        action = bpy.data.actions.new(export_name)
        rig.animation_data.action = action
        feet = {'LeftFoot':[],'RightFoot':[]}
        floors = []
        for frame in range(count+1):
            phase = frame/count
            sample_phase = min(frame/FPS/original_seconds[name],1) if death else phase
            index = sample_phase*(len(poses)-1)
            lo = int(index)
            pose = blend(poses[lo],poses[min(lo+1,len(poses)-1)],index-lo)
            if loop and phase>.9:
                t=(phase-.9)/.1
                pose=blend(pose,poses[0],t*t*(3-2*t))
            apply(rig,pose)
            floor = floor_height(meshes)
            # The native jump must leave the floor. Remove its initial floor
            # offset and prevent landing penetration, never flatten its flight.
            shift = max(-initial_floor,-floor) if name=='Basic_Jump' else -floor
            matrix = hips.matrix.copy()
            matrix.translation += inv@Vector((0,0,shift))
            hips.matrix = matrix
            bpy.context.view_layer.update()
            for side in feet:
                feet[side].append(list(rig.matrix_world@rig.pose.bones['mixamorig:'+side].head))
            floors.append(floor_height(meshes))
            for bone in rig.pose.bones:
                bone.rotation_quaternion.normalize()
                for prop in ['location','rotation_quaternion','scale']:
                    bone.keyframe_insert(prop,frame=frame,group=bone.name)
        for curve in action_fcurves(action):
            for point in curve.keyframe_points:
                point.interpolation='LINEAR'
        rig.animation_data.action = None
        track = rig.animation_data.nla_tracks.new()
        track.name = export_name
        track.strips.new(export_name,0,action)
        track.mute = True
        velocities = {}
        for side,samples in feet.items():
            threshold=min(v[2]for v in samples)+.25*(max(v[2]for v in samples)-min(v[2]for v in samples))
            speeds=[(b[1]-a[1])*FPS for a,b in zip(samples,samples[1:]) if a[2]<=threshold and b[2]<=threshold and b[1]>a[1]]
            velocities[side] = statistics.median(speeds) if speeds else 0
        stats={'nativeAction':name,'originalSeconds':original_seconds[name], 'seconds':count/FPS,
               'nativeOnly':True,'loop':loop,'stanceFootVelocitySourceUnits':velocities,
               'floorRange':[min(floors),max(floors)],
               'sourceArchive':REACTION_SOURCE.name if name=='Hit_Reaction' else SOURCE.name}
        if name in ['Walking','Running']:
            stats['recommendedReferenceSpeed']=statistics.mean(velocities.values())*HEIGHT/source_height*SCALE
        if name=='Basic_Jump':
            stats['nativeAirtimePreserved']=True
        report[export_name]=stats
        actions[export_name]=action
        print(export_name,stats,flush=True)
        return stats,action,track

    for name,poses in cached.items():
        death = name=='dying_backwards'
        seconds = original_seconds[name]+(.25 if death else 0)
        if name in ['Walking','Running']:
            stats,action,track=bake(name,poses,1,True)
            target=MOVE_SPEED*.35/.85 if name=='Walking' else MOVE_SPEED/1.4
            natural=statistics.mean(stats['stanceFootVelocitySourceUnits'].values())*HEIGHT/source_height*SCALE
            seconds=max(1/FPS,natural/target)
            rig.animation_data.nla_tracks.remove(track)
            bpy.data.actions.remove(action)
        bake(name,poses,seconds,name in LOOPS,death)
    # Keep only the first complete native combo strike and its low-handed
    # recovery. The next source phrase begins a spin; no recovery is invented.
    bake('Triple_Combo_Attack',cached['Triple_Combo_Attack'][:29],28/30,export_name='Infected_Attack')
    report['Infected_Attack']['sourceFrameRange']=[1,29]
    report['Infected_Attack']['nativeSliceOnly']=True
    for track in rig.animation_data.nla_tracks:
        track.mute=False
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()
    scene.frame_set(0)
    export_glb(OUTPUT,rig,meshes)
    metadata={'sourceSha256':SHA,'sourceArchive':SOURCE.name,'sourceFBX':merged.name,'sourceFPS':source_fps,
              'bones':66,'triangles':triangles,'sourceHeight':source_height,'visualHeight':HEIGHT,
              'entityScale':SCALE,'moveSpeed':MOVE_SPEED,'missingNativeActions':[],
              'missingPrimaryPackActions':['Hit'],'reactionSource':reaction_provenance,
              'supplementalInputActions':['Hit_Reaction'],
              'suggestedGait':{'runEnter':3.5,'runExit':3.0},'nativeInputActions':sorted(originals),
              'semanticAliases':ALIASES,'clips':report}
    (WORK/'report.json').write_text(json.dumps(metadata,indent=2))
    OUTPUT.with_suffix('.json').write_text(json.dumps(metadata,indent=2))
    spec={'items':[{'src':str(OUTPUT.relative_to(ROOT)).replace('\\','/'),
                    'out':'models/creatures/community_sporeling_infected.glb','type':'character',
                    'maxTex':2048,'keepExtras':True,'keepClips':list(actions)}]}
    (ROOT/'scripts/assets/specs/community_sporeling_infected.json').write_text(json.dumps(spec,indent=2)+'\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'native.blend'))
    return rig,meshes,actions,metadata


if __name__=='__main__':
    build()
