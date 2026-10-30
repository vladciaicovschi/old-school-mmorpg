"""Export the simple Battleworn Oak Shield as the tier-one held shield.

The maintainer source archive is extracted below tmp/asset_src/meshy_t1_shield.
Run from the repository root with Blender 5.x:

  blender --background --factory-startup --python scripts/assets/export_meshy_t1_shield.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_meshy_weapon_sets as shared


ROOT = Path(__file__).resolve().parents[2]
SOURCE = next(
    (ROOT / "tmp" / "asset_src" / "meshy_t1_shield" / "source").rglob(
        "Meshy_AI_Battleworn_Oak_Shield_1011072207_texture.fbx"
    )
)
OUTPUT = ROOT / "tmp" / "asset_src" / "meshy_t1_shield" / "raw" / "battleworn_oak_shield.glb"
PREVIEW = ROOT / "tmp" / "asset_src" / "meshy_t1_shield" / "previews" / "battleworn_oak_shield.jpg"


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(SOURCE), use_anim=False)
    shield = max(
        (obj for obj in bpy.context.scene.objects if obj.type == "MESH"),
        key=lambda obj: len(obj.data.polygons),
    )
    shield.name = "battleworn_oak_shield"
    shield.data.name = "battleworn_oak_shield_Mesh"
    shield.data.materials.clear()
    shield.data.materials.append(shared.build_material(SOURCE, "battleworn_oak_shield_pbr"))
    shared.place_origin_at_grip(shield, "shield")
    shared.decimate(shield)
    shared.render_preview(shield, PREVIEW)
    report = shared.export_glb(shield, OUTPUT)
    report.update({"source": SOURCE.name, "grip_origin": "shield"})
    report_path = OUTPUT.parent / "export_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
