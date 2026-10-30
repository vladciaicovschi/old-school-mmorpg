"""Import Druid's Mixamo packs as offline donors for the Warlock motion trial.

Run with Blender --background --python scripts/assets/export_warlock_motion_donors.py.
Only a mesh-free intermediate is written under tmp; the Node pose baker owns
the shipping Warlock clips. The Druid runtime model is never modified.
"""
from __future__ import annotations

import sys
import tempfile
import zipfile
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT.parent / "bible/models/characters/t1/mixamo_rigged/druid"
OUTPUT = ROOT / "tmp/warlock_motion/mixamo_donors.glb"
BASE = "Meshy_AI_Verdant_Warden_1009120544_texture_fbx_mixamo.fbx"
CLIPS = (
    ("Locomotion Pack.zip", "idle.fbx", "Pack_Idle"),
    (None, "Idle.fbx", "Pack_IdleArmSpace"),
    ("Locomotion Pack.zip", "walking.fbx", "Pack_Walk"),
    ("Locomotion Pack.zip", "running.fbx", "Pack_Run"),
    ("Pro Magic Pack.zip", "Standing Idle 03.fbx", "Pack_PlayingWithMagic"),
    ("Pro Magic Pack.zip", "Standing 1H Magic Attack 01.fbx", "Pack_ThrowShadow"),
    ("Pro Magic Pack.zip", "Standing 1H Magic Attack 02.fbx", "Pack_ThrowFire"),
    ("Pro Magic Pack.zip", "Standing 1H Magic Attack 03.fbx", "Pack_ThrowUpward"),
    ("Pro Melee Axe Pack.zip", "standing idle.fbx", "Pack_StaffIdle"),
)

sys.path.insert(0, str(ROOT / "scripts/anim"))
from blender_bake_meshy_titan import add_clip, clear_animation, export_glb, import_base


def extract(archive: str | None, entry: str, destination: Path) -> Path:
    if archive is None:
        destination.write_bytes((PACKS / entry).read_bytes())
    else:
        with zipfile.ZipFile(PACKS / archive) as package:
            destination.write_bytes(package.read(entry))
    return destination


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="donors_", dir=OUTPUT.parent) as temporary:
        directory = Path(temporary)
        rig, mesh = import_base(extract("Locomotion Pack.zip", BASE, directory / "base.fbx"))
        anchor_x, anchor_z = clear_animation(rig)
        bpy.context.scene.render.fps = 30
        for archive, source, name in CLIPS:
            path = extract(archive, source, directory / f"{name}.fbx")
            add_clip(rig, path, name, anchor_x, anchor_z)
            print(f"Imported {source} as {name}", flush=True)
        bpy.data.objects.remove(mesh, do_unlink=True)
        export_glb(OUTPUT, rig, [])
    print(f"Wrote {OUTPUT}", flush=True)


if __name__ == "__main__":
    main()
