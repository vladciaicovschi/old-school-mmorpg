"""Export the fitted V1 character as one complete suit for the local game trial.

Run with Blender --background --python scripts/assets/export_sentinel_v1.py.
Input: ../.codex_outputs/armor_v1/02_segmented_armor.blend.
Combat animation donor: the existing uncompressed Titan bake (retargeted, not copied).
"""
import bpy
import json
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tmp/asset_src/sentinel_v1'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT.parent / '.codex_outputs/armor_v1/02_segmented_armor.blend'))
rig = bpy.data.objects['Character_Rig']
body = bpy.data.objects['Character_Body']
armor = [o for o in bpy.context.scene.objects if o.name.startswith('Armor_')]
# The game trial now uses one complete suit, not switchable armor slots.
for o in armor:
    o.animation_data_clear()
    o.hide_viewport = o.hide_render = False
bpy.data.objects.remove(body, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in armor: o.select_set(True)
bpy.context.view_layer.objects.active = armor[0]
bpy.ops.object.join()
suit = bpy.context.object
suit.name = 'Sentinel_Body'
assert len(suit.data.polygons) == 15027
armor = [suit]
base_parts = []
native = {t.name: t.strips[0].action for t in rig.animation_data.nla_tracks}
for a in native.values(): a.use_fake_user = True
rig.animation_data_clear(); rig.animation_data_create(); rig.data.pose_position = 'POSE'
old = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'tmp/asset_src/meshy_titan/meshy_titan_scale_baked.glb'))
imported = set(bpy.data.objects) - old
donor = next(o for o in imported if o.type == 'ARMATURE')
donor_actions = {t.name: t.strips[0].action for t in donor.animation_data.nla_tracks}
if donor.animation_data.action:
    donor_actions[donor.animation_data.action.name] = donor.animation_data.action
print('DONOR_ACTIONS', list(donor_actions), flush=True)
for t in donor.animation_data.nla_tracks: t.mute = True
def key(n): return n.replace(':', '')
donor_bones = {key(b.name): b for b in donor.data.bones}
ordered = sorted(rig.pose.bones, key=lambda b: len(b.parent_recursive))
rels = {b.name: (b.parent.bone.matrix_local.inverted() @ b.bone.matrix_local
                 if b.parent else b.bone.matrix_local.copy()) for b in ordered}
clips = []
for name, a in native.items():
    a.name = {'Character_Running': 'Sentinel_Run', 'Character_Walking': 'Sentinel_Walk',
              'Character_walking_2': 'Sentinel_WalkAlt'}[name]
    clips.append(a)
for name, source in donor_actions.items():
    if not name.startswith('Titan_') or name in ('Titan_Run', 'Titan_Walk'): continue
    donor.animation_data.action = source
    if source.slots: donor.animation_data.action_slot = source.slots[0]
    a = bpy.data.actions.new(name.replace('Titan_', 'Sentinel_'))
    rig.animation_data.action = a
    start, end = map(round, source.frame_range)
    for frame in range(start, end + 1):
        bpy.context.scene.frame_set(frame); bpy.context.view_layer.update()
        targets = {}
        for b in ordered:
            db = donor_bones.get(key(b.name))
            if db:
                pose = donor.pose.bones[db.name].matrix
                rotation = (pose @ db.matrix_local.inverted() @ b.bone.matrix_local).to_quaternion()
            else:
                rotation = (targets[b.parent.name] @ rels[b.name]).to_quaternion() if b.parent else b.bone.matrix_local.to_quaternion()
            loc = (targets[b.parent.name] @ rels[b.name]).translation if b.parent else b.bone.head_local.copy()
            if not b.parent and db:
                delta = donor.pose.bones[db.name].matrix.translation - db.head_local
                loc.z += delta.z
            target = Matrix.LocRotScale(loc, rotation, Vector((1, 1, 1)))
            targets[b.name] = target
            b.rotation_mode = 'QUATERNION'
            b.matrix_basis = rels[b.name].inverted() @ (targets[b.parent.name].inverted() if b.parent else Matrix.Identity(4)) @ target
            b.keyframe_insert('location', frame=frame-start+1, group=b.name)
            b.keyframe_insert('rotation_quaternion', frame=frame-start+1, group=b.name)
            b.keyframe_insert('scale', frame=frame-start+1, group=b.name)
    a.use_fake_user = True; clips.append(a); rig.animation_data.action = None
for o in imported: bpy.data.objects.remove(o, do_unlink=True)
for a in clips:
    t = rig.animation_data.nla_tracks.new(); t.name = a.name
    strip = t.strips.new(a.name, 1, a)
    if a.slots: strip.action_slot = a.slots[0]
    t.mute = False
for o in [rig] + armor + base_parts:
    for k in list(o.keys()): del o[k]
rig.data.pose_position = 'POSE'
bpy.ops.object.select_all(action='DESELECT')
for o in [rig] + armor + base_parts: o.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=str(OUT / 'sentinel_v1.glb'), use_selection=True,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_apply=False,
    export_skins=True, export_extras=False)
for t in rig.animation_data.nla_tracks: t.mute = True
rig.data.pose_position = 'REST'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'sentinel_v1_runtime.blend'))
json.dump({'armor_parts': [o.name for o in armor], 'body_parts': [o.name for o in base_parts],
           'clips': [a.name for a in clips]}, open(OUT / 'inventory.json', 'w'), indent=2)
