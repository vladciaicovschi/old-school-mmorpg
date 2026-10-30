"""Import the three owner-supplied merged animation packs without foreign motion.

Each model uses its own merged FBX mesh, rig, weights, original maps and actions.
Only offline in-place grounding, loop closure, gait timing and corpse holds are
baked. No missing idle, reaction or combat action is invented or borrowed.
Run: blender --background --threads 4 --python this_file.py -- warden treant
The golem supplements its original rig with the owner's separate idle and
additional motion pack, retargeted through evaluated world/rest transforms.
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
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import action_fcurves, export_glb

WORK = ROOT/'tmp/community-native-clips'
SOURCE = ROOT.parent/'bible/models/mobs/comunity'
FPS = 60
MODELS = {
    'warden': {
        'archive':'Meshy_AI__villain_a_full_body_biped.zip',
        'sha256':'633f7cf05452dc630b3ebab366f069b8014f7307534ec624d2f7e1f903a76ca8',
        'bones':62, 'triangles':103815, 'prefix':'WreckWarden_', 'asset':'community_wreck_warden',
        'height':2.6, 'entities':[(1.45,8)], 'idle':'Axe_Breathe_and_Look_Around',
        'combatIdle':'Alert', 'attack':'Shield_Push_Left', 'death':'Dead',
        'loops':{'Alert','Axe_Breathe_and_Look_Around','Idle_5','Walking','Running'},
    },
    'treant': {
        'archive':'Meshy_AI_A_treant_warrior_with_biped.zip',
        'sha256':'fe3fe7b7b59941a61379a535e9f77b9da1b75b551a9af4263066431df1e16cea',
        'bones':28, 'triangles':169831, 'prefix':'TreantWarrior_', 'asset':'community_treant_warrior',
        'height':2.8, 'entities':[(1,6.5)], 'idle':'Idle_11', 'combatIdle':'Idle_5',
        'attack':'Shield_Push_Left', 'death':'Fall_Dead_from_Abdominal_Injury',
        'loops':{'Idle_11','Idle_5','Walking','Running'},
    },
    'golem': {
        'archive':'Meshy_AI_Verdant_Crag_Golem_biped.zip',
        'sha256':'5103fcb35755e29f2d181ddc3dd01dd78b7c7dc1d3d43a546460a5925cfe5279',
        'bones':50, 'triangles':103886, 'prefix':'VerdantGolem_', 'asset':'community_verdant_golem',
        'height':3.4, 'entities':[(1.2,6.5),(1.5,7)], 'idle':'Alert', 'combatIdle':'Idle_5',
        'walk':'Slow_Orc_Walk', 'attack':'Attack', 'death':'dying_backwards',
        'loops':{'Walking','Running','Idle_5','Alert','Casual_Walk','Slow_Orc_Walk','Extra_Walking','Extra_Running'},
        'supplements':[
            {'archive':'Meshy_AI_Verdant_Crag_Golem_biped (1).zip',
             'sha256':'6c307ea404bac7f95c1ac2a0eb37462ce77db0953061249aa542df23e2a77ad8',
             'pattern':'*Animation_Idle_5_withSkin.fbx'},
            {'archive':'Meshy_AI_Verdant_Crag_Golem_biped_additional animations.zip',
             'sha256':'baf6a33ca3cd0dbd91a6e722e15178f0af06a3312afff6f60581bd050a105b4a',
             'pattern':'*Merged_Animations.fbx'},
        ],
    },
}


def extract(archive, folder):
    folder.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as package:
        for item in package.infolist():
            path = (folder/item.filename).resolve()
            if not path.is_relative_to(folder.resolve()):
                raise ValueError('Archive member escapes the extraction folder')
            if path.suffix.lower() in ('.fbx','.png'):
                package.extract(item,folder)


def snapshot(rig):
    return {bone.name:bone.matrix_basis.copy() for bone in rig.pose.bones}


def apply(rig, pose):
    for bone in rig.pose.bones:
        bone.matrix_basis = pose[bone.name]
    bpy.context.view_layer.update()


def blend(a,b,t):
    result = {}
    for name,matrix in a.items():
        p,q,s = matrix.decompose()
        pp,qq,ss = b[name].decompose()
        result[name] = Matrix.LocRotScale(p.lerp(pp,t),q.slerp(qq,t),s.lerp(ss,t))
    return result


def supplemental_poses(key, rig, existing_names):
    """Keep one final skeleton; solve supplied secondary rigs in rest space."""
    poses, seconds, provenance = {}, {}, {}
    scene = bpy.context.scene
    bones = sorted(rig.pose.bones, key=lambda bone: len(bone.parent_recursive))
    for bone in bones:
        bone.matrix_basis.identity()
    bpy.context.view_layer.update()
    target_rest = {b.name: rig.matrix_world @ b.bone.matrix_local for b in bones}
    relative = {b.name: b.parent.bone.matrix_local.inverted() @ b.bone.matrix_local
                if b.parent else b.bone.matrix_local.copy() for b in bones}
    to_rig = rig.matrix_world.inverted()
    for index, supplement in enumerate(MODELS[key].get('supplements', [])):
        archive = SOURCE/supplement['archive']
        if hashlib.sha256(archive.read_bytes()).hexdigest() != supplement['sha256']:
            raise RuntimeError('Supplement fingerprint changed: '+archive.name)
        folder = WORK/key/('supplement-'+str(index))
        extract(archive, folder)
        files = list(folder.rglob(supplement['pattern']))
        if len(files) != 1:
            raise RuntimeError('Expected one supplemental FBX: '+archive.name)
        before_objects = set(bpy.data.objects)
        before_actions = set(bpy.data.actions)
        bpy.ops.import_scene.fbx(filepath=str(files[0]), use_image_search=False)
        added = set(bpy.data.objects)-before_objects
        donor = next(obj for obj in added if obj.type == 'ARMATURE')
        donor_rest = {b.name: donor.matrix_world @ b.bone.matrix_local for b in donor.pose.bones}
        semantic = {b.name.split(':')[-1]: b.name for b in donor.pose.bones}
        hip = next(b for b in bones if b.name.split(':')[-1] == 'Hips')
        source_hip = semantic['Hips']
        ratio = target_rest[hip.name].translation.z/donor_rest[source_hip].translation.z
        direct = (set(donor.pose.bones.keys()) == set(rig.pose.bones.keys()) and
                  max(abs(donor.matrix_world[r][c]-rig.matrix_world[r][c]) for r in range(4) for c in range(4)) < 1e-6 and
                  all(max(abs(donor.data.bones[b.name].matrix_local[r][c]-b.bone.matrix_local[r][c])
                          for r in range(4) for c in range(4)) < 1e-6 for b in bones))
        for action in sorted(set(bpy.data.actions)-before_actions, key=lambda item: item.name):
            native_name = action.name.rsplit('|', 1)[-1]
            name = 'Extra_'+native_name if native_name in existing_names else native_name
            if name in poses:
                raise RuntimeError('Duplicate supplemental action: '+name)
            donor.animation_data.action = action
            if action.slots:
                donor.animation_data.action_slot = action.slots[0]
            start, end = (round(value) for value in action.frame_range)
            seconds[name] = (end-start)/(scene.render.fps/scene.render.fps_base)
            samples = []
            for frame in range(start, end+1):
                scene.frame_set(frame)
                bpy.context.view_layer.update()
                if direct:
                    samples.append({b.name:donor.pose.bones[b.name].matrix_basis.copy() for b in bones})
                    continue
                solved = {}
                for bone in bones:
                    source_name = semantic.get(bone.name.split(':')[-1])
                    if source_name:
                        source_world = donor.matrix_world @ donor.pose.bones[source_name].matrix
                        rotation = (source_world.to_quaternion() @ donor_rest[source_name].to_quaternion().inverted()
                                    @ target_rest[bone.name].to_quaternion()).normalized()
                        location = ((solved[bone.parent.name] @ relative[bone.name]).translation if bone.parent else
                                    to_rig @ (target_rest[bone.name].translation +
                                              (source_world.translation-donor_rest[source_name].translation)*ratio))
                        solved[bone.name] = Matrix.LocRotScale(location, (to_rig.to_quaternion() @ rotation).normalized(), Vector((1,1,1)))
                    else:
                        solved[bone.name] = solved[bone.parent.name] @ relative[bone.name] if bone.parent else relative[bone.name].copy()
                    bone.matrix_basis = relative[bone.name].inverted() @ (solved[bone.parent.name].inverted() @ solved[bone.name] if bone.parent else solved[bone.name])
                bpy.context.view_layer.update()
                samples.append(snapshot(rig))
            poses[name] = samples
            provenance[name] = {'archive':archive.name,'sha256':supplement['sha256'],
                                'nativeAction':native_name,'sourceBones':len(donor.data.bones),
                                'retargeted':not direct}
        for obj in added:
            bpy.data.objects.remove(obj, do_unlink=True)
        for action in set(bpy.data.actions)-before_actions:
            bpy.data.actions.remove(action)
    return poses, seconds, provenance


def floor_height(meshes):
    graph = bpy.context.evaluated_depsgraph_get()
    return min((mesh.evaluated_get(graph).matrix_world @ Vector(corner)).z
               for mesh in meshes for corner in mesh.evaluated_get(graph).bound_box)


def material_from_original(folder,key):
    material = bpy.data.materials.new(key+'_OriginalPBR')
    material.use_nodes = True
    nodes,links = material.node_tree.nodes,material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Roughness'].default_value = 1
    bsdf.inputs['Specular IOR Level'].default_value = 0
    base = next(folder.rglob('*_texture_0.png'))
    for suffix,socket in [('', 'Base Color'),('_normal','Normal'),('_roughness','Roughness'),('_metallic','Metallic')]:
        path = base.with_name(base.stem+suffix+'.png')
        if not path.is_file():
            if suffix:
                continue
            raise RuntimeError('Missing original base-color map')
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(str(path),check_existing=True)
        if suffix:
            tex.image.colorspace_settings.name = 'Non-Color'
        if suffix == '_normal':
            normal = nodes.new('ShaderNodeNormalMap')
            links.new(tex.outputs['Color'],normal.inputs['Color'])
            links.new(normal.outputs['Normal'],bsdf.inputs[socket])
        else:
            links.new(tex.outputs['Color'],bsdf.inputs[socket])
    return material


def preview(key,rig,meshes,actions,selected=None):
    config = MODELS[key]
    scene = bpy.context.scene
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.resolution_x = 650
    scene.render.resolution_y = 650
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('NativePreviewWorld')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.45,.45,.45,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    # Preview the matte runtime surface, retaining all original maps in the GLB.
    for mesh in meshes:
        for material in mesh.data.materials:
            bsdf = material.node_tree.nodes.get('Principled BSDF')
            for socket in ['Roughness','Metallic']:
                for link in list(bsdf.inputs[socket].links):
                    material.node_tree.links.remove(link)
            bsdf.inputs['Roughness'].default_value = 1
            bsdf.inputs['Metallic'].default_value = 0
            bsdf.inputs['Specular IOR Level'].default_value = 0
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006))
    material = bpy.data.materials.new('PreviewFloor')
    material.diffuse_color = (.24,.26,.28,1)
    bpy.context.object.data.materials.append(material)
    bpy.ops.object.light_add(type='AREA',location=(3,-4,5))
    bpy.context.object.data.energy = 450
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = 4
    bpy.ops.object.camera_add(location=(2.8,-4.8,2.6))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0,0,.85))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.8
    scene.camera = camera
    if selected is None:
        selected = [(config['idle'],.35),(config['combatIdle'],.35),('Running',.25),
                    (config['attack'],.5),(config['death'],1)]
    for name,phase in selected:
        if not name:
            continue
        rig.animation_data.action = actions[config['prefix']+name]
        action = rig.animation_data.action
        scene.frame_set(round(action.frame_range[1]*phase))
        bpy.context.view_layer.update()
        scene.render.filepath = str(WORK/(key+'-'+name+'.png'))
        bpy.ops.render.render(write_still=True)
    rig.animation_data.action = None


def build(key):
    config = MODELS[key]
    archive = SOURCE/config['archive']
    if hashlib.sha256(archive.read_bytes()).hexdigest() != config['sha256']:
        raise RuntimeError('Native source fingerprint changed: '+key)
    folder = WORK/key
    extract(archive,folder)
    merged = [path for path in folder.rglob('*Merged_Animations.fbx')
              if not any(part.startswith('supplement-') for part in path.relative_to(folder).parts)]
    if len(merged) != 1:
        raise RuntimeError('Expected one native merged animation FBX: '+key)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(merged[0]))
    rigs = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE']
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if len(rigs) != 1 or len(meshes) != 1:
        raise RuntimeError('Expected one native mesh and armature: '+key)
    rig = rigs[0]
    triangles = sum(poly.loop_total-2 for mesh in meshes for poly in mesh.data.polygons)
    if triangles != config['triangles'] or len(rig.data.bones) != config['bones']:
        raise RuntimeError('Native topology/rig inventory changed: '+key)
    scene = bpy.context.scene
    source_fps = scene.render.fps/scene.render.fps_base
    originals = {action.name.rsplit('|',1)[-1]:action for action in bpy.data.actions}
    cached = {}
    original_seconds = {}
    for name,action in originals.items():
        rig.animation_data.action = action
        if action.slots:
            rig.animation_data.action_slot = action.slots[0]
        frames = []
        start,end = (round(value) for value in action.frame_range)
        for frame in range(start,end+1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            frames.append(snapshot(rig))
        cached[name] = frames
        original_seconds[name] = (end-start)/source_fps
    rig.animation_data.action = None
    native_names = sorted(originals)
    supplemental, durations, provenance = supplemental_poses(key, rig, set(originals))
    cached.update(supplemental)
    original_seconds.update(durations)
    walk_name = config.get('walk', 'Walking')
    missing = [purpose for purpose, name in [('Idle',config['idle']),('Walk',walk_name),('Run','Running'),
               ('Attack',config['attack']),('Death',config['death']),('Hit',None)] if not name or name not in cached]
    print('NATIVE GAPS',key,missing,flush=True)
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'
        bone.matrix_basis.identity()
    bpy.context.view_layer.update()
    source_height = max((mesh.matrix_world@Vector(p)).z for mesh in meshes for p in mesh.bound_box)-min((mesh.matrix_world@Vector(p)).z for mesh in meshes for p in mesh.bound_box)
    material = material_from_original(folder,key)
    for mesh in meshes:
        mesh.data.materials.clear()
        mesh.data.materials.append(material)
        mesh['source_sha256'] = config['sha256']
        mesh['original_triangles'] = triangles
        mesh['original_joint_count'] = config['bones']
        mesh['native_animation_source'] = merged[0].name
        mesh['source'] = 'Owner merged native FBX only; original mesh, Smart Rig, skin and maps'
    semantic = {bone.name.split(':')[-1]:bone.name for bone in rig.pose.bones}
    hips = rig.pose.bones[semantic['Hips']]
    inv = rig.matrix_world.inverted().to_3x3()
    scene.render.fps = FPS
    report,actions = {},{}

    def bake(name,input_poses,seconds,loop=False,death=False):
        centers = []
        for pose in (input_poses[0],input_poses[-1]):
            apply(rig,pose)
            centers.append(rig.matrix_world@hips.head)
        origin = centers[0]
        net = centers[1]-origin
        net.z = 0
        poses = []
        for i,pose in enumerate(input_poses):
            apply(rig,pose)
            matrix = hips.matrix.copy()
            phase = i/max(1,len(input_poses)-1)
            matrix.translation += inv@(Vector((-origin.x,-origin.y,0))-net*phase)
            hips.matrix = matrix
            bpy.context.view_layer.update()
            poses.append(snapshot(rig))
        count = max(2,round(seconds*FPS))
        export_name = config['prefix']+name
        action = bpy.data.actions.new(export_name)
        rig.animation_data.action = action
        feet = {'LeftFoot':[],'RightFoot':[]}
        floors = []
        for frame in range(count+1):
            p = frame/count
            # Preserve the full native fall at its supplied speed, then hold.
            phase = min(frame/FPS/original_seconds[name],1) if death else p
            index = phase*(len(poses)-1)
            lo = int(index)
            pose = blend(poses[lo],poses[min(lo+1,len(poses)-1)],index-lo)
            if loop and p>.9:
                u=(p-.9)/.1
                pose = blend(pose,poses[0],u*u*(3-2*u))
            apply(rig,pose)
            matrix = hips.matrix.copy()
            ground = floor_height(meshes)
            if name in ['Basic_Jump','Spartan_Kick']:
                ground = min(0, ground)
            matrix.translation += inv@Vector((0,0,-ground))
            hips.matrix = matrix
            bpy.context.view_layer.update()
            for side in feet:
                feet[side].append(list(rig.matrix_world@rig.pose.bones[semantic[side]].head))
            floors.append(floor_height(meshes))
            for bone in rig.pose.bones:
                bone.rotation_quaternion.normalize()
                for prop in ['location','rotation_quaternion','scale']:
                    bone.keyframe_insert(prop,frame=frame,group=bone.name)
        for curve in action_fcurves(action):
            for point in curve.keyframe_points:
                point.interpolation = 'LINEAR'
        rig.animation_data.action = None
        track = rig.animation_data.nla_tracks.new()
        track.name = export_name
        track.strips.new(export_name,0,action)
        track.mute = True
        velocities = {}
        for side,samples in feet.items():
            threshold = min(v[2] for v in samples)+.25*(max(v[2] for v in samples)-min(v[2] for v in samples))
            speeds = [(b[1]-a[1])*FPS for a,b in zip(samples,samples[1:]) if a[2]<=threshold and b[2]<=threshold and b[1]>a[1]]
            velocities[side] = statistics.median(speeds) if speeds else 0
        stats = {'nativeAction':name,'originalSeconds':original_seconds[name],'seconds':count/FPS,
                 'loop':loop,'nativeOnly':name not in provenance,'stanceFootVelocitySourceUnits':velocities,
                 'floorRange':[min(floors),max(floors)]}
        if name in provenance:
            stats['suppliedMotionSource'] = provenance[name]
        if name in [walk_name,'Running']:
            stats['entityReferences'] = [{'scale':scale,'moveSpeed':speed,'referenceSpeed':statistics.mean(velocities.values())*config['height']/source_height*scale}
                                         for scale,speed in config['entities']]
        report[export_name] = stats
        actions[export_name] = action
        print(key,export_name,stats,flush=True)
        return stats,action,track

    for name,poses in cached.items():
        death = name == config['death']
        seconds = original_seconds[name]+(.25 if death else 0)
        if name in [walk_name,'Running']:
            stats,action,track = bake(name,poses,1,True)
            scale,speed = config['entities'][0]
            target = speed*.35/.85 if name == walk_name else speed/1.2
            natural = statistics.mean(stats['stanceFootVelocitySourceUnits'].values())*config['height']/source_height*scale
            seconds = max(.25,natural/target)
            rig.animation_data.nla_tracks.remove(track)
            bpy.data.actions.remove(action)
        bake(name,poses,seconds,name in config['loops'],death)
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()
    scene.frame_set(0)
    output = ROOT/f"tmp/asset_src/{config['asset']}/{config['asset']}.glb"
    export_glb(output,rig,meshes)
    clipmap = {'idle':config['prefix']+config['idle'] if config['idle'] else None,
               'combatIdle':config['prefix']+config['combatIdle'] if config['combatIdle'] else None,
               'walk':config['prefix']+walk_name,'run':config['prefix']+'Running',
               'attack':[config['prefix']+config['attack']], 'death':config['prefix']+config['death']}
    metadata = {'key':key,'sourceSha256':config['sha256'],'sourceArchive':config['archive'],
                'sourceFBX':merged[0].name,'sourceFPS':source_fps,'bones':config['bones'],'triangles':triangles,
                'sourceHeight':source_height,'visualHeight':config['height'],
                'entities':[{'scale':s,'moveSpeed':v} for s,v in config['entities']],
                'nativeInputActions':native_names,'supplementalActions':provenance,'missingNativeActions':missing,
                'publishBlocked':config.get('publishBlocked'),'suggestedClipMap':clipmap,'clips':report}
    (WORK/(key+'-native-report.json')).write_text(json.dumps(metadata,indent=2))
    output.with_suffix('.json').write_text(json.dumps(metadata,indent=2))
    spec={'items':[{'src':str(output.relative_to(ROOT)).replace('\\','/'),
                    'out':f"models/creatures/{config['asset']}.glb",'type':'character',
                    'maxTex':2048,'keepExtras':True,'keepClips':list(actions)}]}
    (ROOT/f"scripts/assets/specs/{config['asset']}.json").write_text(json.dumps(spec,indent=2)+'\n')
    if '--save-blend' in sys.argv:
        bpy.ops.wm.save_as_mainfile(filepath=str(WORK/(key+'-native.blend')))
    return rig,meshes,actions,metadata


def main(keys=None):
    WORK.mkdir(parents=True,exist_ok=True)
    tempfile.tempdir = str(WORK)
    args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    selected = keys or [arg for arg in args if not arg.startswith('--')] or ['warden','treant']
    for key in selected:
        if key not in MODELS:
            raise ValueError('Unknown native model: '+key)
        rig,meshes,actions,metadata = build(key)
        if metadata['publishBlocked']:
            print('PUBLISH BLOCKED:',key,metadata['publishBlocked'],flush=True)
        if '--preview' in args:
            preview(key,rig,meshes,actions)


if __name__ == '__main__':
    main()
