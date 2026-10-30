"""Export the selected Quaternius Blender sources to deterministic raw GLBs.

Run from the repository root:
  blender --background --python scripts/assets/export_quaternius_modular_weapons.py -- \
    scripts/assets/specs/quaternius_modular_weapons.json
"""

import json
import pathlib
import sys

import bpy


def repository_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parents[2]


def spec_path_from_args(root: pathlib.Path) -> pathlib.Path:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) != 1:
        raise RuntimeError("expected one asset spec path after --")
    candidate = pathlib.Path(args[0])
    return candidate if candidate.is_absolute() else root / candidate


def convert_legacy_material(material: bpy.types.Material) -> None:
    """Carry Blender 2.7 diffuse colors into the modern glTF PBR exporter."""
    base_color = tuple(material.diffuse_color)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    output = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    principled.inputs["Base Color"].default_value = base_color
    is_metal = "steel" in material.name.lower() or "gold" in material.name.lower()
    principled.inputs["Metallic"].default_value = 0.72 if is_metal else 0.0
    principled.inputs["Roughness"].default_value = 0.38 if is_metal else 0.72


def export_item(root: pathlib.Path, item: dict[str, object]) -> None:
    source = (
        root
        / "tmp"
        / "asset_src"
        / "quaternius_modular_weapons"
        / "extracted"
        / "Blends"
        / str(item["sourceBlend"])
    )
    output = root / str(item["src"])
    scale = float(item["scale"])
    if not source.is_file():
        raise FileNotFoundError(source)

    bpy.ops.wm.open_mainfile(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"source has no mesh objects: {source}")

    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
        mesh.scale = tuple(component * scale for component in mesh.scale)
        for slot in mesh.material_slots:
            if slot.material is not None:
                convert_legacy_material(slot.material)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_apply=True,
    )
    print(f"exported {source.name} -> {output.relative_to(root)}")


def main() -> None:
    root = repository_root()
    spec_path = spec_path_from_args(root)
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    for item in spec["items"]:
        export_item(root, item)


if __name__ == "__main__":
    main()
