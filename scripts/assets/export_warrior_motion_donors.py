"""Import native unarmed, sword/shield, one-hand and great-sword motion donors.

Blender --background --factory-startup --python scripts/assets/export_warrior_motion_donors.py
Writes only a mesh-free intermediate; build_warrior_motion_anims.mjs owns shipping clips.
"""
from __future__ import annotations

import sys
import tempfile
import zipfile
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT.parent / "bible/models/characters/t1/mixamo_rigged"
OUTPUT = ROOT / "tmp/warrior_motion/mixamo_donors.glb"
BASE = "Meshy_AI_Quilted_Wayfarer_1009120524_texture_fbx_mixamo.fbx"
SHIELD = "warior/Pro Sword and Shield Pack.zip"
GREAT = "warior/Great Sword Pack.zip"
AXE = "warior/Pro Melee Axe Pack.zip"
CLIPS = (
    ("druid/Locomotion Pack.zip", "idle.fbx", "Unarmed_Idle"),
    ("druid/Locomotion Pack.zip", "walking.fbx", "Unarmed_Walk"),
    ("druid/Locomotion Pack.zip", "running.fbx", "Unarmed_Run"),
    ("druid/Locomotion Pack.zip", "jump.fbx", "Unarmed_Jump"),
    (SHIELD, "sword and shield idle.fbx", "Shield_Idle"),
    (SHIELD, "sword and shield walk.fbx", "Shield_Walk"),
    (SHIELD, "sword and shield run.fbx", "Shield_Run"),
    (SHIELD, "sword and shield jump.fbx", "Shield_Jump"),
    (SHIELD, "sword and shield slash.fbx", "Shield_AttackA"),
    (SHIELD, "sword and shield slash (2).fbx", "Shield_AttackB"),
    (SHIELD, "sword and shield attack.fbx", "Shield_AttackC"),
    (SHIELD, "sword and shield slash (3).fbx", "Shield_AttackD"),
    (SHIELD, "sword and shield slash (4).fbx", "Shield_AttackE"),
    # slash (5) is a sustained crouch. Use the upright weapon-arm strike.
    (SHIELD, "sword and shield attack (4).fbx", "Shield_AttackF"),
    (SHIELD, "sword and shield block.fbx", "Shield_Block"),
    (SHIELD, "sword and shield impact.fbx", "Shield_Hit"),
    (SHIELD, "sword and shield casting.fbx", "Shield_Cast"),
    (GREAT, "great sword idle.fbx", "TwoHand_Idle"),
    (GREAT, "great sword walk.fbx", "TwoHand_Walk"),
    (GREAT, "great sword run.fbx", "TwoHand_Run"),
    (GREAT, "great sword jump.fbx", "TwoHand_Jump"),
    (GREAT, "great sword slash.fbx", "TwoHand_AttackA"),
    (GREAT, "great sword slash (2).fbx", "TwoHand_AttackB"),
    (GREAT, "great sword attack.fbx", "TwoHand_AttackC"),
    (GREAT, "great sword slash (3).fbx", "TwoHand_AttackD"),
    (GREAT, "great sword slash (4).fbx", "TwoHand_AttackE"),
    # slash (4) spins; the standard attack stays upright and grounded.
    (GREAT, "great sword attack.fbx", "TwoHand_AttackF"),
    (GREAT, "great sword blocking.fbx", "TwoHand_Block"),
    (GREAT, "great sword impact.fbx", "TwoHand_Hit"),
    (GREAT, "great sword casting.fbx", "TwoHand_Cast"),
    (AXE, "standing idle.fbx", "OneHand_Idle"),
    (AXE, "standing walk forward.fbx", "OneHand_Walk"),
    (AXE, "standing run forward.fbx", "OneHand_Run"),
    (AXE, "standing jump.fbx", "OneHand_Jump"),
    (AXE, "standing melee attack horizontal.fbx", "OneHand_AttackA"),
    (AXE, "standing melee attack downward.fbx", "OneHand_AttackB"),
    (AXE, "standing melee attack backhand.fbx", "OneHand_AttackC"),
    (AXE, "standing block react large.fbx", "OneHand_Block"),
    (AXE, "standing react large gut.fbx", "OneHand_Hit"),
    (AXE, "standing taunt battlecry.fbx", "OneHand_Cast"),
)

sys.path.insert(0, str(ROOT / "scripts/anim"))
from blender_bake_meshy_titan import add_clip, clear_animation, export_glb, import_base


def extract(archive: str, entry: str, destination: Path) -> Path:
    with zipfile.ZipFile(PACKS / archive) as package:
        destination.write_bytes(package.read(entry))
    return destination


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="donors_", dir=OUTPUT.parent) as temporary:
        directory = Path(temporary)
        rig, mesh = import_base(extract(SHIELD, BASE, directory / "base.fbx"))
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
