"""Build the T1 Arcane Sentinel warlock from Mixamo animation packs.

The original Meshy archive supplies all shipped PBR maps. The two Mixamo packs
supply one shared rig plus magic and staff-style melee motion respectively.
"""
from __future__ import annotations

import json
import sys
import tempfile
import zipfile
import argparse
from dataclasses import dataclass
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
BIBLE = ROOT.parent / 'bible/models/characters/t1'
MAGIC_ARCHIVE = BIBLE / 'mixamo_rigged/warlok/Pro Magic Pack.zip'
AXE_ARCHIVE = BIBLE / 'mixamo_rigged/warlok/Pro Melee Axe Pack.zip'
SOURCE_ARCHIVE = BIBLE / 'Meshy_AI_Arcane_Sentinel_1009120720_texture_fbx.zip'
OUTPUT = ROOT / 'tmp/asset_src/players/warlock_t1'
BLEND_FILE = OUTPUT / 'warlock_t1_work.blend'
TEMP_ROOT = OUTPUT / 'blender_tmp'
TEMP_ROOT.mkdir(parents=True, exist_ok=True)
tempfile.tempdir = str(TEMP_ROOT)

sys.path.insert(0, str(ROOT / 'scripts/anim'))
from blender_bake_meshy_titan import add_clip, clear_animation, export_glb, import_base, render_preview

BASE_FBX = 'Meshy_AI_Arcane_Sentinel_1009120720_texture_fbx_mixamo.fbx'

@dataclass(frozen=True)
class Clip:
    archive: Path
    source: str
    name: str

CLIPS = (
    Clip(MAGIC_ARCHIVE, 'standing idle.fbx', 'WarlockT1_Idle'),
    Clip(MAGIC_ARCHIVE, 'standing idle 02.fbx', 'WarlockT1_CombatIdle'),
    Clip(MAGIC_ARCHIVE, 'Standing Walk Forward.fbx', 'WarlockT1_Walk'),
    Clip(MAGIC_ARCHIVE, 'Standing Run Forward.fbx', 'WarlockT1_Run'),
    Clip(MAGIC_ARCHIVE, 'Standing Jump.fbx', 'WarlockT1_Jump'),
    Clip(MAGIC_ARCHIVE, 'Standing React Death Backward.fbx', 'WarlockT1_Death'),
    Clip(MAGIC_ARCHIVE, 'Standing 1H Magic Attack 01.fbx', 'WarlockT1_CastShadow'),
    Clip(MAGIC_ARCHIVE, 'Standing 1H Magic Attack 02.fbx', 'WarlockT1_CastFire'),
    Clip(MAGIC_ARCHIVE, 'Standing 2H Cast Spell 01.fbx', 'WarlockT1_CastDrain'),
    Clip(MAGIC_ARCHIVE, 'Standing 2H Magic Area Attack 02.fbx', 'WarlockT1_CastArea'),
    # These axe-pack motions are intentionally retained as two-handed staff
    # strikes: the body action drives the common Mixamo rig, while the staff
    # itself is attached at runtime to the right hand.
    Clip(AXE_ARCHIVE, 'standing melee attack horizontal.fbx', 'WarlockT1_StaffStrikeHorizontal'),
    Clip(AXE_ARCHIVE, 'standing melee attack downward.fbx', 'WarlockT1_StaffStrikeDownward'),
    Clip(AXE_ARCHIVE, 'standing melee attack backhand.fbx', 'WarlockT1_StaffStrikeBackhand'),
)


def extract_maps(archive: Path, output: Path) -> dict[str, Path]:
    markers = {
        'base': lambda stem: not any(token in stem for token in ('normal', 'metallic', 'roughness')),
        'normal': lambda stem: 'normal' in stem,
        'metallic': lambda stem: 'metallic' in stem,
        'roughness': lambda stem: 'roughness' in stem,
    }
    found: dict[str, Path] = {}
    with zipfile.ZipFile(archive) as package:
        images = [entry for entry in package.infolist() if entry.filename.lower().endswith(('.png', '.jpg', '.jpeg'))]
        for kind, matches in markers.items():
            candidates = [entry for entry in images if matches(Path(entry.filename).stem.lower())]
            if len(candidates) != 1:
                raise RuntimeError(f'{archive.name}: expected one {kind} map, found {len(candidates)}')
            suffix = Path(candidates[0].filename).suffix.lower()
            target = output / f'{kind}{suffix}'
            target.write_bytes(package.read(candidates[0]))
            found[kind] = target
    return found


