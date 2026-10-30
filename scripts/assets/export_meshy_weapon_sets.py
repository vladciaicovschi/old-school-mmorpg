"""Split maintainer-supplied Meshy weapon FBXs into grip-ready GLBs.

The source archives are maintainer-local. Extract them under
tmp/asset_src/meshy_weapon_sets/source, then run with Blender 5.x:

  blender --background --factory-startup \
    --python scripts/assets/export_meshy_weapon_sets.py

The exporter keeps the shared PBR atlas, puts blade origins inside their grips,
puts shield origins on the rear plate, and emits raw GLBs for build_assets.mjs.
"""

from __future__ import annotations

import json
import math
import sys
from collections import deque
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "tmp" / "asset_src" / "meshy_weapon_sets" / "source"
OUTPUT_ROOT = ROOT / "tmp" / "asset_src" / "meshy_weapon_sets" / "raw"
PREVIEW_ROOT = ROOT / "tmp" / "asset_src" / "meshy_weapon_sets" / "previews"
TARGET_TRIANGLES = 20_000

PACKS = {
    "daggers": {
        "glob": "**/Meshy_AI_Blades_of_the_Arcane__0930072812_texture.fbx",
        "prefix": "arcane_dagger",
        "kind": "dagger",
    },
    "shields": {
        "glob": "**/Meshy_AI_Armory_of_Fallen_King_0930072745_texture.fbx",
        "prefix": "fallen_king_shield",
        "kind": "shield",
    },
    "swords": {
        "glob": "**/Meshy_AI_Blades_of_Ascendance_0930072836_texture.fbx",
        "prefix": "ascendance_sword",
        "kind": "sword",
    },
    "axes": {
        "glob": "**/Meshy_AI_Evolution_of_the_Batt_1009122031_texture.fbx",
        "prefix": "evolution_axe",
        "kind": "axe",
    },
    "longer_stafs": {
        "glob": "**/Meshy_AI_Arcane_Scepters_1011070912_texture.fbx",
        "prefix": "arcane_staff",
        "kind": "staff",
    },
    "longbows": {
        "glob": "**/Meshy_AI_Evolution_of_the_Arca_1011072549_texture.fbx",
        "prefix": "arcane_longbow",
        "kind": "bow",
    },
    "claymores": {
        "glob": "**/Meshy_AI_Five_Legendary_Swords_1013112034_texture.fbx",
        "prefix": "claymore_sword",
        "kind": "sword",
        "merge_decorations": True,
    },
    "warhammers_1h": {
        "glob": "**/Meshy_AI_Warhammers_of_the_Lio_1013112111_texture.fbx",
        "prefix": "lion_warhammer_1h",
        "kind": "hammer",
    },
    "warhammers_2h": {
        "glob": "**/Meshy_AI_Five_Dwarven_Warhamme_1013112049_texture.fbx",
        "prefix": "dwarven_warhammer_2h",
        "kind": "hammer",
    },
    "crossbow": {
        "glob": "**/Meshy_AI__1013125624_texture.fbx",
        "prefix": "test_crossbow",
        "kind": "crossbow",
        "count": 1,
    },
}


