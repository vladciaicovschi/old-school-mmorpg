"""Import supplied Rogue stabbing variants and kick, without changing its body.

Blender --background --factory-startup --python scripts/assets/export_rogue_motion_donors.py
The shipping baker retargets these keys onto the original T1 Rogue hierarchy.
"""
from __future__ import annotations

import sys
import tempfile
import zipfile
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT.parent / "bible/models/characters/t1/mixamo_rigged/rogue"
OUTPUT = ROOT / "tmp/rogue_motion/donors.glb"
BASE = "Meshy_AI_Hooded_Wanderer_1009120808_texture_fbx_mixamo.fbx"
sys.path.insert(0, str(ROOT / "scripts/anim"))
from blender_bake_meshy_titan import add_clip, clear_animation, export_glb, import_base


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="rogue_", dir=OUTPUT.parent) as temporary:
        directory = Path(temporary)
        with zipfile.ZipFile(PACKS / "Pro Sword and Shield Pack.zip") as package:
            base = directory / "base.fbx"
            base.write_bytes(package.read(BASE))
            rig, mesh = import_base(base)
            anchor_x, anchor_z = clear_animation(rig)
            for source, name in (
                ("sword and shield kick.fbx", "Rogue_Kick"),
                ("sword and shield power up.fbx", "Rogue_Utility"),
            ):
                path = directory / source
                path.write_bytes(package.read(source))
                add_clip(rig, path, name, anchor_x, anchor_z)
        for source, name in (
            ("Stabbing.fbx", "Rogue_StabA"),
            ("Stabbing (1).fbx", "Rogue_StabB"),
            ("Stabbing (2).fbx", "Rogue_StabC"),
        ):
            add_clip(rig, PACKS / source, name, anchor_x, anchor_z)
        bpy.data.objects.remove(mesh, do_unlink=True)
        export_glb(OUTPUT, rig, [])
    print(f"Wrote {OUTPUT}", flush=True)


if __name__ == "__main__":
    main()
