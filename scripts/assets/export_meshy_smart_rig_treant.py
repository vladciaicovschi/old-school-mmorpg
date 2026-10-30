"""Retarget the bone-golem Mixamo pack onto the humanoid part of Meshy's treant Smart Rig."""

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
from blender_bake_meshy_titan import export_glb  # noqa: E402
from export_meshy_smart_rig_murlok import add_clip  # noqa: E402
from export_meshy_test_minions import GOLEM_ANIMATION_FILES, clip_name  # noqa: E402


SOURCE = ROOT.parent / "bible/models/mobs/meshy_smart_rig/treant.glb"
DONOR_ARCHIVE = ROOT.parent / "bible/models/skeletons/mixamo_rigged/golem.zip"
OUTPUT_DIR = ROOT / "tmp/asset_src/npcs/dev_meshy_treant"

# Reconstructed from hierarchy, joint positions and weighted-vertex centres.
# Extra twig, finger and calf branches remain at rest under these animated bones.
HUMANOID_MAP = {
    "mixamorig:Hips": "Bone_001",
    "mixamorig:Spine": "Bone_013",
    "mixamorig:Spine1": "Bone_012",
    "mixamorig:Spine2": "Bone_011",
    "mixamorig:Neck": "Bone_022",
    "mixamorig:Head": "Bone_021",
    "mixamorig:LeftShoulder": "Bone_028",
    "mixamorig:LeftArm": "Bone_027",
    "mixamorig:LeftForeArm": "Bone_026",
    "mixamorig:LeftHand": "Bone_044",
    "mixamorig:RightShoulder": "Bone_025",
    "mixamorig:RightArm": "Bone_024",
    "mixamorig:RightForeArm": "Bone_023",
    "mixamorig:RightHand": "Bone_040",
    "mixamorig:LeftUpLeg": "Bone_019",
    "mixamorig:LeftLeg": "Bone_018",
    "mixamorig:LeftFoot": "Bone_036",
    "mixamorig:LeftToeBase": "Bone_035",
    "mixamorig:RightUpLeg": "Bone_016",
    "mixamorig:RightLeg": "Bone_015",
    "mixamorig:RightFoot": "Bone_032",
    "mixamorig:RightToeBase": "Bone_031",
}


def main() -> None:
    if not SOURCE.is_file() or not DONOR_ARCHIVE.is_file():
        raise RuntimeError(f"Missing source or donor: {SOURCE}, {DONOR_ARCHIVE}")
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
    rig.name = "dev_meshy_treant_Rig"
    mesh.name = "dev_meshy_treant_Body"
    mesh.data.name = mesh.name
    rig.animation_data_clear()
    rig.animation_data_create()
    bpy.context.scene.render.fps = 30

    clips = []
    with tempfile.TemporaryDirectory(prefix="woc_meshy_treant_") as temporary:
        source_dir = Path(temporary)
        with zipfile.ZipFile(DONOR_ARCHIVE) as package:
            for filename in GOLEM_ANIMATION_FILES:
                (source_dir / filename).write_bytes(package.read(filename))
        for filename in GOLEM_ANIMATION_FILES:
            name = clip_name("MeshyTreant", filename)
            frames = add_clip(
                rig,
                source_dir / filename,
                name,
                humanoid_map=HUMANOID_MAP,
                direction_match_arms=False,
            )
            clips.append({"name": name, "frames": frames})
            print(f"CLIP dev_meshy_treant {name}", flush=True)

    rig["retarget_source"] = "Bone-golem Mixamo pack via humanoid-only Meshy Smart Rig mapping"
    rig["humanoid_bone_map"] = json.dumps(HUMANOID_MAP, sort_keys=True)
    rig["omitted_source_meshes"] = json.dumps(
        sorted(obj.name for obj in meshes if obj is not mesh), sort_keys=True
    )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_DIR / "dev_meshy_treant.glb"
    export_glb(output, rig, [mesh])
    report = {
        "id": "dev_meshy_treant",
        "output": str(output.relative_to(ROOT)),
        "bones": len(rig.data.bones),
        "mappedHumanoidBones": len(HUMANOID_MAP),
        "vertices": len(mesh.data.vertices),
        "triangles": len(mesh.data.polygons),
        "clips": clips,
    }
    (OUTPUT_DIR / "dev_meshy_treant.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
