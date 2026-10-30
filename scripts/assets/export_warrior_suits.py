"""Import the three whole-body warrior suits and their Mixamo sword/shield packs.

blender -b --python scripts/assets/export_warrior_suits.py -- --source D:/MODELS/warior/mixamo_rigged --textures D:/MODELS/warior/mixamo_ready
Then build_assets.mjs --spec scripts/assets/specs/warrior_suits.json and KTX2 compression.
"""
import argparse
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/anim'))
from blender_bake_meshy_titan import import_base, clear_animation, add_clip, export_glb, render_preview


def clip_name(path):
    return 'Warrior_' + path.stem.replace('sword and shield ', '').replace('(', '').replace(')', '').replace(' ', '_')


def material(folder, name):
    mat = bpy.data.materials.new(name + '_PBR')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get('Principled BSDF')
    for kind, socket in [('diffuse', 'Base Color'), ('roughness', 'Roughness'), ('metallic', 'Metallic'), ('normal', None)]:
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = bpy.data.images.load(str(folder / (kind + '.png')), check_existing=True)
        if kind != 'diffuse': texture.image.colorspace_settings.name = 'Non-Color'
        if kind == 'normal':
            normal = nodes.new('ShaderNodeNormalMap')
            links.new(texture.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], shader.inputs['Normal'])
        else:
            links.new(texture.outputs['Color'], shader.inputs[socket])
    return mat


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--textures', type=Path, required=True)
    parser.add_argument('--only', choices=['recruit', 'militia', 'knight'])
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out = ROOT / 'tmp/asset_src/warrior_suits'
    out.mkdir(parents=True, exist_ok=True)
    for name in ([args.only] if args.only else ['recruit', 'militia', 'knight']):
        folder = args.source / (name + '_sword_and_shield')
        rig, mesh = import_base(folder / (name + '_mixamo.fbx'))
        rig.name = 'Warrior_Rig'
        mesh.name = name.title() + '_Body'
        mesh.data.name = mesh.name
        anchors = clear_animation(rig)
        bpy.context.scene.render.fps = 30
        mesh.data.materials.clear()
        mesh.data.materials.append(material(args.textures / name, name))
        clips = []
        for path in sorted(folder.glob('*.fbx')):
            if path.name == name + '_mixamo.fbx': continue
            label = clip_name(path)
            frames = add_clip(rig, path, label, *anchors)
            clips.append({'name': label, 'frames': frames})
            print('CLIP', name, label, flush=True)
        rig['source'] = 'User-provided Meshy model, Mixamo auto-rig and Sword and Shield pack'
        export_glb(out / ('warrior_' + name + '.glb'), rig, [mesh])
        for track in rig.animation_data.nla_tracks: track.mute = True
        idle = bpy.data.actions['Warrior_idle_2']
        rig.animation_data.action = idle
        if idle.slots: rig.animation_data.action_slot = idle.slots[0]
        bpy.context.scene.frame_set(0)
        render_preview(out / (name + '_idle.png'), [mesh])
        # The shared setup renders rest pose first. Render the evaluated idle
        # after it restores POSE so the inspection image exercises the bake.
        bpy.context.view_layer.update()
        bpy.ops.render.render(write_still=True)
        rig.animation_data.action = None
        rig.data.pose_position = 'REST'
        bpy.ops.wm.save_as_mainfile(filepath=str(out / (name + '.blend')))
        (out / (name + '.json')).write_text(json.dumps({'suit': name, 'bones': len(rig.data.bones), 'triangles': len(mesh.data.polygons), 'clips': clips}, indent=2))
        print('EXPORTED', name, len(clips), flush=True)


if __name__ == '__main__':
    main()
