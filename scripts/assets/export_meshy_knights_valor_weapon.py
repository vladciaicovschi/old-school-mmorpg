"""Inspect and export the user-provided Meshy Knight's Valor weapon FBX.

Run from the repository root with Blender in background mode.  The inspection
mode intentionally performs no writes; it is useful because Meshy commonly
delivers characters and props as disconnected islands inside a single mesh.

  blender --background --factory-startup \
    --python scripts/assets/export_meshy_knights_valor_weapon.py -- \
    --source-fbx "D:/MODELS/NEW_MODEL/sword_and_shield/Meshy_AI_Knight_s_Valor_0918150606_texture_fbx/Meshy_AI_Knight_s_Valor_0918150606_texture.fbx" \
    --inspect-only
"""

from __future__ import annotations

import argparse
import math
import sys
from collections import deque
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "tmp" / "asset_src" / "meshy_knights_valor"


def args_after_double_dash() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-fbx", type=Path, required=True)
    parser.add_argument("--inspect-only", action="store_true")
    parser.add_argument("--preview-output", type=Path)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args(args_after_double_dash())


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
    return sorted(components, key=len, reverse=True)


def bounds_for_vertices(obj: bpy.types.Object, indices: list[int]) -> tuple[tuple[float, ...], tuple[float, ...]]:
    coords = [obj.matrix_world @ obj.data.vertices[index].co for index in indices]
    minimum = tuple(round(min(coord[axis] for coord in coords), 4) for axis in range(3))
    maximum = tuple(round(max(coord[axis] for coord in coords), 4) for axis in range(3))
    return minimum, maximum


