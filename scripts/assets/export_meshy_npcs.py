"""Build named Meshy NPCs from their Mixamo rigs and authored idle clips.

Blender 5.2 example:
  blender -b --python scripts/assets/export_meshy_npcs.py -- \
    --source D:/THE_GAME/bible/models/npc/mixamo_rigged \
    --archive-root D:/THE_GAME/bible/models/npc

The Mixamo FBXs supply skinning and animation only. Shipping materials are
rebuilt from the original Meshy archives so the auto-rig round trip never
becomes the texture source of truth.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import zipfile
from dataclasses import dataclass
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


@dataclass(frozen=True)
class NpcBuild:
    source_name: str
    npc_id: str
    idle_file: str
    idle_clip: str
    source_folder: str | None = None


BUILDS = (
    NpcBuild(
        source_name="Brother-Aldric",
        npc_id="brother_aldric",
        idle_file="Standing Idle.fbx",
        idle_clip="Aldric_Idle",
    ),
    NpcBuild(
        source_name="Foreman-Odell",
        npc_id="foreman_odell",
        idle_file="Warrior Idle.fbx",
        idle_clip="Foreman_Idle",
        source_folder="Foreman-Odel",
    ),
    NpcBuild(
        source_name="Fisherman-Brandt",
        npc_id="fisherman_brandt",
        idle_file="Dwarf Idle (2).fbx",
        idle_clip="Fisherman_Idle",
    ),
    NpcBuild(
        source_name="Trader-Wilkes",
        npc_id="trader_wilkes",
        idle_file="Dwarf Idle (3).fbx",
        idle_clip="Trader_Idle",
    ),
    NpcBuild(
        source_name="Smith-Haldren",
        npc_id="smith_haldren",
        idle_file="Dwarf Idle.fbx",
        idle_clip="Smith_Idle",
    ),
    NpcBuild(
        source_name="Marshal-Redbrook",
        npc_id="marshal_redbrook",
        idle_file="Neutral Idle.fbx",
        idle_clip="Marshal_Idle",
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--archive-root", type=Path, required=True)
    parser.add_argument("--only", action="append", help="Build only this npc_id (repeatable)")
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
        images = [
            entry
            for entry in package.infolist()
            if entry.filename.lower().endswith((".png", ".jpg", ".jpeg"))
        ]
        for kind, matches in markers.items():
            candidates = [entry for entry in images if matches(Path(entry.filename).stem.lower())]
            if len(candidates) != 1:
                raise RuntimeError(f"{archive.name}: expected one {kind} map, found {len(candidates)}")
            suffix = Path(candidates[0].filename).suffix.lower()
            target = output / f"{kind}{suffix}"
            target.write_bytes(package.read(candidates[0]))
            found[kind] = target
    return found


def build_material(npc_id: str, maps: dict[str, Path]) -> bpy.types.Material:
    material = bpy.data.materials.new(f"meshy_{npc_id}_pbr")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    for kind, socket in (
        ("base", "Base Color"),
        ("roughness", "Roughness"),
        ("metallic", "Metallic"),
    ):
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


def select_action(rig: bpy.types.Object, action_name: str) -> None:
    if rig.animation_data is None:
        raise RuntimeError("Rig has no animation data after clip bake")
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    action = bpy.data.actions[action_name]
    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(0)


def build_one(config: NpcBuild, source_root: Path, archive_root: Path) -> dict[str, object]:
    source_dir = source_root / (config.source_folder or config.source_name)
    base_fbx = source_dir / f"{config.source_name}_mixamo.fbx"
    idle_fbx = source_dir / config.idle_file
    archive = archive_root / f"{config.source_name}.zip"
    for path in (base_fbx, idle_fbx, archive):
        if not path.is_file():
            raise RuntimeError(f"Missing source: {path}")

    output_dir = ROOT / "tmp/asset_src/npcs" / config.npc_id
    output_dir.mkdir(parents=True, exist_ok=True)
    rig, mesh = import_base(base_fbx)
    rig.name = f"{config.npc_id}_Rig"
    mesh.name = f"{config.npc_id}_Body"
    mesh.data.name = mesh.name
    anchor_x, anchor_z = clear_animation(rig)
    bpy.context.scene.render.fps = 30
    frames = add_clip(rig, idle_fbx, config.idle_clip, anchor_x, anchor_z)

    with tempfile.TemporaryDirectory(prefix=f"woc_{config.npc_id}_maps_") as temporary:
        maps = extract_maps(archive, Path(temporary))
        mesh.data.materials.clear()
        mesh.data.materials.append(build_material(config.npc_id, maps))
        rig["source"] = (
            f"User-provided Meshy {config.source_name}; Mixamo auto-rig and authored idle"
        )
        output_glb = output_dir / f"{config.npc_id}.glb"
        export_glb(output_glb, rig, [mesh])

        select_action(rig, config.idle_clip)
        preview = output_dir / f"{config.npc_id}_idle.png"
        render_preview(preview, [mesh])
        bpy.context.view_layer.update()
        bpy.ops.render.render(write_still=True)

    report = {
        "id": config.npc_id,
        "output": str(output_glb.relative_to(ROOT)),
        "preview": str(preview.relative_to(ROOT)),
        "bones": len(rig.data.bones),
        "vertices": len(mesh.data.vertices),
        "triangles": len(mesh.data.polygons),
        "materials": len(mesh.data.materials),
        "clip": {"name": config.idle_clip, "frames": frames},
        "sourceMaps": ["base", "normal", "metallic", "roughness"],
    }
    (output_dir / f"{config.npc_id}.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    return report


def main() -> None:
    args = parse_args()
    selected = [config for config in BUILDS if not args.only or config.npc_id in args.only]
    unknown = sorted(set(args.only or ()) - {config.npc_id for config in BUILDS})
    if unknown:
        raise RuntimeError(f"Unknown --only npc_id: {', '.join(unknown)}")
    reports = [
        build_one(config, args.source.resolve(), args.archive_root.resolve())
        for config in selected
    ]
    print(json.dumps(reports, indent=2), flush=True)


if __name__ == "__main__":
    main()