def build_material(maps: dict[str, Path]) -> bpy.types.Material:
    material = bpy.data.materials.new('warlock_t1_source_pbr')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output, shader = nodes.new('ShaderNodeOutputMaterial'), nodes.new('ShaderNodeBsdfPrincipled')
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    for kind, socket in (('base', 'Base Color'), ('roughness', 'Roughness'), ('metallic', 'Metallic')):
        texture = nodes.new('ShaderNodeTexImage')
        texture.name = kind.title()
        texture.image = bpy.data.images.load(str(maps[kind]), check_existing=False)
        if kind != 'base':
            texture.image.colorspace_settings.name = 'Non-Color'
        links.new(texture.outputs['Color'], shader.inputs[socket])
    texture = nodes.new('ShaderNodeTexImage')
    texture.name = 'Normal'
    texture.image = bpy.data.images.load(str(maps['normal']), check_existing=False)
    texture.image.colorspace_settings.name = 'Non-Color'
    normal = nodes.new('ShaderNodeNormalMap')
    links.new(texture.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    return material


def extract_animation(source: Clip, destination: Path) -> Path:
    with zipfile.ZipFile(source.archive) as package:
        destination.write_bytes(package.read(source.source))
    return destination


def select_action(rig: bpy.types.Object, name: str) -> None:
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    rig.animation_data.action = bpy.data.actions[name]
    if rig.animation_data.action.slots:
        rig.animation_data.action_slot = rig.animation_data.action.slots[0]
    bpy.context.scene.frame_set(0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', type=int, choices=range(1, len(CLIPS) + 2), default=len(CLIPS) + 1)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else [])
    for path in (MAGIC_ARCHIVE, AXE_ARCHIVE, SOURCE_ARCHIVE):
        if not path.is_file():
            raise RuntimeError(f'Missing source: {path}')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='warlock_t1_sources_') as temp:
        sources = Path(temp)
        if args.stage == 1:
            with zipfile.ZipFile(MAGIC_ARCHIVE) as package:
                (sources / BASE_FBX).write_bytes(package.read(BASE_FBX))
            rig, mesh = import_base(sources / BASE_FBX)
            rig.name, mesh.name, mesh.data.name = 'warlock_t1_Rig', 'warlock_t1_Body', 'warlock_t1_Body'
            anchor_x, anchor_z = clear_animation(rig)
            rig['mixamo_anchor_x'] = anchor_x
            rig['mixamo_anchor_z'] = anchor_z
            bpy.context.scene.render.fps = 30
        else:
            if not BLEND_FILE.is_file():
                raise RuntimeError('Run --stage 1 before continuing the warlock export')
            bpy.ops.wm.open_mainfile(filepath=str(BLEND_FILE))
            rig = bpy.data.objects['warlock_t1_Rig']
            mesh = bpy.data.objects['warlock_t1_Body']
            anchor_x, anchor_z = float(rig['mixamo_anchor_x']), float(rig['mixamo_anchor_z'])
        if args.stage <= len(CLIPS):
            clip = CLIPS[args.stage - 1]
            donor = extract_animation(clip, sources / f'{clip.name}.fbx')
            add_clip(rig, donor, clip.name, anchor_x, anchor_z)
        if args.stage <= len(CLIPS):
            bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_FILE))
            print(f'Saved stage {args.stage} to {BLEND_FILE}', flush=True)
            return
        with tempfile.TemporaryDirectory(prefix='warlock_t1_maps_') as maps_temp:
            mesh.data.materials.clear()
            mesh.data.materials.append(build_material(extract_maps(SOURCE_ARCHIVE, Path(maps_temp))))
            rig['source'] = 'Meshy Arcane Sentinel original PBR, Mixamo magic and pro melee axe packs'
            rig['staff_attack_note'] = 'Axe-pack body motions retained as staff strikes on the common Mixamo skeleton'
            output = OUTPUT / 'warlock_t1.glb'
            export_glb(output, rig, [mesh])
    report = {'output': str(output.relative_to(ROOT)), 'bones': len(rig.data.bones), 'vertices': len(mesh.data.vertices), 'triangles': len(mesh.data.polygons), 'clips': [clip.name for clip in CLIPS]}
    (OUTPUT / 'warlock_t1.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2), flush=True)

if __name__ == '__main__':
    main()
