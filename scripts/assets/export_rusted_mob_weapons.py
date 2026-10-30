"""Split the Rustbound Warband arsenal into grip-origin game weapon GLBs.

The maintainer-local source ZIP is extracted under tmp/asset_src before running:
  blender --background --factory-startup --python scripts/assets/export_rusted_mob_weapons.py
"""

from __future__ import annotations

import json
from pathlib import Path
import tempfile

import bpy
from mathutils import Matrix, Vector
ROOT = Path(__file__).resolve().parents[2]
TEMP_ROOT = ROOT / 'tmp' / 'asset_src' / 'mobs_rusted_weapons' / 'blender_tmp'
TEMP_ROOT.mkdir(parents=True, exist_ok=True)
tempfile.tempdir = str(TEMP_ROOT)
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_meshy_weapon_sets as shared

SOURCE_ROOT = ROOT / 'tmp' / 'asset_src' / 'mobs_rusted_weapons' / 'source'
OUTPUT_ROOT = ROOT / 'tmp' / 'asset_src' / 'mobs_rusted_weapons' / 'raw'

# The source FBX lays its disconnected objects out left to right: three swords,
# then a club, a pickaxe and a pitchfork. Their shared +Z axis points from grip
# to tip, so every item can use the same low-handle origin.
COMPONENTS = (
    'rusted_sword_1',
    'rusted_sword_2',
    'rusted_sword_3',
    'rusted_ogre_club',
    'rusted_kobold_pickaxe',
    'rusted_murloc_pitchfork',
)


def origin_at_handle(obj: bpy.types.Object, name: str) -> None:
    lo, hi = shared.object_bounds(obj)
    size = hi - lo
    grip = Vector(((lo.x + hi.x) * 0.5, (lo.y + hi.y) * 0.5, lo.z + size.z * 0.08))
    obj.data.transform(Matrix.Translation(-grip))
    obj.matrix_world = Matrix.Identity(4)
    obj.data.update()
    obj['grip_origin'] = 'low_handle'
    obj['source'] = 'Meshy AI Rustbound Warband Arsenal, 2026-10-09'
    obj.name = name
    obj.data.name = f'{name}_Mesh'


def main() -> None:
    source = next(SOURCE_ROOT.rglob('*.fbx'), None)
    if source is None:
        raise FileNotFoundError(f'Missing extracted source FBX under {SOURCE_ROOT}')
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(source), use_anim=False)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    carrier = max(meshes, key=lambda obj: len(obj.data.polygons))
    carrier.data.materials.clear()
    carrier.data.materials.append(shared.build_material(source, 'rusted_mob_weapons_pbr'))
    components = shared.connected_components(carrier.data)
    if len(components) != len(COMPONENTS):
        raise RuntimeError(f'Expected {len(COMPONENTS)} weapon components, found {len(components)}')
    components.sort(key=lambda item: shared.component_bounds(carrier, item)[0].x)
    carrier.hide_set(True)
    carrier.hide_render = True
    report = []
    for name, component in zip(COMPONENTS, components, strict=True):
        weapon = shared.isolate_component(carrier, component, name)
        origin_at_handle(weapon, name)
        shared.decimate(weapon)
        report.append(shared.export_glb(weapon, OUTPUT_ROOT / f'{name}.glb'))
        weapon.hide_set(True)
    (OUTPUT_ROOT / 'export_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
