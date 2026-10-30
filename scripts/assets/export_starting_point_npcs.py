"""Export the Mixamo-rigged Starting Point NPCs with their original Meshy PBR maps.

Run from the repository root:
  blender -b --factory-startup --python scripts/assets/export_starting_point_npcs.py

The Mixamo downloads are skeleton and animation intermediates.  Each shipped material is
rebuilt from its unchanged Meshy source archive, never from Mixamo's baked diffuse map.
"""

from __future__ import annotations

import json
import sys
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
RIGGED_ROOT = Path(r"D:\THE_GAME\bible\models\npc\starting point\mixamo_rigged")
ARCHIVE_ROOT = Path(r"D:\THE_GAME\bible\models\npc\starting point")
OUTPUT_ROOT = ROOT / "tmp" / "asset_src" / "npcs" / "starting_point"
TEMP_ROOT = OUTPUT_ROOT / "blender_tmp"
TEMP_ROOT.mkdir(parents=True, exist_ok=True)
tempfile.tempdir = str(TEMP_ROOT)

sys.path.insert(0, str(ROOT / "scripts" / "anim"))
from blender_bake_meshy_titan import (  # noqa: E402
    HIPS_BONE,
    MIXAMO_UNIT_SCALE,
    export_glb,
    import_base,
    location_anchor,
    remove_horizontal_root_motion,
    render_preview,
    scale_pose_locations,
)


@dataclass(frozen=True)
class NpcBuild:
    source_fbx: str
    npc_id: str
    archive: str
    clip: str


BUILDS = (
    NpcBuild("Bursar-Wick.fbx", "starting_point_bursar_wick", "Meshy_AI_The_Golden_Keymaster_1009115142_texture_fbx.zip", "StartingPoint_BursarWick_Idle"),
    NpcBuild("Drillmaster-Rook.fbx", "starting_point_drillmaster_rook", "Meshy_AI_Stalwart_Defender_1009115357_texture_fbx.zip", "StartingPoint_DrillmasterRook_Idle"),
    NpcBuild("Ferryman-Odo.fbx", "starting_point_ferryman_odo", "Meshy_AI_Weathered_Harbor_Craf_1009115217_texture_fbx.zip", "StartingPoint_FerrymanOdo_Idle"),
    NpcBuild("Instructor-Maren.fbx", "starting_point_instructor_maren", "Meshy_AI_Azure_Vanguard_1009115259_texture_fbx.zip", "StartingPoint_InstructorMaren_Idle"),
    NpcBuild("Overseer-Pell.fbx", "starting_point_overseer_pell", "Meshy_AI_The_Iron_Wharf_Forema_1009115414_texture_fbx.zip", "StartingPoint_OverseerPell_Idle"),
    NpcBuild("Quartermaster-Finch.fbx", "starting_point_quartermaster_finch", "Meshy_AI_The_Cheerful_Tinkerer_1009115317_texture_fbx.zip", "StartingPoint_QuartermasterFinch_Idle"),
    NpcBuild("Tidewarden-Nel.fbx", "starting_point_tidewarden_nel", "Meshy_AI_Hooded_Wanderer_1009115244_texture_fbx.zip", "StartingPoint_TidewardenNel_Idle"),
    NpcBuild("Warden-Tam.fbx", "starting_point_warden_tam", "Meshy_AI_Wanderer_s_Resolve_1009120330_texture_fbx.zip", "StartingPoint_WardenTam_Idle"),
)


def extract_maps(archive: Path, output: Path) -> dict[str, Path]:
    markers = {
        "base": lambda stem: not any(token in stem for token in ("normal", "metallic", "roughness")),
        "normal": lambda stem: "normal" in stem,
        "metallic": lambda stem: "metallic" in stem,
        "roughness": lambda stem: "roughness" in stem,
    }
    found: dict[str, Path] = {}
    with zipfile.ZipFile(archive) as package:
        images = [entry for entry in package.infolist() if entry.filename.lower().endswith((".png", ".jpg", ".jpeg"))]
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
    material = bpy.data.materials.new(f"{npc_id}_source_pbr")
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


def retain_embedded_mixamo_clip(rig: bpy.types.Object, clip: str) -> tuple[float, float]:
    if rig.animation_data is None or rig.animation_data.action is None:
        raise RuntimeError("Mixamo FBX did not include an animation action")
    action = rig.animation_data.action
    scale_pose_locations(action, MIXAMO_UNIT_SCALE)
    try:
        remove_horizontal_root_motion(action, location_anchor(action, 0), location_anchor(action, 2))
    except RuntimeError:
        # Some Mixamo loops have no hips translation channels. Their pose is already in place.
        pass
    action.name = clip
    track = rig.animation_data.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, 0, action)
    strip.name = clip
    return tuple(float(value) for value in action.frame_range)


def select_action(rig: bpy.types.Object, action_name: str) -> None:
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    rig.animation_data.action = bpy.data.actions[action_name]
    if rig.animation_data.action.slots:
        rig.animation_data.action_slot = rig.animation_data.action.slots[0]
    bpy.context.scene.frame_set(0)


def build_one(config: NpcBuild) -> dict[str, object]:
    source = RIGGED_ROOT / config.source_fbx
    archive = ARCHIVE_ROOT / config.archive
    if not source.is_file() or not archive.is_file():
        raise RuntimeError(f"Missing source FBX or archive for {config.npc_id}")
    output_dir = OUTPUT_ROOT / config.npc_id
    output_dir.mkdir(parents=True, exist_ok=True)
    rig, mesh = import_base(source)
    if HIPS_BONE not in rig.data.bones:
        raise RuntimeError(f"{source.name}: missing {HIPS_BONE}")
    rig.name = f"{config.npc_id}_Rig"
    mesh.name = f"{config.npc_id}_Body"
    mesh.data.name = mesh.name
    frames = retain_embedded_mixamo_clip(rig, config.clip)
    with tempfile.TemporaryDirectory(prefix=f"{config.npc_id}_maps_") as temporary:
        mesh.data.materials.clear()
        mesh.data.materials.append(build_material(config.npc_id, extract_maps(archive, Path(temporary))))
        rig["source"] = f"User-provided Meshy source archive {archive.name}; Mixamo rig and embedded loop"
        output_glb = output_dir / f"{config.npc_id}.glb"
        export_glb(output_glb, rig, [mesh])
        select_action(rig, config.clip)
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
        "clip": {"name": config.clip, "frames": frames},
        "sourceMaps": ["base", "normal", "metallic", "roughness"],
    }
    (output_dir / f"{config.npc_id}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    selected = set(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else ())
    unknown = selected - {config.npc_id for config in BUILDS}
    if unknown:
        raise RuntimeError(f"Unknown NPC ids: {', '.join(sorted(unknown))}")
    reports = [build_one(config) for config in BUILDS if not selected or config.npc_id in selected]
    print(json.dumps(reports, indent=2), flush=True)


if __name__ == "__main__":
    main()
