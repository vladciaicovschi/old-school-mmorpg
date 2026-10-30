"""Import the owner's infected mushroom without changing skin or geometry.

The native attack FBX supplies the final 66-joint rig, mesh and attack. Other
motions are baked from evaluated mushroom donor poses with explicit rest-space
orientation remaps and target proportions. No raw cross-rig curves are copied.
Run in headless Blender, then build the community_sporeling_infected asset spec.
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

SOURCE = ROOT.parent/'bible/models/mobs/comunity/sporling_infected.zip'
DONOR_SOURCE = ROOT.parent/'bible/models/mobs/comunity/sporling.zip'
WORK = ROOT/'tmp/infected-sporeling'
OUTPUT = ROOT/'tmp/asset_src/community_sporeling_infected/community_sporeling_infected.glb'
EXPECTED_SHA = 'a40bb42c1ca09bdf5d6d136cf41d8e8082f0d2982601c30eda7eb759918449ba'
FPS = 120


def extract(source, folder):
    folder.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        for item in archive.infolist():
            target = (folder/item.filename).resolve()
            if not target.is_relative_to(folder.resolve()):
                raise ValueError('Archive member escapes extraction directory')
            if target.suffix.lower() in ('.fbx', '.png'):
                archive.extract(item, folder)


def depth(bone):
    return 1+depth(bone.parent) if bone.parent else 0


def load_native(folder):
    bpy.ops.import_scene.fbx(filepath=str(next(folder.rglob('*Triple_Combo_Attack_withSkin.fbx'))))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if len(rig.data.bones) != 66 or sum(sum(p.loop_total-2 for p in m.data.polygons) for m in meshes) != 104386:
        raise RuntimeError('Unexpected infected mushroom rig/topology')
    return rig, meshes


def snapshot(rig):
    return {b.name: b.matrix_basis.copy() for b in rig.pose.bones}


def apply(rig, pose):
    for bone in rig.pose.bones:
        bone.matrix_basis = pose[bone.name]
    bpy.context.view_layer.update()


def lerp_pose(a, b, t):
    result = {}
    for name, matrix in a.items():
        p, q, s = matrix.decompose()
        pp, qq, ss = b[name].decompose()
        result[name] = Matrix.LocRotScale(p.lerp(pp, t), q.slerp(qq, t), s.lerp(ss, t))
    return result


def floor_height(meshes):
    graph = bpy.context.evaluated_depsgraph_get()
    return min((m.evaluated_get(graph).matrix_world @ Vector(v)).z
               for m in meshes for v in m.evaluated_get(graph).bound_box)


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    local_temp = WORK/'blender-temp'
    local_temp.mkdir(exist_ok=True)
    tempfile.tempdir = str(local_temp)
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED_SHA:
        raise RuntimeError('Unexpected source archive fingerprint')
    extract(SOURCE, WORK/'source')
    extract(DONOR_SOURCE, WORK/'donor')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig, meshes = load_native(WORK/'source')
    scene = bpy.context.scene
    native = rig.animation_data.action
    native_poses = []
    for frame in range(round(native.frame_range[0]), round(native.frame_range[1])+1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        native_poses.append(snapshot(rig))
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'
        bone.matrix_basis.identity()
    bpy.context.view_layer.update()
    material = bpy.data.materials.new('CommunityInfectedSporelingAuthored')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    base = next((WORK/'source').rglob('*_texture_0.png'))
    for suffix, socket in [('', 'Base Color'), ('_normal', 'Normal'), ('_roughness', 'Roughness'), ('_metallic', 'Metallic')]:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(str(base.with_name(base.stem+suffix+'.png')), check_existing=True)
        if suffix:
            tex.image.colorspace_settings.name = 'Non-Color'
        if suffix == '_normal':
            node = nodes.new('ShaderNodeNormalMap')
            links.new(tex.outputs['Color'], node.inputs['Color'])
            links.new(node.outputs['Normal'], bsdf.inputs[socket])
        else:
            links.new(tex.outputs['Color'], bsdf.inputs[socket])
    for mesh in meshes:
        mesh.data.materials.clear()
        mesh.data.materials.append(material)
        mesh['source_sha256'] = EXPECTED_SHA
        mesh['original_triangles'] = 104386
        mesh['source'] = 'Owner sporling_infected.zip; original animated FBX mesh, rig, skin and PBR'

    existing = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=str(next((WORK/'donor').rglob('*Merged_Animations.fbx'))))
    donor_objects = [o for o in bpy.context.scene.objects if o not in existing]
    donor = next(o for o in donor_objects if o.type == 'ARMATURE')
    donor_actions = {a.name.rsplit('|', 1)[-1]: a for a in bpy.data.actions if a != native}
    bones = sorted(rig.pose.bones, key=depth)
    target_rest = {b.name: rig.matrix_world @ b.bone.matrix_local for b in bones}
    donor_rest = {b.name: donor.matrix_world @ b.bone.matrix_local for b in donor.pose.bones}
    target_relative = {b.name: b.parent.bone.matrix_local.inverted() @ b.bone.matrix_local
                       if b.parent else b.bone.matrix_local.copy() for b in bones}
    hips = rig.pose.bones['mixamorig:Hips']
    world_to_rig = rig.matrix_world.inverted()
    height_ratio = target_rest[hips.name].translation.z/donor_rest[hips.name].translation.z
    cache = {}
    for key in ['Idle_11', 'Idle_5', 'Walking', 'Running', 'Shot_and_Slow_Fall_Backward']:
        source_action = donor_actions[key]
        donor.animation_data.action = source_action
        poses = []
        for frame in range(round(source_action.frame_range[0]), round(source_action.frame_range[1])+1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            solved = {}
            for bone in bones:
                name = bone.name
                if name in donor.pose.bones:
                    source_world = donor.matrix_world @ donor.pose.bones[name].matrix
                    rotation = (source_world.to_quaternion() @ donor_rest[name].to_quaternion().inverted()
                                @ target_rest[name].to_quaternion()).normalized()
                    if bone.parent:
                        location = (solved[bone.parent.name] @ target_relative[name]).translation
                    else:
                        location = world_to_rig @ (target_rest[name].translation +
                                   (source_world.translation-donor_rest[name].translation)*height_ratio)
                    target_matrix = Matrix.LocRotScale(location, (world_to_rig.to_quaternion() @ rotation).normalized(), Vector((1, 1, 1)))
                else:
                    target_matrix = solved[bone.parent.name] @ target_relative[name]
                solved[name] = target_matrix
                basis = target_relative[name].inverted() @ (solved[bone.parent.name].inverted() @ target_matrix if bone.parent else target_matrix)
                bone.matrix_basis = basis
            bpy.context.view_layer.update()
            poses.append(snapshot(rig))
        cache[key] = poses
    for obj in donor_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    donor = None
    scene.render.fps = FPS
    report = {}

    def bake(name, poses, seconds, loop, death=False, hit=False, native_attack=False):
        frames = max(2, round(seconds*FPS))
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        foot_samples = {'LeftFoot': [], 'RightFoot': []}
        # Eliminate source horizontal travel while retaining genuine vertical bob.
        centers = []
        for pose in (poses[0], poses[-1]):
            apply(rig, pose)
            centers.append(rig.matrix_world @ hips.head)
        origin = centers[0].copy()
        drift = centers[-1]-centers[0]
        drift.z = 0
        if loop:
            drift = Vector((0, 0, 0))
        for frame in range(frames+1):
            p = frame/frames
            t = min(1, p/.92) if death else p
            index = t*(len(poses)-1)
            lo = int(index)
            pose = lerp_pose(poses[lo], poses[min(lo+1, len(poses)-1)], index-lo)
            if loop and p > .9:
                u = (p-.9)/.1
                pose = lerp_pose(pose, poses[0], u*u*(3-2*u))
            if hit:
                pose = {n: m.copy() for n, m in poses[0].items()}
            apply(rig, pose)
            if hit:
                rig.pose.bones['mixamorig:Spine2'].rotation_quaternion @= Quaternion((1, 0, 0), -.18*math.sin(math.pi*p)**2)
            current = rig.matrix_world @ hips.head
            correction = Vector((-origin.x, -origin.y, 0))-drift*t
            if native_attack:
                # Native combo translates/turns extensively. Keep its gesture but
                # pin its hips horizontally for simulation-driven melee movement.
                correction = Vector((-current.x, -current.y, 0))
            matrix = hips.matrix.copy()
            matrix.translation += world_to_rig.to_3x3() @ correction
            hips.matrix = matrix
            bpy.context.view_layer.update()
            floor = floor_height(meshes)
            matrix = hips.matrix.copy()
            matrix.translation += world_to_rig.to_3x3() @ Vector((0, 0, -floor))
            hips.matrix = matrix
            bpy.context.view_layer.update()
            for side in foot_samples:
                foot_samples[side].append(list(rig.matrix_world @ rig.pose.bones['mixamorig:'+side].head))
            for bone in bones:
                bone.rotation_quaternion.normalize()
                for key in ('location', 'rotation_quaternion', 'scale'):
                    bone.keyframe_insert(key, frame=frame, group=bone.name)
        for curve in action_fcurves(action):
            for key in curve.keyframe_points:
                key.interpolation = 'LINEAR'
        rig.animation_data.action = None
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, action)
        track.mute = True
        stats = {}
        for side, samples in foot_samples.items():
            threshold = min(p[2] for p in samples)+.25*(max(p[2] for p in samples)-min(p[2] for p in samples))
            velocities = [(b[1]-a[1])*FPS for a,b in zip(samples, samples[1:]) if a[2] <= threshold and b[2] <= threshold and b[1] > a[1]]
            stats[side] = statistics.median(velocities) if velocities else 0
        report[name] = {'seconds': frames/FPS, 'loop': loop, 'stanceFootVelocitySourceUnits': stats}
        return stats, action, track

    bake('Infected_Idle', cache['Idle_11'], 3.2, True)
    bake('Infected_CombatIdle', cache['Idle_5'], 2.4, True)
    for source, name, target_speed in [('Walking', 'Infected_Walk', 1.27), ('Running', 'Infected_Run', 4.8)]:
        stats, action, track = bake(name, cache[source], 1, True)
        velocity = statistics.mean(stats.values())
        rig.animation_data.nla_tracks.remove(track)
        bpy.data.actions.remove(action)
        seconds = max(1/FPS, velocity*(1.45/1.7)*.85/target_speed)
        stats, _, _ = bake(name, cache[source], seconds, True)
        report[name]['recommendedReferenceSpeedAtHeight1_45Scale0_85'] = statistics.mean(stats.values())*(1.45/1.7)*.85
    # Keep complete original combination for animation-editor inspection. Runtime
    # uses the opening sweep with a short recovery, rather than three hits per swing.
    single = native_poses[:43]
    for i in range(1, 13):
        u = i/12
        single.append(lerp_pose(single[42], native_poses[0], u*u*(3-2*u)))
    bake('Infected_Attack', single, 1.2, False, native_attack=True)
    bake('Infected_Combo', native_poses, 4.3, False, native_attack=True)
    bake('Infected_Hit', cache['Idle_11'], .45, False, hit=True)
    bake('Infected_Death', cache['Shot_and_Slow_Fall_Backward'], 2.2, False, death=True)
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    for bone in bones:
        bone.matrix_basis.identity()
    scene.frame_set(0)
    export_glb(OUTPUT, rig, meshes)
    metadata = {'sourceSha256': EXPECTED_SHA, 'bones': 66, 'triangles': 104386,
                'sourceHeight': 1.7, 'suggestedVisualHeight': 1.45, 'entityScale': .85,
                'baseColorPath': str(base), 'clips': report}
    OUTPUT.with_suffix('.json').write_text(json.dumps(metadata, indent=2))
    (WORK/'report.json').write_text(json.dumps(metadata, indent=2))
    bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'authored.blend'))
    print(json.dumps(metadata), flush=True)


if __name__ == '__main__':
    main()
