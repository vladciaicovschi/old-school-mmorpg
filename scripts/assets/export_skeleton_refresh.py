"""Import the October skeleton refresh using original maps and authored rigs."""
import argparse
import hashlib
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/anim'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import action_fcurves, export_glb
import export_meshy_test_minions as shared

BIBLE = ROOT.parent / 'bible/models'
WORK = ROOT / 'tmp/asset_src/skeleton_refresh'

NATIVE_CLIP_NAMES = {
    'dev_skeleton_caster_v3': {
        'Fall_Dead_from_Abdomi_050c268': 'CasterV3_Death',
        'Idle_11': 'CasterV3_Idle',
        'Running': 'CasterV3_Run',
        'Walking': 'CasterV3_Walk',
        'walking_2_inplace': 'CasterV3_WalkInPlace',
        **{f'mage_soell_cast{suffix}': f'CasterV3_Cast{suffix}' for suffix in ('', '_1', '_2', '_3', '_4', '_5', '_6', '_7', '_8')},
    },
    'dev_skeleton_rogue_v3': {
        'Axe_Spin_Attack': 'RogueV3_AxeSpinAttack',
        'Basic_Jump': 'RogueV3_Jump',
        'Dead': 'RogueV3_Death',
        'Double_Combo_Attack': 'RogueV3_DoubleComboAttack',
        'Idle_11': 'RogueV3_Idle',
        'Running': 'RogueV3_Run',
        'Triple_Combo_Attack': 'RogueV3_TripleComboAttack',
        'Walking': 'RogueV3_Walk',
        'walking_2_inplace': 'RogueV3_WalkInPlace',
    },
}

def maps_from(folder, target):
    target.mkdir(parents=True, exist_ok=True)
    for kind in ('base', 'normal', 'metallic', 'roughness'):
        files = [p for p in folder.glob('*.png') if not p.stem.endswith('_metallic_roughness') and (
            p.stem.endswith('_' + kind) if kind != 'base' else
            not any(p.stem.endswith('_' + k) for k in ('normal', 'metallic', 'roughness')))]
        assert len(files) == 1, (kind, files)
        shutil.copy2(files[0], target / (kind + '.png'))
    return target

def extract(archive, name):
    target = WORK / 'sources' / name
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as package:
        package.extractall(target)
    return target

def native(name, archive):
    source = extract(archive, name)
    fbx = next(source.rglob('*Merged_Animations.fbx'))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(fbx), use_anim=True)
    rigs = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    assert len(rigs) == len(meshes) == 1
    rig, mesh = rigs[0], meshes[0]
    assert mesh.vertex_groups and mesh.data.uv_layers
    assert all(abs(s - 1) < 1e-5 for o in (rig, mesh) for s in o.scale)
    actions = list(bpy.data.actions)
    rig.animation_data_clear()
    rig.animation_data_create()
    rig.name, mesh.name = name + '_Rig', name + '_Body'
    mesh.data.name = mesh.name
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    before = len(mesh.data.polygons)
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    if before > 60000:
        mod = mesh.modifiers.new('CharacterBudget', 'DECIMATE')
        mod.ratio = 60000 / before
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    mesh.data.validate()
    rig.data.pose_position = 'POSE'
    texture_dir = maps_from(fbx.parent, WORK / 'maps' / name)
    mesh.data.materials.clear()
    mesh.data.materials.append(shared.build_material(name, texture_dir))
    for poly in mesh.data.polygons:
        poly.material_index = 0
    hips = next((b for b in rig.data.bones if b.name.split(':')[-1] == 'Hips'), None)
    assert hips
    # Native clips use this exact bind rig. Project translation onto world up
    # in the root's own axes, retaining authored bounce without world travel.
    local_up = hips.matrix_local.to_3x3().inverted() @ Vector((0, 0, 1))
    local_up.normalize()
    root_path = f'pose.bones["{hips.name}"].location'
    clips = []
    for action in actions:
        clip = action.name.split('|')[-1]
        clip = NATIVE_CLIP_NAMES[name][clip]
        action.name = clip
        curves = [c for c in action_fcurves(action) if c.data_path == root_path]
        if len(curves) == 3:
            curves.sort(key=lambda c: c.array_index)
            start, end = map(int, action.frame_range)
            locations = {f: Vector([c.evaluate(f) for c in curves]) for f in range(start,end+1)}
            anchor = locations[start]
            for curve in curves:
                for point in curve.keyframe_points:
                    f = int(round(point.co.x))
                    delta = locations[f] - anchor
                    value = (anchor + local_up * delta.dot(local_up))[curve.array_index]
                    point.co.y = point.handle_left.y = point.handle_right.y = value
                curve.update()
        track = rig.animation_data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, 0, action)
        strip.name = clip
        clips.append({'name':clip, 'frames':list(action.frame_range)})
    rig['source_archive'] = str(archive.relative_to(BIBLE))
    rig['animation_source'] = 'Native Meshy merged actions on their original skeleton'
    rig['source_map_sha256'] = json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in texture_dir.glob('*.png')}, sort_keys=True)
    out = ROOT / 'tmp/asset_src/npcs' / name
    out.mkdir(parents=True,exist_ok=True)
    export_glb(out / (name + '.glb'), rig, [mesh])
    report = {'id':name,'source':str(fbx),'trianglesBefore':before,'triangles':len(mesh.data.polygons),'bones':len(rig.data.bones),'clips':clips,'maps':str(texture_dir)}
    (out / (name + '.json')).write_text(json.dumps(report,indent=2))
    print(json.dumps(report),flush=True)

def main():
    WORK.mkdir(parents=True, exist_ok=True)
    tempfile.tempdir = str(WORK)
    parser = argparse.ArgumentParser()
    parser.add_argument('--only',required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    if args.only in ('dev_skeleton_caster_v3','dev_skeleton_rogue_v3'):
        stem = 'caster_v3' if 'caster' in args.only else 'rogue_v3'
        native(args.only, BIBLE/'skeletons'/ (stem+'.zip'))
        return
    if args.only == 'dev_skeleton_necromancer_v2':
        source = BIBLE/'skeletons/mixamo_ready_problem_fixed/crimson_bone_reaper_1009072344/source_pbr'
        maps=maps_from(source, WORK/'maps'/args.only)
        config=shared.MinionBuild(args.only,BIBLE/'skeletons/mixamo_rigged/necromancer v2.zip',maps,'Necromancer','crimson_bone_reaper_mixamo.fbx',shared.CULTIST_ANIMATION_FILES,'standing idle.fbx','Original Crimson Bone Reaper PBR; Mixamo rig and magic clips')
    elif args.only == 'dev_treant_v2':
        config=shared.MinionBuild(args.only,BIBLE/'mobs/mixamo_rigged/treant.zip',BIBLE/'mobs/mixamo_ready_fixed/treant_v2/source_pbr','TreantV2','treant_v2_mixamo.fbx',shared.GOLEM_ANIMATION_FILES,'mutant idle.fbx','Original Elderbark Guardian v2 PBR; Mixamo rig and mutant clips')
    else:
        raise ValueError(args.only)
    print(json.dumps(shared.build_one(config,render_idle_preview=False)),flush=True)

if __name__ == '__main__':
    main()
