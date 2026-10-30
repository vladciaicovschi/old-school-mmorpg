"""Rebuild Warlock's mesh-free magic donor from the preserved Shaman Mixamo pack.

The original warlock Pro Magic Pack was removed after its T1 export. Shaman's
copy has the same Mixamo action set and bone contract, so its actions can be
exported against a standard Mixamo skeleton rather than a donor with unrelated
legacy bone names.
"""
from __future__ import annotations

import sys
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
BIBLE = ROOT.parent / "bible/models/characters/t1/mixamo_rigged/shaman/Pro Magic Pack.zip"
OUTPUT = ROOT / "public/models/chars/players/warlock_ability_anims.glb"
BASE_FBX = "Meshy_AI_Ironbound_Highlander_1009120750_texture_fbx_mixamo.fbx"
TEMP_ROOT = ROOT / "tmp/asset_src/players/warlock_cast_donor"

sys.path.insert(0, str(ROOT / "scripts/anim"))
from blender_bake_meshy_titan import export_glb  # noqa: E402


@dataclass(frozen=True)
class Clip:
    source: str
    name: str


CLIPS = (
    Clip("Standing 1H Magic Attack 01.fbx", "Warlock_Cast_Shadow"),
    Clip("Standing 1H Magic Attack 02.fbx", "Warlock_Cast_Fire"),
    Clip("Standing 2H Cast Spell 01.fbx", "Warlock_Cast_Drain"),
    Clip("Standing 2H Magic Area Attack 02.fbx", "Warlock_Cast_Burst"),
)


def add_shared_mixamo_clip(base_rig: bpy.types.Object, source: Path, name: str) -> None:
    """Mount a source-pack action on the shared Mixamo skeleton unchanged.

    The actions and the base use an identical Mixamo bone contract.  Keeping
    the original sampled keys avoids retargeting noise and the overly strict
    Blender 5.2 playback check in the generic Meshy retargeter.
    """
    before_objects = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    if bpy.ops.import_scene.fbx(filepath=str(source), use_anim=True) != {"FINISHED"}:
        raise RuntimeError(f"Could not import animation {source}")
    donors = [obj for obj in bpy.data.objects if obj not in before_objects]
    donor_rigs = [obj for obj in donors if obj.type == "ARMATURE"]
    actions = [action for action in bpy.data.actions if action not in before_actions]
    if len(donor_rigs) != 1 or len(actions) != 1:
        raise RuntimeError(f"Expected one donor rig/action for {source.name}")
    if {bone.name for bone in donor_rigs[0].data.bones} != {bone.name for bone in base_rig.data.bones}:
        raise RuntimeError(f"Mixamo skeleton mismatch in {source.name}")
    action = actions[0]
    action.name = name
    track = base_rig.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 0, action)
    strip.name = name
    for obj in donors:
        bpy.data.objects.remove(obj, do_unlink=True)


def main() -> None:
    if not BIBLE.is_file():
        raise RuntimeError(f"Missing source pack: {BIBLE}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    # Blender runs in the desktop application's sandbox, whose system Temp is
    # not writable. Keep short-lived FBX files inside this workspace instead.
    with tempfile.TemporaryDirectory(prefix="magic_", dir=TEMP_ROOT) as raw:
        directory = Path(raw)
        with zipfile.ZipFile(BIBLE) as package:
            base_path = directory / BASE_FBX
            base_path.write_bytes(package.read(BASE_FBX))
            if bpy.ops.import_scene.fbx(filepath=str(base_path), use_anim=True) != {"FINISHED"}:
                raise RuntimeError(f"Could not import {BASE_FBX}")
            rigs = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
            if len(rigs) != 1:
                raise RuntimeError(f"Expected one Mixamo armature, found {len(rigs)}")
            rig = rigs[0]
            # Only the tracks created below belong in this donor GLB.
            rig.animation_data_clear()
            rig.animation_data_create()
            for clip in CLIPS:
                path = directory / clip.source
                path.write_bytes(package.read(clip.source))
                add_shared_mixamo_clip(rig, path, clip.name)
    # Selection-driven export with no meshes makes this a compact clip donor.
    export_glb(OUTPUT, rig, [])
    print(f"Wrote {OUTPUT} from {BIBLE}; uses the shared Mixamo bone contract")


if __name__ == "__main__":
    main()
