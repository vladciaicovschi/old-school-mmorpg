"""Build the animated Meshy murlok from its native rig and animation pack.

The animation FBXs in this pack share one 80-bone skeleton.  Keep their
authored actions on that skeleton instead of retargeting Mixamo motion onto the
creature body; that avoids the crossed-arm deformation in the previous build.
"""

from __future__ import annotations

import json
import sys
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/anim"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import (  # noqa: E402
    action_fcurves,
    apply_armature_object_transform,
    clear_animation,
    export_glb,
    remove_horizontal_root_motion,
    scale_pose_locations,
)
from export_meshy_test_minions import build_material  # noqa: E402


SOURCE_ARCHIVE = (
    ROOT.parent / "bible/models/mobs/mixamo_rigged/murlok_animated_meshy_skeleton.zip"
)
OUTPUT_DIR = ROOT / "tmp/asset_src/npcs/dev_meshy_murlok"
TEXTURE_STEM = "Meshy_AI_Coralfin_Goblin_biped_texture_0"


@dataclass(frozen=True)
class NativeClip:
    name: str
    filename_fragment: str


CLIPS = (
    NativeClip("MeshyMurlokNative_Idle", "Animation_Idle_11_withSkin.fbx"),
    NativeClip("MeshyMurlokNative_Walk", "Animation_walking_2_inplace_withSkin.fbx"),
    NativeClip("MeshyMurlokNative_Run", "Animation_Running_withSkin.fbx"),
    NativeClip("MeshyMurlokNative_AxeSpinAttack", "Animation_Axe_Spin_Attack_withSkin.fbx"),
    NativeClip("MeshyMurlokNative_DoubleCombo", "Animation_Double_Combo_Attack_withSkin.fbx"),
    NativeClip("MeshyMurlokNative_TripleCombo", "Animation_Triple_Combo_Attack_withSkin.fbx"),
    NativeClip("MeshyMurlokNative_Death", "Animation_Dead_withSkin.fbx"),
)


def locate(source_dir: Path, fragment: str) -> Path:
    matches = [path for path in source_dir.rglob("*.fbx") if path.name.endswith(fragment)]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one FBX ending in {fragment!r}, found {matches}")
    return matches[0]


def import_native_fbx(path: Path) -> tuple[bpy.types.Object, bpy.types.Object, bpy.types.Action, list[bpy.types.Object]]:
    old_objects = set(bpy.data.objects)
    old_actions = set(bpy.data.actions)
    result = bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True)
    if result != {"FINISHED"}:
        raise RuntimeError(f"FBX import failed for {path}: {result}")
    objects = [obj for obj in bpy.data.objects if obj not in old_objects]
    rigs = [obj for obj in objects if obj.type == "ARMATURE"]
    skinned = [obj for obj in objects if obj.type == "MESH" and obj.vertex_groups]
    actions = [action for action in bpy.data.actions if action not in old_actions]
    if len(rigs) != 1 or len(skinned) != 1 or len(actions) != 1:
        raise RuntimeError(
            f"Expected one rig/body/action in {path.name}, got "
            f"{len(rigs)}/{len(skinned)}/{len(actions)}"
        )
    return rigs[0], skinned[0], actions[0], objects


def add_native_action(
    base_rig: bpy.types.Object,
    source: Path,
    name: str,
    anchor_x: float,
    anchor_z: float,
) -> tuple[float, float]:
    donor_rig, _donor_mesh, action, donor_objects = import_native_fbx(source)
    base_bones = {bone.name for bone in base_rig.data.bones}
    donor_bones = {bone.name for bone in donor_rig.data.bones}
    if donor_bones != base_bones:
        raise RuntimeError(
            f"Native skeleton mismatch in {source.name}: "
            f"missing={sorted(base_bones - donor_bones)}, extra={sorted(donor_bones - base_bones)}"
        )
    apply_armature_object_transform(donor_rig)
    scale_pose_locations(action, 0.01)
    remove_horizontal_root_motion(action, anchor_x, anchor_z)
    action.name = name
    for curve in action_fcurves(action):
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
        curve.update()

    track = base_rig.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 0, action)
    strip.name = name
    frame_range = tuple(float(value) for value in action.frame_range)

    # Keep the action/NLA strip, discard the donor's duplicate body and rig.
    donor_rig.animation_data.action = None
    for obj in donor_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    return frame_range


