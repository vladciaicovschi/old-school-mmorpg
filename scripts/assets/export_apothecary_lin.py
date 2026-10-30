"""Build Apothecary Lin from her Mixamo rig and two authored idle clips.

blender -b --python scripts/assets/export_apothecary_lin.py -- \
  --source D:/THE_GAME/bible/models/npc/mixamo_rigged \
  --archive D:/THE_GAME/bible/models/npc/Apothecary-Lin.zip
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import zipfile
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/anim"))
from blender_bake_meshy_titan import (  # noqa: E402
    add_clip,
    clear_animation,
    export_glb,
    import_base,
    render_preview,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])


def extract_maps(archive: Path, output: Path) -> dict[str, Path]:
    markers = {
        "base": lambda stem: not any(x in stem for x in ("normal", "metallic", "roughness")),
        "normal": lambda stem: "normal" in stem,
        "metallic": lambda stem: "metallic" in stem,
        "roughness": lambda stem: "roughness" in stem,
    }
    found: dict[str, Path] = {}
    with zipfile.ZipFile(archive) as package:
        images = [entry for entry in package.infolist() if entry.filename.lower().endswith(".png")]
        for kind, matches in markers.items():
            candidates = [entry for entry in images if matches(Path(entry.filename).stem.lower())]
            if len(candidates) != 1:
                raise RuntimeError(f"Expected one {kind} map, found {len(candidates)}")
            target = output / f"{kind}.png"
            target.write_bytes(package.read(candidates[0]))
            found[kind] = target
    return found


def build_material(maps: dict[str, Path]) -> bpy.types.Material:
    material = bpy.data.materials.new("Apothecary_Lin_PBR")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    for kind, socket in (("base", "Base Color"), ("roughness", "Roughness"), ("metallic", "Metallic")):
        texture = nodes.new("ShaderNodeTexImage")
        texture.name = kind.title()
        texture.image = bpy.data.images.load(str(maps[kind]), check_existing=False)
        if kind != "base":
            texture.image.colorspace_settings.name = "Non-Color"
        links.new(texture.outputs["Color"], shader.inputs[socket])

    texture = nodes.new("ShaderNodeTexImage")
    texture.name = "Normal"
    texture.image = bpy.data.images.load(str(maps["normal"]), check_existing=False)
    texture.image.colorspace_settings.name = "Non-Color"
    normal = nodes.new("ShaderNodeNormalMap")
    links.new(texture.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    return material


def main() -> None:
    args = parse_args()
    source = args.source.resolve()
    archive = args.archive.resolve()
    base_fbx = source / "Apothecary-Lin_mixamo.fbx"
    idle_source = source / "Dwarf Idle.fbx"
    for path in (base_fbx, archive, idle_source):
        if not path.is_file():
            raise RuntimeError(f"Missing source: {path}")

    output_dir = ROOT / "tmp/asset_src/npcs/apothecary_lin"
    output_dir.mkdir(parents=True, exist_ok=True)
    rig, mesh = import_base(base_fbx)
    rig.name = "Apothecary_Lin_Rig"
    mesh.name = "Apothecary_Lin_Body"
    mesh.data.name = mesh.name
    anchor_x, anchor_z = clear_animation(rig)
    bpy.context.scene.render.fps = 30

    frames = add_clip(rig, idle_source, "Apothecary_Idle_A", anchor_x, anchor_z)
    clips = [{"name": "Apothecary_Idle_A", "frames": frames}]

    with tempfile.TemporaryDirectory(prefix="woc_apothecary_maps_") as temporary:
        maps = extract_maps(archive, Path(temporary))
        mesh.data.materials.clear()
        mesh.data.materials.append(build_material(maps))
        rig["source"] = "User-provided Meshy Apothecary Lin, Mixamo auto-rig and one idle clip"
        output_glb = output_dir / "apothecary_lin.glb"
        export_glb(output_glb, rig, [mesh])

        for track in rig.animation_data.nla_tracks:
            track.mute = True
        idle = bpy.data.actions["Apothecary_Idle_A"]
        rig.animation_data.action = idle
        if idle.slots:
            rig.animation_data.action_slot = idle.slots[0]
        bpy.context.scene.frame_set(0)
        render_preview(output_dir / "apothecary_lin_idle.png", [mesh])
        bpy.context.view_layer.update()
        bpy.ops.render.render(write_still=True)

    report = {
        "output": str(output_glb.relative_to(ROOT)),
        "bones": len(rig.data.bones),
        "vertices": len(mesh.data.vertices),
        "triangles": len(mesh.data.polygons),
        "clips": clips,
    }
    (output_dir / "apothecary_lin.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
