"""Blender authoring patches; never write to the accepted ship or kit sources."""
import bpy
import bmesh
import hashlib
import json
import math
import pathlib
import sys

import numpy as np
from mathutils import Vector

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
LIBRARY = ROOT.parent / 'bible/models/ambient/boats'
OUTPUT = LIBRARY / 'sailing-variants-v2'
PACKS = ROOT.parent / 'artifacts/eastbrook-megakit-study'
SOURCE = LIBRARY / 'sailing-modular-v1/output/sailing-modular.blend'
BASE_GLB = LIBRARY / 'sailing-modular-v1/output/sailing-modular.glb'
CONFIG = json.loads((HERE / 'sailship_variants.json').read_text())
OUTPUT.mkdir(exist_ok=True)
(OUTPUT / 'output').mkdir(exist_ok=True)
(OUTPUT / 'renders').mkdir(exist_ok=True)


def sha(file):
    return hashlib.file_digest(file.open('rb'), 'sha256').hexdigest()


source_hashes = {str(p): sha(p) for p in [SOURCE, BASE_GLB]}
donor_hashes = {}
reports = []
PX = [-7, -6.65, -6, -5, -3, -1, 1, 3, 5, 5.6, 6.3, 7.5, 9.5, 11.5]
PW = [.05, .48, 1.14, 1.82, 2.43, 2.62, 2.68, 2.64, 2.50, 2.45, 2.40, 2.25, 1.99, 1.65]


def width(x):
    return float(np.interp(x, PX, PW))


def active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def vertices(obj):
    return np.array([list(obj.matrix_world @ v.co) for v in obj.data.vertices])


def donor(name, props=False):
    directory = PACKS / ('props-pro-source/Exports/glTF' if props else 'village-pro-source/glTF')
    file = directory / (name + '.gltf')
    doc = json.loads(file.read_text())
    files = [file] + [file.parent / b['uri'] for b in doc.get('buffers', [])]
    files += [file.parent / i['uri'] for i in doc.get('images', []) if 'uri' in i]
    for p in files:
        donor_hashes[str(p)] = sha(p)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(file))
    result = []
    for obj in sorted(set(bpy.data.objects) - before, key=lambda obj: obj.name):
        if obj.type == 'MESH':
            world = obj.matrix_world.copy()
            obj.parent = None
            obj.matrix_world = world
            active(obj)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            result.append(obj)
    for obj in sorted(set(bpy.data.objects) - before, key=lambda obj: obj.name):
        if obj not in result:
            bpy.data.objects.remove(obj, do_unlink=True)
    return result


def finish(obj, role, source):
    obj['role'] = role
    obj['provenance'] = source
    if obj.data.uv_layers.active:
        obj.data.uv_layers.active.name = 'UVMap'
    for uv in list(obj.data.uv_layers)[1:]:
        obj.data.uv_layers.remove(uv)
    obj.data.update()


def replace_panel(old):
    name = old.name
    pts = vertices(old)
    target_lo, target_hi = pts.min(0), pts.max(0)
    side = -1 if '_-1' in name else 1
    for obj in donor('Balcony_Simple_Straight'):
        p = vertices(obj)
        lo, hi = p.min(0), p.max(0)
        t = (p - lo) / np.maximum(hi - lo, 1e-8)
        out = np.empty_like(p)
        if name.startswith('Native_Rail_'):
            out[:, 0] = target_lo[0] + t[:, 0] * (target_hi[0] - target_lo[0])
            out[:, 1] = [side * (width(x) + .015 + (v - .5) * .134) for x, v in zip(out[:, 0], t[:, 1])]
            out[:, 2] = 3.64 + t[:, 2] * .68
        elif name.startswith('Native_Bow_Closing_Rail'):
            a, b = Vector((-6.6, side * (width(-6.6) + .015), 3.64)), Vector((-7.04, 0, 3.64))
            direction = (b - a).normalized()
            normal = Vector((-direction.y, direction.x, 0))
            out = np.array([a.lerp(b, float(u)) + normal * float((v - .5) * .134) + Vector((0, 0, w * .68)) for u, v, w in t])
        else:
            # Transverse stern/front rails keep their exact previous envelope.
            out[:, 0] = target_lo[0] + t[:, 1] * (target_hi[0] - target_lo[0])
            out[:, 1] = target_lo[1] + t[:, 0] * (target_hi[1] - target_lo[1])
            out[:, 2] = target_lo[2] + t[:, 2] * (target_hi[2] - target_lo[2])
        for v, co in zip(obj.data.vertices, out):
            v.co = co
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        finish(obj, 'railings', 'Balcony_Simple_Straight')
        obj.name = name + '_Simple'
    bpy.data.objects.remove(old, do_unlink=True)


