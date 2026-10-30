"""Sample the owner's ungulate and dinosaur references without shipping donor meshes."""
import hashlib
import json
import zipfile
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'tmp/deer-raptor/references'


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    entries = []
    for archive_path in (ROOT.parent / 'bible/models/mobs/animations').rglob('*.zip'):
        with zipfile.ZipFile(archive_path) as archive:
            for member in archive.namelist():
                if Path(member).stem not in ('Deer', 'Stag', 'Velociraptor'):
                    continue
                source = CACHE / Path(member).name
                source.write_bytes(archive.read(member))
                bpy.ops.wm.read_factory_settings(use_empty=True)
                bpy.ops.import_scene.fbx(filepath=str(source))
                rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
                fps = bpy.context.scene.render.fps
                clips = []
                for action in bpy.data.actions:
                    rig.animation_data.action = action
                    if action.slots:
                        rig.animation_data.action_slot = action.slots[0]
                    start, end = action.frame_range
                    samples = []
                    for index in range(25):
                        frame = start + (end-start)*index/24
                        bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
                        samples.append({b.name: list(b.matrix.translation) for b in rig.pose.bones
                                        if any(s in b.name.lower() for s in ('head', 'tail1', 'lowerleg', 'foot', 'torso', 'back'))})
                    clips.append({'name': action.name.rsplit('|', 1)[-1], 'seconds': (end-start)/fps,
                                  'landmarks': samples})
                entries.append({'model': source.stem, 'archive': archive_path.name,
                                'archive_sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(),
                                'fps': fps, 'clips': clips})
                print(source.stem, [(c['name'], round(c['seconds'], 3)) for c in clips], flush=True)
    (CACHE / 'samples.json').write_text(json.dumps(entries, indent=2)+'\n', encoding='utf8')


if __name__ == '__main__':
    main()
