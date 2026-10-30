"""Mesh-free hunter Longbow / Rifle / locomotion donors, headless only."""
from pathlib import Path
import sys
import tempfile
import zipfile

import bpy

ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT.parent / 'bible/models/characters/t1/mixamo_rigged'
OUTPUT = ROOT / 'tmp/hunter_motion/donors.glb'
sys.path.insert(0, str(ROOT / 'scripts/anim'))
from blender_bake_meshy_titan import add_clip, clear_animation, export_glb, import_base

BOW = 'hunter/Pro Longbow Pack.zip'
RIFLE = 'druid/Pro Rifle Pack.zip'
BASE = 'Meshy_AI_The_Hooded_Pathfinder_1009120609_texture_fbx_mixamo.fbx'
CLIPS = (
    (BOW, 'standing idle 01.fbx', 'Bow_Idle'),
    (BOW, 'standing walk forward.fbx', 'Bow_Walk'),
    (BOW, 'standing walk back.fbx', 'Bow_WalkBack'),
    (BOW, 'standing run forward.fbx', 'Bow_Run'),
    (BOW, 'standing draw arrow.fbx', 'Bow_Draw'),
    (BOW, 'standing aim overdraw.fbx', 'Bow_Aim'),
    (BOW, 'standing aim recoil.fbx', 'Bow_Release'),
    (BOW, 'standing melee punch.fbx', 'Melee_Punch'),
    (BOW, 'standing melee kick.fbx', 'Melee_Kick'),
    (BOW, 'unarmed idle 01.fbx', 'Utility'),
    ('druid/Pro Magic Pack.zip', 'Standing 1H Magic Attack 03.fbx', 'Buff_Raise'),
    (BOW, 'standing react small from front.fbx', 'Hit'),
    (RIFLE, 'idle.fbx', 'Crossbow_Idle'),
    (RIFLE, 'idle aiming.fbx', 'Crossbow_Aim'),
    ('druid/Locomotion Pack.zip', 'jump.fbx', 'Unarmed_Jump'),
)

def extract(archive, filename, destination):
    with zipfile.ZipFile(PACKS / archive) as package:
        destination.write_bytes(package.read(filename))
    return destination

def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tempfile.tempdir = str(OUTPUT.parent)
    with tempfile.TemporaryDirectory(prefix='hunter_', dir=OUTPUT.parent) as temporary:
        directory = Path(temporary)
        rig, mesh = import_base(extract(BOW, BASE, directory / 'base.fbx'))
        anchor_x, anchor_z = clear_animation(rig)
        bpy.context.scene.render.fps = 30
        for archive, filename, name in CLIPS:
            add_clip(rig, extract(archive, filename, directory / f'{name}.fbx'),
                     name, anchor_x, anchor_z)
            print(f'Imported {name}: {filename}', flush=True)
        bpy.data.objects.remove(mesh, do_unlink=True)
        export_glb(OUTPUT, rig, [])
    print(f'Wrote {OUTPUT}', flush=True)

if __name__ == '__main__':
    main()
