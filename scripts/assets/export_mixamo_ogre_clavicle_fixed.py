"""Widen the Mixamo ogre clavicles and rebake its gameplay animation subset."""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/anim"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import add_clip, clear_animation, export_glb, import_base  # noqa: E402
from export_meshy_test_minions import (  # noqa: E402
    MELEE_ANIMATION_FILES,
    MELEE_DEATH_FILE,
    build_material,
    clip_name,
)


SOURCE_ARCHIVE = ROOT.parent / "bible/models/mobs/mixamo_rigged/ogre.zip"
PBR_ARCHIVE = ROOT.parent / "bible/models/mobs/meshy_smart_rig/ogre.zip"
FIXED_DIR = ROOT.parent / "bible/models/mobs/mixamo_rigged/ogre_clavicle_fixed"
OUTPUT_DIR = ROOT / "tmp/asset_src/npcs/dev_mixamo_ogre_clavicle_fixed"
CLAVICLE_EXTENSION = 0.05
ANIMATION_FILES = tuple(name for name in MELEE_ANIMATION_FILES if name != MELEE_DEATH_FILE)


def widen_clavicles(rig: bpy.types.Object) -> dict[str, object]:
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    measurements: dict[str, object] = {}
    for side, sign in (("Left", 1.0), ("Right", -1.0)):
        shoulder = rig.data.edit_bones[f"mixamorig:{side}Shoulder"]
        arm = rig.data.edit_bones[f"mixamorig:{side}Arm"]
        before = shoulder.length
        delta = Vector((CLAVICLE_EXTENSION * sign, 0.0, 0.0))
        # Move the complete arm subtree as one rigid chain. Only the clavicle
        # becomes longer; upper arm, forearm, hand and their joint spacing stay
        # unchanged.
        for bone in (arm, *arm.children_recursive):
            bone.head += delta
            bone.tail += delta
        # Mixamo connects Arm.head to Shoulder.tail, so moving the child chain
        # already lengthens the clavicle. Handle an unconnected variant without
        # applying the same extension twice.
        if not arm.use_connect:
            shoulder.tail += delta
        measurements[side.lower()] = {
            "before": round(before, 6),
            "after": round(shoulder.length, 6),
            "jointX": round(arm.head.x, 6),
        }
    bpy.ops.object.mode_set(mode="OBJECT")
    rig["clavicle_extension"] = CLAVICLE_EXTENSION
    rig["clavicle_fix"] = "Shoulder sockets and complete arm subtrees moved outward in bind pose"
    return measurements


def export_fixed_fbx(path: Path, rig: bpy.types.Object, mesh: bpy.types.Object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = rig
    result = bpy.ops.export_scene.fbx(
        filepath=str(path),
        use_selection=True,
        object_types={"ARMATURE", "MESH"},
        use_mesh_modifiers=True,
        mesh_smooth_type="FACE",
        add_leaf_bones=False,
        bake_anim=False,
        path_mode="COPY",
        embed_textures=True,
        axis_forward="-Z",
        axis_up="Y",
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"Corrected FBX export failed: {result}")


def main() -> None:
    for source in (SOURCE_ARCHIVE, PBR_ARCHIVE):
        if not source.is_file():
            raise RuntimeError(f"Missing source: {source}")

    with tempfile.TemporaryDirectory(prefix="woc_mixamo_ogre_clavicle_") as temporary:
        source_dir = Path(temporary)
        with zipfile.ZipFile(SOURCE_ARCHIVE) as package:
            package.extractall(source_dir / "mixamo")
        with zipfile.ZipFile(PBR_ARCHIVE) as package:
            package.extractall(source_dir / "pbr_source")
        base_fbx = source_dir / "mixamo" / "ogre_mixamo.fbx"
        missing = [name for name in ANIMATION_FILES if not (source_dir / "mixamo" / name).is_file()]
        if missing:
            raise RuntimeError(f"Ogre archive is missing animations: {missing}")

        rig, mesh = import_base(base_fbx)
        rig.name = "dev_mixamo_ogre_clavicle_fixed_Rig"
        mesh.name = "dev_mixamo_ogre_clavicle_fixed_Body"
        mesh.data.name = mesh.name
        anchor_x, anchor_z = clear_animation(rig)
        measurements = widen_clavicles(rig)

        FIXED_DIR.mkdir(parents=True, exist_ok=True)
        fixed_fbx = FIXED_DIR / "ogre_mixamo_clavicle_fixed.fbx"
        export_fixed_fbx(fixed_fbx, rig, mesh)

        clips = []
        for filename in ANIMATION_FILES:
            name = clip_name("MixamoOgreFixed", filename)
            frames = add_clip(
                rig,
                source_dir / "mixamo" / filename,
                name,
                anchor_x,
                anchor_z,
            )
            clips.append({"name": name, "frames": frames})
            print(f"CLIP dev_mixamo_ogre_clavicle_fixed {name}", flush=True)

        texture_root = next((source_dir / "pbr_source").rglob("*_texture_0.png")).parent
        texture_stem = "Meshy_AI_Grimfang_Brute_biped_texture_0"
        pbr_dir = FIXED_DIR / "source_pbr"
        pbr_dir.mkdir(exist_ok=True)
        texture_sources = {
            "base": texture_root / f"{texture_stem}.png",
            "normal": texture_root / f"{texture_stem}_normal.png",
            "metallic": texture_root / f"{texture_stem}_metallic.png",
            "roughness": texture_root / f"{texture_stem}_roughness.png",
        }
        for kind, source in texture_sources.items():
            shutil.copy2(source, pbr_dir / f"{kind}.png")
        mesh.data.materials.clear()
        mesh.data.materials.append(build_material("dev_mixamo_ogre_clavicle_fixed", pbr_dir))

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output = OUTPUT_DIR / "dev_mixamo_ogre_clavicle_fixed.glb"
        export_glb(output, rig, [mesh])
        report = {
            "source": str(SOURCE_ARCHIVE),
            "fixedFbx": str(fixed_fbx),
            "previewGlb": str(output),
            "clavicleExtension": CLAVICLE_EXTENSION,
            "measurements": measurements,
            "bones": len(rig.data.bones),
            "vertices": len(mesh.data.vertices),
            "triangles": len(mesh.data.polygons),
            "clips": clips,
        }
        encoded = json.dumps(report, indent=2)
        (FIXED_DIR / "clavicle_fix_report.json").write_text(encoded, encoding="utf-8")
        (OUTPUT_DIR / "dev_mixamo_ogre_clavicle_fixed.json").write_text(encoded, encoding="utf-8")
        (FIXED_DIR / "README.md").write_text(
            "# Mixamo ogre — widened clavicles\n\n"
            f"The shoulder sockets and complete arm subtrees were moved {CLAVICLE_EXTENSION} world unit outward "
            "on each side. Existing Mixamo clips must be rebaked against this corrected bind pose; "
            "the source animation FBXs do not need to be downloaded again.\n",
            encoding="utf-8",
        )
        print(encoded, flush=True)


if __name__ == "__main__":
    main()