def make_idle_hold(
    rig: bpy.types.Object,
    source_action: bpy.types.Action,
    source_frame: int,
    name: str,
) -> tuple[float, float]:
    tracks = list(rig.animation_data.nla_tracks)
    mutes = [track.mute for track in tracks]
    for track in tracks:
        track.mute = True
    rig.animation_data.action = source_action
    if source_action.slots:
        rig.animation_data.action_slot = source_action.slots[0]
    bpy.context.scene.frame_set(source_frame)
    bpy.context.view_layer.update()

    pose = {
        bone.name: (bone.location.copy(), bone.rotation_quaternion.copy(), bone.scale.copy())
        for bone in rig.pose.bones
    }
    idle = bpy.data.actions.new(name)
    rig.animation_data.action = idle
    for bone in rig.pose.bones:
        location, rotation, scale = pose[bone.name]
        bone.location = location
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = rotation
        bone.scale = scale
        for frame in (0, 60):
            bone.keyframe_insert("location", frame=frame, group=bone.name)
            bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone.name)
            bone.keyframe_insert("scale", frame=frame, group=bone.name)
    rig.animation_data.action = None
    for track, muted in zip(tracks, mutes):
        track.mute = muted
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 0, idle)
    strip.name = name
    return tuple(float(value) for value in idle.frame_range)


def main() -> None:
    if not SOURCE_ARCHIVE.is_file():
        raise RuntimeError(f"Missing source archive: {SOURCE_ARCHIVE}")
    with tempfile.TemporaryDirectory(prefix="woc_meshy_native_murlok_") as temporary:
        source_dir = Path(temporary)
        with zipfile.ZipFile(SOURCE_ARCHIVE) as package:
            package.extractall(source_dir)

        base_fbx = locate(source_dir, CLIPS[0].filename_fragment)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        rig, mesh, _base_action, imported_objects = import_native_fbx(base_fbx)
        helper_meshes = [
            obj for obj in imported_objects if obj.type == "MESH" and obj is not mesh
        ]
        apply_armature_object_transform(rig)
        anchor_x, anchor_z = clear_animation(rig)
        rig.name = "dev_meshy_murlok_Rig"
        mesh.name = "dev_meshy_murlok_Body"
        mesh.data.name = mesh.name
        bpy.context.scene.render.fps = 30
        for helper in helper_meshes:
            bpy.data.objects.remove(helper, do_unlink=True)

        clips: list[dict[str, object]] = []
        for clip in CLIPS:
            frame_range = add_native_action(
                rig,
                locate(source_dir, clip.filename_fragment),
                clip.name,
                anchor_x,
                anchor_z,
            )
            clips.append({"name": clip.name, "frames": frame_range})
            print(f"CLIP dev_meshy_murlok {clip.name} {frame_range}", flush=True)

        texture_dir = source_dir / "source_pbr"
        texture_dir.mkdir()
        texture_sources = {
            kind: next(source_dir.rglob(filename), None)
            for kind, filename in {
                "base": f"{TEXTURE_STEM}.png",
                "normal": f"{TEXTURE_STEM}_normal.png",
                "metallic": f"{TEXTURE_STEM}_metallic.png",
                "roughness": f"{TEXTURE_STEM}_roughness.png",
            }.items()
        }
        for kind, source in texture_sources.items():
            if source is None or not source.is_file():
                raise RuntimeError(f"Missing murlok texture: {source}")
            (texture_dir / f"{kind}.png").write_bytes(source.read_bytes())
        mesh.data.materials.clear()
        mesh.data.materials.append(build_material("dev_meshy_murlok", texture_dir))

        rig["source"] = "User-provided Meshy murlok with native Meshy rig and animations"
        rig["animation_pipeline"] = "Native 80-bone Meshy actions; no Mixamo retarget"
        rig["omitted_source_meshes"] = json.dumps(["Icosphere"])

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output = OUTPUT_DIR / "dev_meshy_murlok.glb"
        export_glb(output, rig, [mesh])
        report = {
            "id": "dev_meshy_murlok",
            "output": str(output.relative_to(ROOT)),
            "bones": len(rig.data.bones),
            "vertices": len(mesh.data.vertices),
            "triangles": len(mesh.data.polygons),
            "clips": clips,
            "nativeRig": True,
        }
        (OUTPUT_DIR / "dev_meshy_murlok.json").write_text(
            json.dumps(report, indent=2), encoding="utf-8"
        )
        print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