def route_clearance(lo, hi, routes):
    gap = float('inf')
    for route in routes:
        for a, b in zip(route, route[1:]):
            for t in np.linspace(0, 1, 100):
                p = np.array(a) * (1 - t) + np.array(b) * t
                delta = np.maximum(np.maximum(lo[:2] - p, p - hi[:2]), 0)
                gap = min(gap, float(np.linalg.norm(delta)))
    return gap


for variant in CONFIG['variants']:
    assert variant['foreRail'] == variant['aftRail'], 'Use one railing style per vessel'
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    base_objects = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('role') and o.get('role') != 'collision']
    # Reference, collision and scale-figure objects do not belong in the model.
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            obj.hide_render = obj not in base_objects
    for obj in list(base_objects):
        if obj.get('role') == 'cargo' and obj.name != 'Native_Fore_Rope_Coil':
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.get('role') == 'railings' and obj.get('provenance') == 'Balcony_Cross_Straight':
            fore = obj.name.startswith(('Native_Rail_Fore_', 'Native_Bow_Closing_Rail'))
            if variant['foreRail' if fore else 'aftRail'] == 'simple':
                replace_panel(obj)
    routes = [
        [[-2.05, -1.25], [-3.65, -.65], [-4.4, -.45]],
        [[7.32, 1.4], [8.85, 1.4], [8.98, 0]],
        [[7.32, -1.4], [8.85, -1.4], [8.98, 0]],
        [[8.98, 0], [10.8, 0]],
    ]
    cargo = []
    for name, part, x, y, height, max_footprint, angle in variant['cargo']:
        parts = donor(part, True)
        p = np.concatenate([vertices(o) for o in parts])
        lo, hi = p.min(0), p.max(0)
        scale = min(height / (hi[2] - lo[2]), max_footprint / max(hi[0] - lo[0], hi[1] - lo[1]))
        pivot = (lo + hi) * .5
        pivot[2] = lo[2]
        for obj in parts:
            out = (vertices(obj) - pivot) * scale
            xx, yy = out[:, 0].copy(), out[:, 1].copy()
            out[:, 0] = xx * math.cos(angle) - yy * math.sin(angle) + x
            out[:, 1] = xx * math.sin(angle) + yy * math.cos(angle) + y
            out[:, 2] += 3.43
            for v, co in zip(obj.data.vertices, out):
                v.co = co
            obj.name = 'Variant_' + name
            finish(obj, 'cargo', part)
        p = np.concatenate([vertices(o) for o in parts])
        lo, hi = p.min(0), p.max(0)
        clearance = route_clearance(lo, hi, routes)
        assert clearance > .30, (variant['id'], name, 'blocks route', clearance)
        assert max(abs(lo[1]), abs(hi[1])) < min(width(lo[0]), width(hi[0])) - .18
        assert abs(lo[2] - 3.43) < 1e-4
        cargo.append({'name': name, 'source': part, 'min': lo.tolist(), 'max': hi.tolist(), 'routeClearanceM': clearance})
    for a, first in enumerate(cargo):
        for second in cargo[a + 1:]:
            assert any(first['max'][i] + .04 < second['min'][i] or second['max'][i] + .04 < first['min'][i] for i in [0, 1]), ('Cargo overlap', first['name'], second['name'])
    parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('role') in ['railings', 'cargo']]
    panels = {'fore': set(), 'aft': set()}
    for obj in parts:
        if obj.get('provenance', '').startswith('Balcony_'):
            zone = 'fore' if obj.name.startswith(('Native_Rail_Fore_', 'Native_Bow_Closing_Rail')) else 'aft'
            panels[zone].add(obj['provenance'])
    expected = {'Balcony_' + ('Simple' if variant['foreRail'] == 'simple' else 'Cross') + '_Straight'}
    assert panels['fore'] == panels['aft'] == expected, panels
    report = {'panelSourcesByZone': {k: sorted(v) for k, v in panels.items()}, 'id': variant['id'], 'sailTint': variant['sailTint'], 'foreRail': variant['foreRail'], 'aftRail': variant['aftRail'], 'cargo': cargo, 'retainedPosts': sum('Post_' in o.name for o in parts), 'roles': {}}
    clones = []
    for role in ['railings', 'cargo']:
        copies = []
        for source in [o for o in parts if o.get('role') == role]:
            obj = source.copy()
            obj.data = source.data.copy()
            bpy.context.collection.objects.link(obj)
            copies.append(obj)
        active(copies[0])
        for obj in copies:
            obj.select_set(True)
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = 'Modular_' + role
        joined['role'] = role
        joined.data.calc_loop_triangles()
        report['roles'][role] = {'triangles': len(joined.data.loop_triangles), 'objects': len(copies)}
        clones.append(joined)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in clones:
        obj.select_set(True)
    file = OUTPUT / 'output' / (variant['id'] + '.patch.glb')
    bpy.ops.export_scene.gltf(filepath=str(file), export_format='GLB', use_selection=True, export_yup=True, export_extras=True, export_cameras=False, export_lights=False)
    report['patchSha256'] = sha(file)
    for obj in clones:
        bpy.data.objects.remove(obj, do_unlink=True)
    if '--no-render' in sys.argv:
        reports.append(report)
        print('VARIANT_PATCH_DONE', variant['id'], flush=True)
        continue
    # Offline evidence uses the same factor as the glTF material importer.
    for material in bpy.data.materials:
        if material.name == 'Native_Light_Linen':
            shader = material.node_tree.nodes.get('Principled BSDF')
            original = shader.inputs['Base Color'].links[0].from_socket
            tint = material.node_tree.nodes.new('ShaderNodeMixRGB')
            tint.blend_type = 'MULTIPLY'
            tint.inputs[0].default_value = 1
            tint.inputs[2].default_value = variant['sailTint']
            material.node_tree.links.new(original, tint.inputs[1])
            material.node_tree.links.new(tint.outputs[0], shader.inputs['Base Color'])
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 850
    scene.render.resolution_percentage = 100
    camera = scene.camera
    camera.data.type = 'ORTHO'
    for name, loc, target, scale in [('exterior', (27, -37, 24), (0, 0, 6.7), 30), ('deck', (3, -17, 26), (2, 0, 3.4), 22)]:
        for obj in bpy.data.objects:
            if obj.get('role') == 'sails':
                obj.hide_render = name == 'deck'
        camera.location = loc
        camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.ortho_scale = scale
        scene.render.filepath = str(OUTPUT / 'renders' / (variant['id'] + '-' + name + '.png'))
        bpy.ops.render.render(write_still=True)
    reports.append(report)
    print('VARIANT_PATCH_DONE', variant['id'], flush=True)

assert all(sha(pathlib.Path(p)) == h for p, h in source_hashes.items())
assert all(sha(pathlib.Path(p)) == h for p, h in donor_hashes.items())
(OUTPUT / 'build-report.json').write_text(json.dumps({'sourceHashes': source_hashes, 'donorHashes': donor_hashes, 'variants': reports, 'sourcesUnchanged': True}, indent=2))
print('ALL_VARIANT_PATCHES_VERIFIED', flush=True)
