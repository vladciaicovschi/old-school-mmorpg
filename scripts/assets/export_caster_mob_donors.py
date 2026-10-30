"""Import the lab acolyte and native two-hand magic donors, without previews.

Run Blender --background --python-exit-code 1 --python this_file.py.
The Node caster-mob baker owns target-specific shipping animations.
"""
import sys
import tempfile
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/anim"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import add_clip, clear_animation, export_glb, import_base
import export_meshy_test_minions as minions
import export_warlock_motion_donors as source

OUTPUT = ROOT / "tmp/caster_mob_motion/donors.glb"


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tempfile.tempdir = str(OUTPUT.parent)
    if "--donors-only" not in sys.argv:
        bible = ROOT.parent / "bible/models/skeletons"
        minions.build_one(minions.MinionBuild(
            asset_id="dev_skeleton_acolyte",
            archive=bible / "mixamo_rigged/acolite.zip",
            texture_dir=bible / "mixamo_ready_fixed/acolite/source_pbr",
            clip_prefix="Acolyte",
            base_fbx="acolite_mixamo.fbx",
            animation_files=minions.CULTIST_ANIMATION_FILES,
            idle_filename="standing idle.fbx",
            source_label="User-provided Meshy acolyte; original PBR and Mixamo magic pack",
        ), render_idle_preview=False)
    with tempfile.TemporaryDirectory(prefix="caster_donors_", dir=OUTPUT.parent) as temporary:
        directory = Path(temporary)
        rig, mesh = import_base(source.extract("Locomotion Pack.zip", source.BASE, directory / "base.fbx"))
        anchor_x, anchor_z = clear_animation(rig)
        bpy.context.scene.render.fps = 30
        clips = [("Standing Idle 03.fbx", "Mob_PlayingWithMagic"),
                 ("Standing 2H Cast Spell 01.fbx", "Mob_TwoHandPreparation")]
        clips += [(f"Standing 2H Magic Attack {i:02d}.fbx", f"Mob_TwoHandAttack{i:02d}") for i in range(1, 6)]
        for filename, name in clips:
            path = source.extract("Pro Magic Pack.zip", filename, directory / f"{name}.fbx")
            add_clip(rig, path, name, anchor_x, anchor_z)
            print(f"Imported {filename} as {name}", flush=True)
        bpy.data.objects.remove(mesh, do_unlink=True)
        export_glb(OUTPUT, rig, [])
    print(f"Wrote {OUTPUT}", flush=True)


if __name__ == "__main__":
    main()
