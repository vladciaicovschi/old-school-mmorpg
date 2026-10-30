"""Import the supplied static wisp, with restrained rigid floating motion.

The unrigged source alone is reduced before animation. Original FBX and maps
stay in bible; no skinned geometry is simplified. Shipping uses community_wisp.json.
"""
from pathlib import Path
import hashlib
import json
import math
import zipfile
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT.parent / 'bible/models/mobs/comunity/wisp.zip'
EXTRACT = ROOT / 'tmp/spirit-import/sources'
OUT = ROOT / 'tmp/asset_src/spirits/community_wisp.glb'


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    EXTRACT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(SOURCE) as archive:
        for item in archive.infolist():
            destination = (EXTRACT / item.filename).resolve()
            if not destination.is_relative_to(EXTRACT.resolve()):
                raise ValueError('Archive path escapes the source workspace')
            if destination.suffix.lower() in ('.fbx', '.png', '.jpg', '.jpeg'):
                archive.extract(item, EXTRACT)
    fbx = next(EXTRACT.rglob('*.fbx'))
    bpy.ops.import_scene.fbx(filepath=str(fbx))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if any(o.type == 'ARMATURE' for o in bpy.context.scene.objects):
        raise RuntimeError('Static-only reduction must never touch a rig')
    original = sum(sum(p.loop_total-2 for p in o.data.polygons) for o in meshes)
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        triangles = sum(p.loop_total-2 for p in obj.data.polygons)
        if triangles > 24000:
            mod = obj.modifiers.new('StaticSourceReduction', 'DECIMATE')
            mod.ratio = 24000 / triangles
            bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    material = bpy.data.materials.new('CommunityWispAuthored'); material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Roughness'].default_value = .85
    for suffix, socket in [('', 'Base Color'), ('_normal', 'Normal')]:
        path = fbx.with_name(fbx.stem + suffix + '.png')
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = bpy.data.images.load(str(path), check_existing=True)
        if suffix:
            texture.image.colorspace_settings.name = 'Non-Color'
            normal = nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value = .45
            links.new(texture.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], bsdf.inputs[socket])
        else:
            links.new(texture.outputs['Color'], bsdf.inputs[socket])
    points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    pivot = bpy.data.objects.new('WispFloat', None); bpy.context.collection.objects.link(pivot)
    for obj in meshes:
        obj.data.materials.clear(); obj.data.materials.append(material)
        world = obj.matrix_world.copy(); obj.parent = pivot; obj.matrix_world = world
        obj['shadowCaster'] = False
    pivot['communityWisp'] = {'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                              'originalTriangles': original, 'staticReductionTarget': 24000}
    height = hi.z-lo.z
    bpy.context.scene.render.fps = 30
    pivot.animation_data_create()
    for name, duration in [('Wisp_Idle', 3.2), ('Wisp_Move', 1.6), ('Wisp_Attack', .8),
                           ('Wisp_Hit', .4), ('Wisp_Death', 1.2)]:
        action = bpy.data.actions.new(name); pivot.animation_data.action = action
        end = round(duration*30)
        for frame in range(end+1):
            p = frame/end; cycle = math.sin(math.tau*p)
            pivot.location = (0, 0, height*.018*cycle)
            pivot.rotation_euler = (0, .022*cycle, .025*math.sin(math.tau*p))
            pivot.scale = (1, 1, 1)
            if name == 'Wisp_Move':
                pivot.rotation_euler.x = .10+.025*cycle
            elif name == 'Wisp_Attack':
                pulse = math.sin(math.pi*p)**2
                pivot.location.y = -height*.14*pulse
                pivot.scale = (1+.10*pulse, 1+.10*pulse, 1-.06*pulse)
            elif name == 'Wisp_Hit':
                pivot.rotation_euler.x = -.18*math.sin(math.pi*p)**2
            elif name == 'Wisp_Death':
                ease = p*p*(3-2*p)
                pivot.scale = (1-.97*ease,)*3
                pivot.location.z = -height*.20*ease
            for key in ('location', 'rotation_euler', 'scale'):
                pivot.keyframe_insert(data_path=key, frame=frame)
        track = pivot.animation_data.nla_tracks.new(); track.name = name
        track.strips.new(name, 0, action)
        pivot.animation_data.action = None
    pivot.location = (0, 0, 0); pivot.rotation_euler = (0, 0, 0); pivot.scale = (1,)*3
    for obj in meshes: obj.select_set(True)
    pivot.select_set(True); bpy.context.view_layer.objects.active = pivot
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_nla_strips=True,
        export_anim_slide_to_zero=True, export_force_sampling=True, export_frame_range=False,
        export_yup=True, export_extras=True, export_cameras=False, export_lights=False)
    report = {'originalTriangles': original,
              'triangles': sum(sum(p.loop_total-2 for p in o.data.polygons) for o in meshes),
              'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              'bounds': [list(lo), list(hi)], 'output': str(OUT)}
    (ROOT/'tmp/spirit-import/wisp.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
