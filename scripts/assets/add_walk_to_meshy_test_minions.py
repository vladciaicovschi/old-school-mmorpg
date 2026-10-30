"""Add the cultist's Mixamo walk cycle to sword-and-shield test minions.

The four source archives contain running but no walk. Their already-built raw
GLBs share the same Mixamo hierarchy, so this adds one retargeted NLA action
without rebuilding bodies from missing or moved source archives.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import zipfile
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/anim"))
from blender_bake_meshy_titan import add_clip, export_glb  # noqa: E402


TARGETS = (
    ("dev_rogue_minion", "RogueMinion_Walk"),
    ("dev_skeleton_minion", "SkeletonMinion_Walk"),
    ("dev_rogue_assassin", "RogueAssassin_Walk"),
    ("dev_skeleton_warrior", "SkeletonWarrior_Walk"),
)
DONOR_ARCHIVE = ROOT.parent / "bible/models/skeletons/mixamo_rigged/cultist.zip"
DONOR_ENTRY = "Standing Walk Forward.fbx"


def add_walk(asset_id: str, clip_name: str, donor: Path) -> dict[str, object]:
    source = ROOT / f"tmp/asset_src/npcs/{asset_id}/{asset_id}.glb"
    if not source.is_file():
        raise RuntimeError(f"Missing raw GLB: {source}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(source))
    if result != {"FINISHED"}:
        raise RuntimeError(f"Could not import {source}: {result}")
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    skinned_meshes = [obj for obj in meshes if obj.vertex_groups]
    if len(armatures) != 1 or len(skinned_meshes) != 1:
        raise RuntimeError(
            f"{asset_id}: expected one armature/skinned mesh, found "
            f"{len(armatures)}/{len(skinned_meshes)}; meshes={[obj.name for obj in meshes]}"
        )
    armature = armatures[0]
    mesh = skinned_meshes[0]
    existing_tracks = {track.name for track in armature.animation_data.nla_tracks}
    if clip_name in existing_tracks:
        return {"id": asset_id, "clip": clip_name, "alreadyPresent": True}
    frames = add_clip(armature, donor, clip_name, 0.0, 0.0, allow_missing_bones=True)
    export_glb(source, armature, [mesh])
    return {
        "id": asset_id,
        "clip": clip_name,
        "frames": frames,
        "animationCount": len(armature.animation_data.nla_tracks),
        "bytes": source.stat().st_size,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", action="append", help="Add walk only to this asset id")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
    targets = [target for target in TARGETS if not args.only or target[0] in args.only]
    unknown = sorted(set(args.only or ()) - {asset_id for asset_id, _ in TARGETS})
    if unknown:
        raise RuntimeError(f"Unknown --only asset id: {', '.join(unknown)}")
    if not DONOR_ARCHIVE.is_file():
        raise RuntimeError(f"Missing walk donor archive: {DONOR_ARCHIVE}")
    with tempfile.TemporaryDirectory(prefix="woc_test_minion_walk_") as temporary:
        donor = Path(temporary) / DONOR_ENTRY
        with zipfile.ZipFile(DONOR_ARCHIVE) as package:
            donor.write_bytes(package.read(DONOR_ENTRY))
        report = [add_walk(asset_id, clip_name, donor) for asset_id, clip_name in targets]
    output = ROOT / "tmp/asset_src/npcs/meshy_test_minion_walk_report.json"
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
