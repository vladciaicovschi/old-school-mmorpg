"""Retarget the developer rogue-assassin pack onto the Meshy Smart Rig skeleton rogue."""

from __future__ import annotations

import json
import sys
import tempfile
import zipfile
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/anim"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import (  # noqa: E402
    add_clip,
    apply_armature_object_transform,
    clear_animation,
    export_glb,
)
from export_meshy_test_minions import (  # noqa: E402
    ANIMATION_FILES,
    build_material,
    clip_name,
)


SOURCE_ARCHIVE = ROOT.parent / "bible/models/skeletons/mixamo_rigged/rogue.zip"
DONOR_ARCHIVE = ROOT.parent / "bible/models/rougs/mixamo_rigged/assasin.zip"
WALK_DONOR_ARCHIVE = ROOT.parent / "bible/models/skeletons/mixamo_rigged/cultist.zip"
OUTPUT_DIR = ROOT / "tmp/asset_src/npcs/dev_skeleton_rogue"


def main() -> None:
    for source in (SOURCE_ARCHIVE, DONOR_ARCHIVE, WALK_DONOR_ARCHIVE):
        if not source.is_file():
            raise RuntimeError(f"Missing source: {source}")

    with tempfile.TemporaryDirectory(prefix="woc_meshy_skeleton_rogue_") as temporary:
        source_dir = Path(temporary)
        with zipfile.ZipFile(SOURCE_ARCHIVE) as package:
            package.extractall(source_dir / "base")
        base_fbx = next((source_dir / "base").rglob("*.fbx"))
        source_texture_dir = base_fbx.parent
        texture_dir = source_dir / "source_pbr"
        texture_dir.mkdir()
        texture_stem = "Meshy_AI_Crimson_Bonewarden_biped_texture_0"
        texture_sources = {
            "base": source_texture_dir / f"{texture_stem}.png",
            "normal": source_texture_dir / f"{texture_stem}_normal.png",
            "metallic": source_texture_dir / f"{texture_stem}_metallic.png",
            "roughness": source_texture_dir / f"{texture_stem}_roughness.png",
        }
        for name, source in texture_sources.items():
            if not source.is_file():
                raise RuntimeError(f"Missing skeleton rogue texture: {source}")
            (texture_dir / f"{name}.png").write_bytes(source.read_bytes())

        animation_dir = source_dir / "animations"
        animation_dir.mkdir()
        with zipfile.ZipFile(DONOR_ARCHIVE) as package:
            for filename in ANIMATION_FILES:
                (animation_dir / filename).write_bytes(package.read(filename))
        walk_filename = "Standing Walk Forward.fbx"
        with zipfile.ZipFile(WALK_DONOR_ARCHIVE) as package:
            (animation_dir / walk_filename).write_bytes(package.read(walk_filename))

        bpy.ops.wm.read_factory_settings(use_empty=True)
        result = bpy.ops.import_scene.fbx(filepath=str(base_fbx), use_anim=True)
        if result != {"FINISHED"}:
            raise RuntimeError(f"Base FBX import failed: {result}")
        rigs = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        skinned_meshes = [obj for obj in meshes if obj.vertex_groups]
        if len(rigs) != 1 or len(skinned_meshes) != 1:
            raise RuntimeError(
                f"Expected one rig/skinned mesh, got {len(rigs)}/{len(skinned_meshes)}; "
                f"meshes={[obj.name for obj in meshes]}"
            )
        rig, mesh = rigs[0], skinned_meshes[0]
        apply_armature_object_transform(rig)
        anchor_x, anchor_z = clear_animation(rig)
        rig.name = "dev_skeleton_rogue_Rig"
        mesh.name = "dev_skeleton_rogue_Body"
        mesh.data.name = mesh.name
        bpy.context.scene.render.fps = 30

        clips = []
        for filename in ANIMATION_FILES:
            name = clip_name("SkeletonRogue", filename)
            frames = add_clip(
                rig,
                animation_dir / filename,
                name,
                anchor_x,
                anchor_z,
                allow_missing_bones=True,
            )
            clips.append({"name": name, "frames": frames})
            print(f"CLIP dev_skeleton_rogue {name}", flush=True)
        walk_name = "SkeletonRogue_Walk"
        walk_frames = add_clip(
            rig,
            animation_dir / walk_filename,
            walk_name,
            anchor_x,
            anchor_z,
            allow_missing_bones=True,
        )
        clips.append({"name": walk_name, "frames": walk_frames})
        print(f"CLIP dev_skeleton_rogue {walk_name}", flush=True)

        mesh.data.materials.clear()
        mesh.data.materials.append(build_material("dev_skeleton_rogue", texture_dir))
        shared_humanoid = sorted(
            bone.name
            for bone in rig.data.bones
            if bone.name.startswith("mixamorig:") and not bone.name.endswith("_end")
        )
        rig["retarget_source"] = "Rogue Assassin Mixamo pack on Meshy Smart Rig Mixamo bones"
        rig["retargeted_bones"] = json.dumps(shared_humanoid)
        rig["omitted_source_meshes"] = json.dumps(
            sorted(obj.name for obj in meshes if obj is not mesh), sort_keys=True
        )
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output = OUTPUT_DIR / "dev_skeleton_rogue.glb"
        export_glb(output, rig, [mesh])
        report = {
            "id": "dev_skeleton_rogue",
            "output": str(output.relative_to(ROOT)),
            "bones": len(rig.data.bones),
            "retargetedBones": len(shared_humanoid),
            "vertices": len(mesh.data.vertices),
            "triangles": len(mesh.data.polygons),
            "clips": clips,
        }
        (OUTPUT_DIR / "dev_skeleton_rogue.json").write_text(
            json.dumps(report, indent=2), encoding="utf-8"
        )
        print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