def build_material(source: Path) -> bpy.types.Material:
    texture_paths = {
        "base": source.with_suffix(".png"),
        "normal": source.with_name(f"{source.stem}_normal.png"),
        "roughness": source.with_name(f"{source.stem}_roughness.png"),
        "metallic": source.with_name(f"{source.stem}_metallic.png"),
    }
    for texture in texture_paths.values():
        if not texture.is_file():
            raise FileNotFoundError(texture)

    material = bpy.data.materials.new("meshy_knights_valor_pbr")
    material.use_nodes = True
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (640, 0)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (360, 0)
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    base = nodes.new("ShaderNodeTexImage")
    base.location = (-520, 240)
    base.image = bpy.data.images.load(str(texture_paths["base"]), check_existing=True)
    links.new(base.outputs["Color"], shader.inputs["Base Color"])

    normal_image = nodes.new("ShaderNodeTexImage")
    normal_image.location = (-520, 20)
    normal_image.image = bpy.data.images.load(str(texture_paths["normal"]), check_existing=True)
    normal_image.image.colorspace_settings.name = "Non-Color"
    normal = nodes.new("ShaderNodeNormalMap")
    normal.location = (-120, 20)
    links.new(normal_image.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], shader.inputs["Normal"])

    for index, name in enumerate(("roughness", "metallic")):
        node = nodes.new("ShaderNodeTexImage")
        node.location = (-520, -200 - index * 220)
        node.image = bpy.data.images.load(str(texture_paths[name]), check_existing=True)
        node.image.colorspace_settings.name = "Non-Color"
        links.new(node.outputs["Color"], shader.inputs[name.title()])
    return material


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_preview(output: Path, mesh: bpy.types.Object) -> None:
    output = output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Preview_World")
    scene.world.color = (0.025, 0.03, 0.04)

    corners = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
    minimum = Vector(tuple(min(corner[axis] for corner in corners) for axis in range(3)))
    maximum = Vector(tuple(max(corner[axis] for corner in corners) for axis in range(3)))
    center = (minimum + maximum) * 0.5
    size = maximum - minimum

    camera_data = bpy.data.cameras.new("Preview_Camera")
    camera = bpy.data.objects.new("Preview_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + Vector((0.0, -4.0, 0.15))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(size.x, size.z) * 1.18
    look_at(camera, center)
    scene.camera = camera

    key_data = bpy.data.lights.new("Preview_Key", "AREA")
    key_data.energy = 950.0
    key_data.shape = "DISK"
    key_data.size = 4.0
    key = bpy.data.objects.new("Preview_Key", key_data)
    bpy.context.collection.objects.link(key)
    key.location = center + Vector((-2.5, -3.0, 3.0))
    look_at(key, center)

    fill_data = bpy.data.lights.new("Preview_Fill", "AREA")
    fill_data.energy = 650.0
    fill_data.size = 3.0
    fill = bpy.data.objects.new("Preview_Fill", fill_data)
    bpy.context.collection.objects.link(fill)
    fill.location = center + Vector((3.0, -1.5, 0.8))
    look_at(fill, center)

    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    print("KNIGHTS_VALOR_PREVIEW", output)


def isolated_component(
    source: bpy.types.Object,
    component: list[int],
    name: str,
) -> bpy.types.Object:
    clone = source.copy()
    clone.data = source.data.copy()
    clone.name = name
    clone.data.name = f"{name}_Mesh"
    bpy.context.collection.objects.link(clone)

    keep = set(component)
    editable = bmesh.new()
    editable.from_mesh(clone.data)
    editable.verts.ensure_lookup_table()
    remove = [vertex for vertex in editable.verts if vertex.index not in keep]
    bmesh.ops.delete(editable, geom=remove, context="VERTS")
    editable.to_mesh(clone.data)
    editable.free()
    clone.data.validate(verbose=True, clean_customdata=False)
    clone.data.update()
    return clone


def component_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    coords = [vertex.co.copy() for vertex in obj.data.vertices]
    minimum = Vector(tuple(min(coord[axis] for coord in coords) for axis in range(3)))
    maximum = Vector(tuple(max(coord[axis] for coord in coords) for axis in range(3)))
    return minimum, maximum


def orient_at_grip(obj: bpy.types.Object, kind: str) -> None:
    minimum, maximum = component_bounds(obj)
    size = maximum - minimum
    if kind == "sword":
        # Knight's Valor is authored blade-down: its wrapped handle occupies
        # the upper part of the source component. Seat the origin in the grip,
        # not at the whole sword's bounds centre or at the blade tip.
        origin = Vector(((minimum.x + maximum.x) * 0.5, (minimum.y + maximum.y) * 0.5, minimum.z + size.z * 0.82))
        scale = 0.7
        # The source is authored blade-down. Rotate around the grip (the
        # broad-face normal) so the runtime receives a blade-up weapon without
        # moving the handle out of the calibrated palm position.
        orientation = Matrix.Rotation(math.pi, 4, "Y")
    elif kind == "shield":
        # Centre the shield on its unseen back grip.  Positive source Y is the
        # back face; a small inset avoids embedding the forearm in the plate.
        origin = Vector(((minimum.x + maximum.x) * 0.5, maximum.y - size.y * 0.08, (minimum.z + maximum.z) * 0.5))
        # Keep the native 1.48-unit plate; the existing Rectangle_Shield hand
        # family applies the final 0.5964 wearable scale in the renderer.
        scale = 1.0
        orientation = Matrix.Identity(4)
    else:
        raise ValueError(kind)

    # Meshy authored the source upright on Blender Z.  glTF's Y-up export maps
    # that axis to runtime +Y for us, so only re-origin and scale here.  An
    # extra Blender-space quarter turn would incorrectly put the blade on glTF
    # Z and defeat the renderer's height/grip calculations.
    transform = orientation @ Matrix.Scale(scale, 4) @ Matrix.Translation(-origin)
    obj.data.transform(transform)
    obj.matrix_world = Matrix.Identity(4)
    obj.data.update()
    obj["grip_origin"] = kind
    obj["source"] = "Meshy AI Knight's Valor"


def export_glb(obj: bpy.types.Object, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.hide_render = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
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
        raise RuntimeError(f"GLB export failed for {output}: {result}")
    minimum, maximum = component_bounds(obj)
    print(
        "KNIGHTS_VALOR_EXPORTED",
        {
            "output": str(output),
            "bytes": output.stat().st_size,
            "vertices": len(obj.data.vertices),
            "polygons": len(obj.data.polygons),
            "min": tuple(round(value, 4) for value in minimum),
            "max": tuple(round(value, 4) for value in maximum),
        },
    )


def main() -> None:
    args = parse_args()
    source = args.source_fbx.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.fbx(filepath=str(source), use_anim=False)
    if result != {"FINISHED"}:
        raise RuntimeError(f"FBX import failed: {result}")

    print("KNIGHTS_VALOR_SOURCE", source)
    imported_meshes: list[bpy.types.Object] = []
    for obj in bpy.context.scene.objects:
        parent = obj.parent.name if obj.parent is not None else None
        print(
            "OBJECT",
            {
                "name": obj.name,
                "type": obj.type,
                "parent": parent,
                "location": tuple(round(value, 4) for value in obj.location),
                "rotation": tuple(round(value, 4) for value in obj.rotation_euler),
                "scale": tuple(round(value, 4) for value in obj.scale),
            },
        )
        if obj.type != "MESH":
            continue
        imported_meshes.append(obj)
        components = connected_components(obj.data)
        materials = [slot.material.name if slot.material else None for slot in obj.material_slots]
        print(
            "MESH",
            {
                "vertices": len(obj.data.vertices),
                "polygons": len(obj.data.polygons),
                "materials": materials,
                "components": len(components),
            },
        )
        for slot in obj.material_slots:
            material = slot.material
            if material is None:
                continue
            image_nodes = []
            if material.use_nodes and material.node_tree is not None:
                image_nodes = [
                    (node.name, node.image.filepath if node.image is not None else None)
                    for node in material.node_tree.nodes
                    if node.type == "TEX_IMAGE"
                ]
            print(
                "MATERIAL",
                {
                    "name": material.name,
                    "use_nodes": material.use_nodes,
                    "blend_method": getattr(material, "surface_render_method", None),
                    "images": image_nodes,
                },
            )
        for index, component in enumerate(components[:40]):
            minimum, maximum = bounds_for_vertices(obj, component)
            print(
                "COMPONENT",
                {
                    "index": index,
                    "vertices": len(component),
                    "min": minimum,
                    "max": maximum,
                    "size": tuple(round(maximum[axis] - minimum[axis], 4) for axis in range(3)),
                },
            )

    if len(imported_meshes) != 1:
        raise RuntimeError(f"expected one imported mesh, found {len(imported_meshes)}")
    mesh = imported_meshes[0]
    material = build_material(source)
    mesh.data.materials.clear()
    mesh.data.materials.append(material)
    if args.preview_output is not None:
        render_preview(args.preview_output, mesh)

    if args.inspect_only:
        return

    components = connected_components(mesh.data)
    if len(components) != 2:
        raise RuntimeError(f"expected sword and shield components, found {len(components)}")
    shield_component, sword_component = components
    shield = isolated_component(mesh, shield_component, "Knights_Valor_Shield")
    sword = isolated_component(mesh, sword_component, "Knights_Valor_Sword")
    orient_at_grip(shield, "shield")
    orient_at_grip(sword, "sword")
    mesh.hide_set(True)
    mesh.hide_render = True

    output_dir = args.output_dir.expanduser().resolve()
    export_glb(sword, output_dir / "knights_valor_sword.glb")
    export_glb(shield, output_dir / "knights_valor_shield.glb")


if __name__ == "__main__":
    main()