def connected_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    adjacency = [set() for _ in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacency[a].add(b)
        adjacency[b].add(a)
    unseen = set(range(len(mesh.vertices)))
    components: list[list[int]] = []
    while unseen:
        seed = unseen.pop()
        pending = deque([seed])
        component = [seed]
        while pending:
            current = pending.popleft()
            neighbours = adjacency[current] & unseen
            unseen.difference_update(neighbours)
            pending.extend(neighbours)
            component.extend(neighbours)
        components.append(component)
    return components


def component_bounds(source: bpy.types.Object, indices: list[int]) -> tuple[Vector, Vector]:
    coords = [source.data.vertices[index].co for index in indices]
    return (
        Vector(tuple(min(co[axis] for co in coords) for axis in range(3))),
        Vector(tuple(max(co[axis] for co in coords) for axis in range(3))),
    )


def object_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    coords = [vertex.co for vertex in obj.data.vertices]
    return (
        Vector(tuple(min(co[axis] for co in coords) for axis in range(3))),
        Vector(tuple(max(co[axis] for co in coords) for axis in range(3))),
    )


def isolate_component(source: bpy.types.Object, indices: list[int], name: str) -> bpy.types.Object:
    clone = source.copy()
    clone.data = source.data.copy()
    clone.name = name
    clone.data.name = f"{name}_Mesh"
    bpy.context.collection.objects.link(clone)
    keep = set(indices)
    editable = bmesh.new()
    editable.from_mesh(clone.data)
    editable.verts.ensure_lookup_table()
    bmesh.ops.delete(editable, geom=[v for v in editable.verts if v.index not in keep], context="VERTS")
    editable.to_mesh(clone.data)
    editable.free()
    clone.data.validate(verbose=False, clean_customdata=False)
    clone.data.update()
    return clone


def build_material(source: Path, name: str) -> bpy.types.Material:
    textures = {
        "base": source.with_suffix(".png"),
        "normal": source.with_name(f"{source.stem}_normal.png"),
        "roughness": source.with_name(f"{source.stem}_roughness.png"),
        "metallic": source.with_name(f"{source.stem}_metallic.png"),
    }
    missing = [str(path) for path in textures.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"Missing source textures: {missing}")
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    base = nodes.new("ShaderNodeTexImage")
    base.image = bpy.data.images.load(str(textures["base"]), check_existing=True)
    links.new(base.outputs["Color"], shader.inputs["Base Color"])
    normal_image = nodes.new("ShaderNodeTexImage")
    normal_image.image = bpy.data.images.load(str(textures["normal"]), check_existing=True)
    normal_image.image.colorspace_settings.name = "Non-Color"
    normal = nodes.new("ShaderNodeNormalMap")
    links.new(normal_image.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    for channel in ("roughness", "metallic"):
        image = nodes.new("ShaderNodeTexImage")
        image.image = bpy.data.images.load(str(textures[channel]), check_existing=True)
        image.image.colorspace_settings.name = "Non-Color"
        links.new(image.outputs["Color"], shader.inputs[channel.title()])
    return material


def place_origin_at_grip(obj: bpy.types.Object, kind: str) -> None:
    minimum, maximum = object_bounds(obj)
    size = maximum - minimum
    center_x = (minimum.x + maximum.x) * 0.5
    center_y = (minimum.y + maximum.y) * 0.5
    if kind in ("sword", "axe", "staff", "hammer"):
        origin = Vector((center_x, center_y, minimum.z + size.z * 0.12))
        transform = Matrix.Translation(-origin)
    elif kind == "crossbow":
        # Source lies in XY: the muzzle faces -X, stock +X, bow limbs Y.
        # Seat behind the trigger and rotate the barrel onto the canonical
        # +Z blade axis (+Y after glTF's Z-up to Y-up export).
        origin = Vector((center_x + size.x * 0.10, center_y,
                         (minimum.z + maximum.z) * 0.5 - size.z * 0.12))
        transform = Matrix.Rotation(math.pi * 0.5, 4, "Y") @ Matrix.Translation(-origin)
    elif kind == "bow":
        # A drawn bow grips at its vertical midpoint. Keep Meshy's facing
        # direction intact; the renderer's VAR_BOW hand transform handles it.
        origin = Vector((center_x, center_y, (minimum.z + maximum.z) * 0.5))
        transform = Matrix.Translation(-origin)
    elif kind == "dagger":
        origin = Vector((center_x, center_y, minimum.z + size.z * 0.83))
        transform = Matrix.Rotation(math.pi, 4, "Y") @ Matrix.Translation(-origin)
    elif kind == "shield":
        # The preview faces camera -Y, so +Y is the unadorned rear plate.
        origin = Vector((center_x, maximum.y - size.y * 0.08, (minimum.z + maximum.z) * 0.5))
        # Meshy authored the five plates at different source scales. Normalize
        # them to one wearable family before the renderer applies its hand fit.
        transform = Matrix.Scale(1.45 / size.z, 4) @ Matrix.Translation(-origin)
    else:
        raise ValueError(kind)
    obj.data.transform(transform)
    obj.matrix_world = Matrix.Identity(4)
    obj.data.update()
    obj["grip_origin"] = kind
    obj["source"] = "Meshy AI weapon sets, 2026-09-30"


def decimate(obj: bpy.types.Object) -> None:
    triangles = sum(max(1, len(poly.vertices) - 2) for poly in obj.data.polygons)
    if triangles <= TARGET_TRIANGLES:
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new("Game triangle budget", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = TARGET_TRIANGLES / triangles
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_preview(obj: bpy.types.Object, output: Path) -> None:
    for other in bpy.context.scene.objects:
        if other.type == "MESH":
            other.hide_render = other != obj
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 92
    if scene.world is None:
        scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.color = (0.025, 0.03, 0.04)
    minimum, maximum = object_bounds(obj)
    center = (minimum + maximum) * 0.5
    size = maximum - minimum
    camera_data = bpy.data.cameras.new("PreviewCamera")
    camera = bpy.data.objects.new("PreviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + Vector((-3, -4, 1) if obj.get("grip_origin") == "crossbow"
                                      else (0, -4, 0))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = (max(size) * 1.5 if obj.get("grip_origin") == "crossbow"
                               else max(size.x, size.z) * 1.2)
    look_at(camera, center)
    scene.camera = camera
    for label, energy, offset, area in (
        ("Key", 900, Vector((-2.5, -3, 3)), 4.0),
        ("Fill", 550, Vector((3, -2, 1)), 3.0),
    ):
        data = bpy.data.lights.new(f"Preview{label}", "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = area
        light = bpy.data.objects.new(f"Preview{label}", data)
        bpy.context.collection.objects.link(light)
        light.location = center + offset
        look_at(light, center)
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    transients = {o for o in bpy.context.scene.objects if o.name.startswith("Preview")}
    for transient in transients:
        bpy.data.objects.remove(transient, do_unlink=True)


def export_glb(obj: bpy.types.Object, output: Path) -> dict[str, object]:
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.hide_render = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    output.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"GLB export failed: {output}: {result}")
    minimum, maximum = object_bounds(obj)
    return {
        "file": output.name,
        "bytes": output.stat().st_size,
        "vertices": len(obj.data.vertices),
        "triangles": sum(max(1, len(poly.vertices) - 2) for poly in obj.data.polygons),
        "bounds": {"min": list(minimum), "max": list(maximum)},
    }


def export_pack(label: str, config: dict[str, object], only_tier: int | None = None) -> list[dict[str, object]]:
    matches = list((SOURCE_ROOT / label).glob(config["glob"]))
    if len(matches) != 1:
        raise RuntimeError(f"Expected one {label} FBX, found {len(matches)}: {matches}")
    source_path = matches[0]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(source_path), use_anim=False)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    # Some Meshy FBXs include a small scene cube. The authored weapon carrier
    # is always the mesh with the most polygons.
    source = max(meshes, key=lambda obj: len(obj.data.polygons), default=None)
    if source is None:
        raise RuntimeError(f"Expected a {label} mesh, found none")
    source.data.materials.clear()
    source.data.materials.append(build_material(source_path, f"{label}_pbr"))
    # A standalone weapon may have disconnected decorative parts. Preserve
    # them together; the five-piece sets are separated by authored islands.
    expected = config.get("count", 5)
    components = ([list(range(len(source.data.vertices)))] if expected == 1
                  else connected_components(source.data))
    if config.get("merge_decorations") and len(components) > expected:
        # This claymore source has two detached inlays inside blade four.
        # Preserve them with their containing weapon, never drop small islands.
        ordered = sorted(components, key=len, reverse=True)
        components = ordered[:expected]
        bounds = [component_bounds(source, component) for component in components]
        for decoration in ordered[expected:]:
            low, high = component_bounds(source, decoration)
            owners = [index for index, (a, b) in enumerate(bounds)
                      if a.x <= low.x and high.x <= b.x]
            if len(owners) != 1:
                raise RuntimeError(f"Ambiguous {label} decoration bounds: {low}, {high}")
            components[owners[0]].extend(decoration)
    if len(components) != expected:
        raise RuntimeError(f"Expected {expected} {label}, found {len(components)} components")
    components.sort(key=lambda indices: component_bounds(source, indices)[0].x)
    source.hide_set(True)
    source.hide_render = True
    report = []
    for tier, component in enumerate(components, start=1):
        if only_tier is not None and tier != only_tier:
            continue
        asset_name = f"{config['prefix']}_{tier}"
        obj = isolate_component(source, component, asset_name)
        place_origin_at_grip(obj, config["kind"])
        decimate(obj)
        preview = PREVIEW_ROOT / f"{asset_name}.jpg"
        render_preview(obj, preview)
        entry = export_glb(obj, OUTPUT_ROOT / f"{asset_name}.glb")
        entry.update({"pack": label, "tier": tier, "preview": preview.name})
        report.append(entry)
        obj.hide_set(True)
        obj.hide_render = True
    return report


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    report: list[dict[str, object]] = []
    # Blender forwards arguments after `--`.  Restricting a run to one source
    # pack keeps recovery inexpensive when an artist replaces just one set.
    labels = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else list(PACKS)
    only_tier = None
    if len(labels) == 2 and labels[1].isdigit():
        only_tier = int(labels.pop())
        if not 1 <= only_tier <= 5:
            raise ValueError(f"Weapon tier must be 1 through 5, got {only_tier}")
    unknown = sorted(set(labels) - set(PACKS))
    if unknown:
        raise ValueError(f"Unknown weapon packs: {unknown}")
    for label in labels:
        config = PACKS[label]
        report.extend(export_pack(label, config, only_tier))
    report_path = OUTPUT_ROOT / "export_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
