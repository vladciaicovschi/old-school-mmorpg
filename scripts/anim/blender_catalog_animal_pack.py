"""Inventory the owner's Quaternius FBX archive and sample canine references.

Run Blender --background --python-exit-code 1 --python this_file.py.
The catalog records provenance and available motions for future animal work.
Reference geometry stays in tmp; it is never installed as a creature body.
"""
from __future__ import annotations

import hashlib
import json
import sys
import zipfile
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT.parent / "bible/models/mobs/quanternius_animal_pack/FBX-20261018T182644Z-1-001.zip"
CACHE = ROOT / "tmp/animal-motion-reference"
CATALOG = ROOT / "docs/design/quaternius-animal-reference.json"
LANDMARKS = ["Back", "Torso2", "Torso3", "Neck1", "Head", "Head_end",
             "FrontShoulder.L", "FrontShoulder.R", "FrontLowerLeg.L_end", "FrontLowerLeg.R_end",
             "BackLowerLeg.L_end", "BackLowerLeg.R_end", "Tail1", "Tail4"]


def select_action(rig, action):
    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]
    bpy.context.view_layer.update()


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    catalog = {"source": str(ARCHIVE.relative_to(ROOT.parent)).replace("\\", "/"),
               "archive_sha256": hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),
               "author": "Quaternius", "license": "CC0",
               "url": "https://quaternius.com/packs/ultimateanimatedanimals.html", "animals": []}
    with zipfile.ZipFile(ARCHIVE) as archive:
        for member in sorted(archive.namelist()):
            if not member.lower().endswith(".fbx"):
                continue
            # Flatten archive names to an owned cache, never extract arbitrary paths.
            path = CACHE / Path(member).name
            path.write_bytes(archive.read(member))
            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.ops.import_scene.fbx(filepath=str(path))
            rig = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
            fps = bpy.context.scene.render.fps
            actions = list(bpy.data.actions)
            entry = {"model": path.stem, "fbx_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                     "bones": len(rig.data.bones), "fps": fps,
                     "clips": [{"name": a.name.rsplit("|", 1)[-1],
                                "seconds": round((a.frame_range[1] - a.frame_range[0]) / fps, 5)}
                               for a in actions]}
            catalog["animals"].append(entry)
            if path.stem == "Wolf":
                samples = {}
                for action in actions:
                    name = action.name.rsplit("|", 1)[-1]
                    if name not in ("Walk", "Gallop", "Attack"):
                        continue
                    select_action(rig, action)
                    start, end = action.frame_range
                    frames = []
                    for index in range(121):
                        frame = start + (end - start) * index / 120
                        bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
                        frames.append({name: {"position": list(rig.pose.bones[name].matrix.translation),
                                             "rotation": list(rig.pose.bones[name].matrix.to_quaternion())}
                                       for name in LANDMARKS})
                    samples[name] = {"seconds": (end - start) / fps, "frames": frames}
                (CACHE / "wolf-landmarks.json").write_text(json.dumps(samples), encoding="utf8")
                rig.animation_data.action = None
                for action in actions:
                    track = rig.animation_data.nla_tracks.new()
                    track.name = action.name.rsplit("|", 1)[-1]
                    track.strips.new(track.name, int(action.frame_range[0]), action)
                sys.path.insert(0, str(ROOT / "scripts/anim"))
                from blender_bake_meshy_titan import export_glb
                export_glb(CACHE / "wolf-reference.glb", rig,
                           [obj for obj in bpy.data.objects if obj.type == "MESH"])
            print(f"Cataloged {path.stem}: {len(actions)} motions", flush=True)
    CATALOG.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf8", newline="\n")


if __name__ == "__main__":
    main()
