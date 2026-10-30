"""Retarget the shared Mixamo melee pack onto Meshy's generic Smart Rig murlok.

Only the humanoid body chain is driven. Meshy facial, jaw and finger branches
remain in their authored rest relationship to the nearest animated parent.
"""

from __future__ import annotations

import json
import sys
import tempfile
import zipfile
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/anim"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import (  # noqa: E402
    action_fcurves,
    apply_armature_object_transform,
    export_glb,
    pose_bone_depth,
    scale_pose_locations,
)
from export_meshy_test_minions import (  # noqa: E402
    MELEE_ANIMATION_FILES,
    MELEE_DEATH_FILE,
    clip_name,
)


SOURCE = ROOT.parent / "bible/models/mobs/meshy_smart_rig/murlok.glb"
DONOR_ARCHIVE = ROOT.parent / "bible/models/mobs/mixamo_rigged/cobold.zip"
DEATH_DONOR_ARCHIVE = ROOT.parent / "bible/models/skeletons/mixamo_rigged/cultist.zip"
OUTPUT_DIR = ROOT / "tmp/asset_src/npcs/dev_meshy_murlok"

# Meshy names are anonymous, so this mapping is reconstructed from hierarchy,
# joint positions and the weighted-vertex centroids. The positive-X side is the
# character's left, matching Mixamo after both formats enter Blender's Z-up space.
HUMANOID_MAP = {
    "mixamorig:Hips": "Bone_001",
    "mixamorig:Spine": "Bone_010",
    "mixamorig:Spine1": "Bone_009",
    "mixamorig:Spine2": "Bone_008",
    "mixamorig:Neck": "Bone_023",
    "mixamorig:Head": "Bone_022",
    "mixamorig:LeftShoulder": "Bone_033",
    "mixamorig:LeftArm": "Bone_032",
    "mixamorig:LeftForeArm": "Bone_031",
    "mixamorig:LeftHand": "Bone_030",
    "mixamorig:RightShoulder": "Bone_028",
    "mixamorig:RightArm": "Bone_027",
    "mixamorig:RightForeArm": "Bone_026",
    "mixamorig:RightHand": "Bone_025",
    "mixamorig:LeftUpLeg": "Bone_020",
    "mixamorig:LeftLeg": "Bone_019",
    "mixamorig:LeftFoot": "Bone_018",
    "mixamorig:LeftToeBase": "Bone_017",
    "mixamorig:RightUpLeg": "Bone_015",
    "mixamorig:RightLeg": "Bone_014",
    "mixamorig:RightFoot": "Bone_013",
    "mixamorig:RightToeBase": "Bone_012",
}

ARM_DIRECTION_BONES = {
    "mixamorig:LeftShoulder",
    "mixamorig:LeftArm",
    "mixamorig:LeftForeArm",
    "mixamorig:LeftHand",
    "mixamorig:RightShoulder",
    "mixamorig:RightArm",
    "mixamorig:RightForeArm",
    "mixamorig:RightHand",
}


def without_world_z_twist(rotation: Quaternion) -> Quaternion:
    """Keep a root bone's lean while preventing authored clips from changing facing."""
    twist = Quaternion((rotation.w, 0.0, 0.0, rotation.z))
    if twist.w * twist.w + twist.z * twist.z < 1e-12:
        return rotation.copy()
    twist.normalize()
    return (rotation @ twist.inverted()).normalized()


