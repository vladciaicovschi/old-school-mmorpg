"""Import owner-supplied tribal weapons, preserving PBR with explicit grip axes.

blender --background --factory-startup --threads 4 --python scripts/assets/export_community_tribal_weapons.py
Then build_assets.mjs specs/community_tribal_weapons.json and scoped KTX2 conversion.
Blender +Z (glTF +Y) points from handle to tip, matching the existing weapon family.
"""
from __future__ import annotations
import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile
import zipfile
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'tmp' / 'tribal-weapons'
WORK.mkdir(parents=True, exist_ok=True)
tempfile.tempdir = str(WORK)
SOURCE = ROOT.parent / 'bible' / 'models' / 'mobs' / 'comunity' / 'weapons'
RAW = ROOT / 'tmp' / 'asset_src' / 'community_tribal_weapons'
sys.path.insert(0, str(Path(__file__).parent))
import export_meshy_weapon_sets as shared

PACKS = [
    ('ancient_ram_spear', '*Ancient_Ram_Spear*.zip', 3.6, .38),
    ('arcanum_axe', '*Arcanum_Axe*.zip', 1.6, .15),
    ('primitive_spear', '*Primitive_Spear*.zip', 3.6, .38),
    ('savage_axe', '*Savage_Axe*.zip', 1.6, .15),
    ('stone_axe', '*Stone_Axe*.zip', 1.6, .15),
    ('stone_tipped_spear', '*Stone_Tipped_Spear*.zip', 3.6, .38),
    ('wooden_club', '*wooden_Club*.zip', 1.5, .15),
]
TARGET_TRIANGLES = 12000


def extract(archive, destination):
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as packed:
        for info in packed.infolist():
            path = (destination / info.filename).resolve()
            if not path.is_relative_to(destination.resolve()):
                raise RuntimeError('Archive path leaves its source directory')
        packed.extractall(destination)


def material(source, name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = 0
    shader.inputs['Roughness'].default_value = 1
    shader.inputs['Specular IOR Level'].default_value = 0
    shader.inputs['Alpha'].default_value = 1
    files = {'base': source.with_suffix('.png'),
             **{k: source.with_name(source.stem + '_' + k + '.png')
                for k in ['normal', 'roughness', 'metallic']}}
    if not files['base'].is_file():
        raise FileNotFoundError(files['base'])
    for kind, path in files.items():
        if not path.is_file():
            continue
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(str(path), check_existing=True)
        tex.image.colorspace_settings.name = 'sRGB' if kind == 'base' else 'Non-Color'
        if kind == 'normal':
            normal = nodes.new('ShaderNodeNormalMap')
            links.new(tex.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], shader.inputs['Normal'])
        elif kind == 'base':
            links.new(tex.outputs['Color'], shader.inputs['Base Color'])
        # Original metal/roughness maps remain in the archive. These tribal
        # surfaces deliberately use a diffuse response, matching the bodies.
    return mat, [str(p.relative_to(ROOT.parent)) for p in files.values() if p.is_file()]


def triangle_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def width_in_band(obj, lo, hi, fraction_low, fraction_high):
    span = hi.z - lo.z
    selected = [v.co for v in obj.data.vertices if lo.z + span * fraction_low <= v.co.z <= lo.z + span * fraction_high]
    if not selected:
        return 0
    return max(max(v.x for v in selected)-min(v.x for v in selected),
               max(v.y for v in selected)-min(v.y for v in selected))


def orient(obj, length, fraction):
    lo, hi = shared.object_bounds(obj)
    spans = hi - lo
    source_axis = max(range(3), key=lambda axis: spans[axis])
    axis = Vector(tuple(1 if n == source_axis else 0 for n in range(3)))
    rot = axis.rotation_difference(Vector((0,0,1))).to_matrix().to_4x4()
    obj.data.transform(rot)
    lo, hi = shared.object_bounds(obj)
    lower = width_in_band(obj, lo, hi, .07, .30)
    upper = width_in_band(obj, lo, hi, .70, .93)
    flipped = lower > upper * 1.12
    if flipped:
        obj.data.transform(Matrix.Rotation(math.pi, 4, 'Y'))
        rot = Matrix.Rotation(math.pi, 4, 'Y') @ rot
    lo, hi = shared.object_bounds(obj)
    source_length = hi.z-lo.z
    z = lo.z + source_length * fraction
    shaft = [v.co for v in obj.data.vertices if abs(v.co.z-z) < source_length * .025]
    if not shaft:
        raise RuntimeError('No handle vertices near the chosen grip plane')
    x = (min(v.x for v in shaft)+max(v.x for v in shaft))*.5
    y = (min(v.y for v in shaft)+max(v.y for v in shaft))*.5
    grip = Vector((x,y,z))
    scale = length / source_length
    obj.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation(-grip))
    obj.data.update()
    return {'sourceLongAxis': 'XYZ'[source_axis], 'headFlipped': flipped,
            'sourceLengthMeters': source_length, 'canonicalLength': length,
            'gripFractionFromButt': fraction, 'sourceOrientedGrip': list(grip),
            'axis': 'Blender +Z / glTF +Y', 'sourceToCanonicalScale': scale}


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    reports = []
    for name, pattern, length, fraction in PACKS:
        archive, = SOURCE.glob(pattern)
        destination = WORK / 'source' / name
        extract(archive, destination)
        fbx, = destination.rglob('*.fbx')
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=str(fbx), use_anim=False)
        if any(obj.type == 'ARMATURE' for obj in bpy.context.scene.objects):
            raise RuntimeError('Static weapon unexpectedly has a rig')
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
        if not meshes:
            raise RuntimeError('Missing weapon mesh')
        for obj in meshes:
            obj.data.transform(obj.matrix_world)
            obj.matrix_world = Matrix.Identity(4)
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        mat, maps = material(fbx, name + '_pbr')
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        original = triangle_count(obj)
        orientation = orient(obj, length, fraction)
        obj.name = name
        obj.data.name = name + '_Mesh'
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        obj['source_sha256'] = digest
        obj['original_triangles'] = original
        obj['grip_origin'] = 'handle'
        obj['long_axis'] = 'glTF +Y'
        obj['canonical_length'] = length
        if original > TARGET_TRIANGLES:
            modifier = obj.modifiers.new('Static weapon triangle budget', 'DECIMATE')
            modifier.ratio = TARGET_TRIANGLES / original
            modifier.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        result = shared.export_glb(obj, RAW / (name + '.glb'))
        reports.append({**result, 'name':name, 'archive':str(archive), 'sourceSha256':digest,
                        'originalTriangles':original, 'sourceMaps':maps, **orientation})
        (WORK / 'report.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
        shared.render_preview(obj, WORK / (name + '.jpg'))
        print('WEAPON_READY', name, original, result['triangles'], flush=True)
    print(json.dumps(reports, indent=2), flush=True)

if __name__ == '__main__':
    main()
