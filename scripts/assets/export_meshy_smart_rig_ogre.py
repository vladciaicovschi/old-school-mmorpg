"""Build the Meshy Smart Rig ogre with the shared kobold/murloc melee pack."""

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
    apply_armature_object_transform,
    clear_animation,
    export_glb,
)
from export_meshy_smart_rig_murlok import add_clip as add_smart_rig_clip  # noqa: E402
from export_meshy_test_minions import (  # noqa: E402
    MELEE_ANIMATION_FILES,
    MELEE_DEATH_FILE,
    build_material,
    clip_name,
)


SOURCE_ARCHIVE = ROOT.parent / "bible/models/mobs/meshy_smart_rig/ogre.zip"
DONOR_ARCHIVE = ROOT.parent / "bible/models/mobs/mixamo_rigged/cobold.zip"
DEATH_DONOR_ARCHIVE = ROOT.parent / "bible/models/skeletons/mixamo_rigged/cultist.zip"
OUTPUT_DIR = ROOT / "tmp/asset_src/npcs/dev_meshy_ogre"

# Drive only the humanoid chain. Meshy's extra pelvis branches deform hanging
# armor and must follow their animated parent in the authored rest relation.
OGRE_HUMANOID_BONES = (
    "mixamorig:Hips",
    "mixamorig:Spine",
    "mixamorig:Spine1",
    "mixamorig:Spine2",
    "mixamorig:Neck",
    "mixamorig:Head",
    "mixamorig:LeftShoulder",
    "mixamorig:LeftArm",
    "mixamorig:LeftForeArm",
    "mixamorig:LeftHand",
    "mixamorig:RightShoulder",
    "mixamorig:RightArm",
    "mixamorig:RightForeArm",
    "mixamorig:RightHand",
    "mixamorig:LeftUpLeg",
    "mixamorig:LeftLeg",
    "mixamorig:LeftFoot",
    "mixamorig:LeftToeBase",
    "mixamorig:RightUpLeg",
    "mixamorig:RightLeg",
    "mixamorig:RightFoot",
    "mixamorig:RightToeBase",
)
OGRE_HUMANOID_MAP = {name: name for name in OGRE_HUMANOID_BONES}


def main() -> None:
    for source in (SOURCE_ARCHIVE, DONOR_ARCHIVE, DEATH_DONOR_ARCHIVE):
        if not source.is_file():
            raise RuntimeError(f"Missing source: {source}")
    with tempfile.TemporaryDirectory(prefix="woc_meshy_ogre_") as temporary:
        source_dir = Path(temporary)
        with zipfile.ZipFile(SOURCE_ARCHIVE) as package:
            package.extractall(source_dir)
        base_fbx = next(source_dir.rglob("*.fbx"))
        source_texture_dir = base_fbx.parent
        texture_dir = source_dir / "source_pbr"
        texture_dir.mkdir()
        texture_stem = "Meshy_AI_Grimfang_Brute_biped_texture_0"
        texture_sources = {
            "base": source_texture_dir / f"{texture_stem}.png",
            "normal": source_texture_dir / f"{texture_stem}_normal.png",
            "metallic": source_texture_dir / f"{texture_stem}_metallic.png",
            "roughness": source_texture_dir / f"{texture_stem}_roughness.png",
        }
        for name, source in texture_sources.items():
            if not source.is_file():
                raise RuntimeError(f"Missing ogre texture: {source}")
            (texture_dir / f"{name}.png").write_bytes(source.read_bytes())

        animation_dir = source_dir / "animations"
        animation_dir.mkdir()
        with zipfile.ZipFile(DONOR_ARCHIVE) as package:
            for filename in MELEE_ANIMATION_FILES:
                if filename != MELEE_DEATH_FILE:
                    (animation_dir / filename).write_bytes(package.read(filename))
        with zipfile.ZipFile(DEATH_DONOR_ARCHIVE) as package:
            (animation_dir / MELEE_DEATH_FILE).write_bytes(package.read(MELEE_DEATH_FILE))

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
        rig.name = "dev_meshy_ogre_Rig"
        mesh.name = "dev_meshy_ogre_Body"
        mesh.data.name = mesh.name
        bpy.context.scene.render.fps = 30

        clips = []
        for filename in MELEE_ANIMATION_FILES:
            name = clip_name("MeshyOgre", filename)
            frames = add_smart_rig_clip(
                rig,
                animation_dir / filename,
                name,
                humanoid_map=OGRE_HUMANOID_MAP,
                height_ratio=1.95 / 1.8,
            )
            clips.append({"name": name, "frames": frames})
            print(f"CLIP dev_meshy_ogre {name}", flush=True)

        mesh.data.materials.clear()
        mesh.data.materials.append(build_material("dev_meshy_ogre", texture_dir))
        shared_humanoid = sorted(OGRE_HUMANOID_MAP.values())
        rig["retarget_source"] = "Kobold Mixamo melee pack on humanoid-only Meshy Smart Rig chain"
        rig["retargeted_bones"] = json.dumps(shared_humanoid)
        rig["omitted_source_meshes"] = json.dumps(
            sorted(obj.name for obj in meshes if obj is not mesh), sort_keys=True
        )
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output = OUTPUT_DIR / "dev_meshy_ogre.glb"
        export_glb(output, rig, [mesh])
        report = {
            "id": "dev_meshy_ogre",
            "output": str(output.relative_to(ROOT)),
            "bones": len(rig.data.bones),
            "retargetedBones": len(shared_humanoid),
            "vertices": len(mesh.data.vertices),
            "triangles": len(mesh.data.polygons),
            "clips": clips,
        }
        (OUTPUT_DIR / "dev_meshy_ogre.json").write_text(
            json.dumps(report, indent=2), encoding="utf-8"
        )
        print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