def retarget_clip(
    target: bpy.types.Object,
    donor: bpy.types.Object,
    donor_action: bpy.types.Action,
    name: str,
    humanoid_map: dict[str, str] = HUMANOID_MAP,
    height_ratio: float = 1.7 / 1.8,
    direction_match_arms: bool = True,
) -> tuple[float, float]:
    apply_armature_object_transform(donor)
    scale_pose_locations(donor_action, 0.01)
    missing = sorted(set(humanoid_map) - {bone.name for bone in donor.data.bones})
    if missing:
        raise RuntimeError(f"{name}: donor is missing mapped bones: {missing}")
    missing = sorted(set(humanoid_map.values()) - {bone.name for bone in target.data.bones})
    if missing:
        raise RuntimeError(f"{name}: target is missing mapped bones: {missing}")

    target.animation_data_create()
    existing_tracks = list(target.animation_data.nla_tracks)
    previous_mutes = [track.mute for track in existing_tracks]
    for track in existing_tracks:
        track.mute = True
    for bone in target.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.matrix_basis.identity()

    action = bpy.data.actions.new(name)
    target.animation_data.action = action
    donor.animation_data.action = donor_action
    ordered = sorted(target.pose.bones, key=pose_bone_depth)
    target_rest = {bone.name: bone.matrix_local.copy() for bone in target.data.bones}
    donor_rest = {bone.name: bone.matrix_local.copy() for bone in donor.data.bones}
    rest_relative = {
        bone.name: (
            target_rest[bone.parent.name].inverted() @ target_rest[bone.name]
            if bone.parent
            else target_rest[bone.name].copy()
        )
        for bone in target.data.bones
    }
    source_for_target = {target_name: donor_name for donor_name, target_name in humanoid_map.items()}
    scene = bpy.context.scene
    start = int(round(donor_action.frame_range[0]))
    end = int(round(donor_action.frame_range[1]))
    previous_quaternions: dict[str, tuple[float, float, float, float]] = {}

    try:
        for output_frame, source_frame in enumerate(range(start, end + 1)):
            scene.frame_set(source_frame)
            bpy.context.view_layer.update()
            donor_pose = {bone.name: bone.matrix.copy() for bone in donor.pose.bones}
            target_matrices: dict[str, Matrix] = {}
            for bone in ordered:
                parent_matrix = target_matrices.get(bone.parent.name) if bone.parent else None
                rest_matrix = (
                    parent_matrix @ rest_relative[bone.name]
                    if parent_matrix is not None
                    else rest_relative[bone.name].copy()
                )
                donor_name = source_for_target.get(bone.name)
                if donor_name is None:
                    target_matrix = rest_matrix
                    bone.matrix_basis.identity()
                else:
                    source_pose = donor_pose[donor_name]
                    source_rest = donor_rest[donor_name]
                    # Express the donor animation in its bind-pose axes, then
                    # apply that local delta after the target bind rotation.
                    # Left-multiplying a world-space delta makes Meshy rigs
                    # with different shoulder rolls fold both arms across the
                    # chest even in an otherwise relaxed idle.
                    rotation_delta = (
                        source_rest.to_quaternion().inverted()
                        @ source_pose.to_quaternion()
                    ).normalized()
                    if bone.name == "Bone_001":
                        # Entity facing is controlled by the game. Mixamo's turn and
                        # spinning attacks must not rotate the whole imported body.
                        rotation_delta = without_world_z_twist(rotation_delta)
                    target_rest_rotation = target_rest[bone.name].to_quaternion()
                    if direction_match_arms and donor_name in ARM_DIRECTION_BONES:
                        # Meshy often authors creature arms in a steep V while
                        # Mixamo donors bind in an A/T pose. Match the animated
                        # physical bone direction (local +Y) but retain the
                        # creature's own roll, preventing both the old crossed
                        # arms and a permanent raised/hugging stance.
                        target_direction = target_rest_rotation @ Vector((0.0, 1.0, 0.0))
                        source_direction = source_pose.to_quaternion() @ Vector((0.0, 1.0, 0.0))
                        swing = target_direction.rotation_difference(source_direction)
                        target_rotation = (swing @ target_rest_rotation).normalized()
                    else:
                        target_rotation = (
                            target_rest_rotation @ rotation_delta
                        ).normalized()
                    target_location = rest_matrix.translation.copy()
                    if bone.name == "Bone_001":
                        source_delta = source_pose.translation - source_rest.translation
                        # Keep locomotion in place but retain the walk/run vertical bounce.
                        target_location.z += source_delta.z * height_ratio
                    target_matrix = Matrix.LocRotScale(
                        target_location,
                        target_rotation,
                        Vector((1.0, 1.0, 1.0)),
                    )
                    if bone.parent is None:
                        bone.matrix_basis = rest_relative[bone.name].inverted() @ target_matrix
                    else:
                        bone.matrix_basis = (
                            rest_relative[bone.name].inverted()
                            @ target_matrices[bone.parent.name].inverted()
                            @ target_matrix
                        )
                target_matrices[bone.name] = target_matrix
            bpy.context.view_layer.update()

            for target_name in source_for_target:
                bone = target.pose.bones[target_name]
                quaternion = bone.rotation_quaternion
                previous = previous_quaternions.get(target_name)
                if previous is not None and sum(a * b for a, b in zip(previous, quaternion)) < 0.0:
                    quaternion.negate()
                previous_quaternions[target_name] = tuple(quaternion)
                bone.keyframe_insert("location", frame=output_frame, group=target_name)
                bone.keyframe_insert("rotation_quaternion", frame=output_frame, group=target_name)
                bone.keyframe_insert("scale", frame=output_frame, group=target_name)
    finally:
        target.animation_data.action = None
        for track, muted in zip(existing_tracks, previous_mutes):
            track.mute = muted

    for curve in action_fcurves(action):
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
        curve.update()
    track = target.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action).name = name
    return tuple(float(value) for value in action.frame_range)


def add_clip(
    target: bpy.types.Object,
    source: Path,
    name: str,
    humanoid_map: dict[str, str] = HUMANOID_MAP,
    height_ratio: float = 1.7 / 1.8,
    direction_match_arms: bool = True,
) -> tuple[float, float]:
    old_objects = set(bpy.data.objects)
    old_actions = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=str(source), use_anim=True)
    objects = [obj for obj in bpy.data.objects if obj not in old_objects]
    rigs = [obj for obj in objects if obj.type == "ARMATURE"]
    actions = [action for action in bpy.data.actions if action not in old_actions]
    if len(rigs) != 1 or len(actions) != 1:
        raise RuntimeError(f"{source.name}: expected one rig/action, got {len(rigs)}/{len(actions)}")
    frames = retarget_clip(
        target,
        rigs[0],
        actions[0],
        name,
        humanoid_map=humanoid_map,
        height_ratio=height_ratio,
        direction_match_arms=direction_match_arms,
    )
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    if actions[0].users == 0:
        bpy.data.actions.remove(actions[0])
    return frames


def main() -> None:
    if not SOURCE.is_file() or not DONOR_ARCHIVE.is_file() or not DEATH_DONOR_ARCHIVE.is_file():
        raise RuntimeError(
            f"Missing source or donor: {SOURCE}, {DONOR_ARCHIVE}, {DEATH_DONOR_ARCHIVE}"
        )
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    rigs = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    skinned_meshes = [obj for obj in meshes if obj.vertex_groups]
    if len(rigs) != 1 or len(skinned_meshes) != 1:
        raise RuntimeError(
            f"Expected one rig/skinned mesh, got {len(rigs)}/{len(skinned_meshes)}; "
            f"meshes={[obj.name for obj in meshes]}"
        )
    rig, mesh = rigs[0], skinned_meshes[0]
    rig.name = "dev_meshy_murlok_Rig"
    mesh.name = "dev_meshy_murlok_Body"
    mesh.data.name = mesh.name
    rig.animation_data_clear()
    rig.animation_data_create()
    bpy.context.scene.render.fps = 30

    clips = []
    with tempfile.TemporaryDirectory(prefix="woc_meshy_murlok_") as temporary:
        source_dir = Path(temporary)
        with zipfile.ZipFile(DONOR_ARCHIVE) as package:
            for filename in MELEE_ANIMATION_FILES:
                if filename != MELEE_DEATH_FILE:
                    (source_dir / filename).write_bytes(package.read(filename))
        with zipfile.ZipFile(DEATH_DONOR_ARCHIVE) as package:
            (source_dir / MELEE_DEATH_FILE).write_bytes(package.read(MELEE_DEATH_FILE))
        for filename in MELEE_ANIMATION_FILES:
            name = clip_name("MeshyMurlok", filename)
            frames = add_clip(rig, source_dir / filename, name)
            clips.append({"name": name, "frames": frames})
            print(f"CLIP dev_meshy_murlok {name}", flush=True)

    rig["retarget_source"] = "Mixamo melee pack via humanoid-only Meshy Smart Rig mapping"
    rig["humanoid_bone_map"] = json.dumps(HUMANOID_MAP, sort_keys=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_DIR / "dev_meshy_murlok.glb"
    export_glb(output, rig, [mesh])
    report = {
        "id": "dev_meshy_murlok",
        "output": str(output.relative_to(ROOT)),
        "bones": len(rig.data.bones),
        "mappedHumanoidBones": len(HUMANOID_MAP),
        "vertices": len(mesh.data.vertices),
        "triangles": len(mesh.data.polygons),
        "clips": clips,
    }
    (OUTPUT_DIR / "dev_meshy_murlok.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
