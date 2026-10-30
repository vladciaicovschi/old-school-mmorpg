"""Build the Meshy Iron Titan test body with selected Mixamo clips and PBR textures.

Run from the repository root:

  blender --background --factory-startup \
    --python scripts/anim/blender_bake_meshy_titan.py -- \
    --source-fbx "D:/MODELS/NEW_MODEL/character_base_locomotion/Meshy_AI_Iron_Titan_0918143427_mixamo_ready.fbx" \
    --locomotion-dir "D:/MODELS/NEW_MODEL/character_base_locomotion" \
    --combat-dir "D:/MODELS/NEW_MODEL/character_base_sword" \
    --texture-dir "D:/MODELS/NEW_MODEL/character_base/Meshy_AI_Iron_Titan_0918143427_texture_fbx" \
    --armor-fbx "D:/MODELS/NEW_MODEL/segmented_armor/Meshy_AI_Floating_Knight_Armor_0918151013_texture_fbx/Meshy_AI_Floating_Knight_Armor_0918151013_texture.fbx" \
    --armor-texture-dir "D:/MODELS/NEW_MODEL/segmented_armor/Meshy_AI_Floating_Knight_Armor_0918151013_texture_fbx"

The raw GLB lands under tmp/asset_src. Run the meshy_titan asset spec after
this script, then the repository KTX2 texture compression step.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = REPO_ROOT / "tmp" / "asset_src" / "meshy_titan" / "meshy_titan.glb"
HIPS_BONE = "mixamorig:Hips"
BONE_PATH = re.compile(r'pose\.bones\["([^"]+)"\]')
MIXAMO_UNIT_SCALE = 0.01
TEXTURE_STEM = "Meshy_AI_Iron_Titan_0918143427_texture"
ARMOR_TEXTURE_STEM = "Meshy_AI_Floating_Knight_Armor_0918151013_texture"
ARMOR_SET_ID = "knights_valor"
MIXAMO_RIG_PROXY_MATERIAL_PREFIX = "MIXAMO_RIG_PROXY_REMOVE_AFTER_RIG"

# The source is a presentation-style floating suit authored close to the
# Titan's A-pose. The arm chains only need shortening around the shoulder plus
# the small per-part fit corrections below.
ARMOR_PART_OFFSETS = {
    "Armor_valor_Head": Vector((0.0, 0.0, 0.055)),
    "Armor_valor_Chest": Vector((0.0, 0.0, 0.0)),
    "Armor_valor_Waist": Vector((0.0, 0.0, 0.045)),
    "Armor_valor_ShoulderL": Vector((-0.16, 0.0, -0.08)),
    "Armor_valor_ShoulderR": Vector((0.16, 0.0, -0.08)),
    "Armor_valor_BracerL": Vector((-0.18, 0.0, -0.02)),
    "Armor_valor_BracerR": Vector((0.18, 0.0, -0.02)),
    "Armor_valor_GloveL": Vector((-0.26, 0.0, -0.09)),
    "Armor_valor_GloveR": Vector((0.26, 0.0, -0.09)),
    "Armor_valor_LegL": Vector((-0.255, 0.0, 0.09)),
    "Armor_valor_LegR": Vector((0.255, 0.0, 0.09)),
    "Armor_valor_FootL": Vector((-0.295, 0.0, 0.02)),
    "Armor_valor_FootR": Vector((0.295, 0.0, 0.02)),
}

ARMOR_PART_BONES = {
    "Armor_valor_Head": "mixamorig:Head",
    "Armor_valor_Chest": "mixamorig:Spine2",
    "Armor_valor_Waist": "mixamorig:Hips",
    "Armor_valor_ShoulderL": "mixamorig:LeftArm",
    "Armor_valor_ShoulderR": "mixamorig:RightArm",
    "Armor_valor_BracerL": "mixamorig:LeftForeArm",
    "Armor_valor_BracerR": "mixamorig:RightForeArm",
    "Armor_valor_GloveL": "mixamorig:LeftHand",
    "Armor_valor_GloveR": "mixamorig:RightHand",
    "Armor_valor_LegL": "mixamorig:LeftUpLeg",
    "Armor_valor_LegR": "mixamorig:RightUpLeg",
    "Armor_valor_FootL": "mixamorig:LeftLeg",
    "Armor_valor_FootR": "mixamorig:RightLeg",
}

ARMOR_ARM_PARTS = {
    "Armor_valor_ShoulderL",
    "Armor_valor_ShoulderR",
    "Armor_valor_BracerL",
    "Armor_valor_BracerR",
    "Armor_valor_GloveL",
    "Armor_valor_GloveR",
}
ARMOR_ARM_SCALE = 0.75
ARMOR_HAND_SCALE = 0.85
ARMOR_HAND_PARTS = {"Armor_valor_GloveL", "Armor_valor_GloveR"}

ARMOR_PART_SLOTS = {
    "Armor_valor_Head": "helmet",
    "Armor_valor_Chest": "chest",
    "Armor_valor_Waist": "waist",
    "Armor_valor_ShoulderL": "shoulder",
    "Armor_valor_ShoulderR": "shoulder",
    "Armor_valor_BracerL": "gloves",
    "Armor_valor_BracerR": "gloves",
    "Armor_valor_GloveL": "gloves",
    "Armor_valor_GloveR": "gloves",
    "Armor_valor_LegL": "legs",
    "Armor_valor_LegR": "legs",
    "Armor_valor_FootL": "feet",
    "Armor_valor_FootR": "feet",
}

# Character assets deliberately skip simplify in build_assets.mjs because a
# generic pass can damage skinning. This model-specific rest-pose reduction is
# applied before weight transfer and validated on the finalized rig instead.
ARMOR_DECIMATE_RATIOS = {
    "Armor_valor_Head": 0.28,
    "Armor_valor_Chest": 0.25,
    "Armor_valor_Waist": 0.22,
    "Armor_valor_ShoulderL": 0.24,
    "Armor_valor_ShoulderR": 0.24,
    "Armor_valor_BracerL": 0.26,
    "Armor_valor_BracerR": 0.26,
    "Armor_valor_GloveL": 0.34,
    "Armor_valor_GloveR": 0.34,
    "Armor_valor_LegL": 0.24,
    "Armor_valor_LegR": 0.24,
    "Armor_valor_FootL": 0.25,
    "Armor_valor_FootR": 0.25,
}


@dataclass(frozen=True)
class ClipSource:
    name: str
    folder: str
    filename: str


CLIPS = (
    # The generic locomotion idle leaves this broad-shouldered mesh in an
    # exaggerated palms-up pose.  The player is visibly armed, so keep the
    # sword-and-shield upper-body stance for both peaceful and combat idle.
    # Retarget the evaluated donor pose rather than copying its raw F-curves:
    # Mixamo animation-only FBXs use bone rest axes that differ from the skinned
    # base FBX even though all 41 bone names match.
    ClipSource("Titan_Idle", "combat", "sword and shield idle (2).fbx"),
    ClipSource("Titan_Walk", "locomotion", "walking.fbx"),
    ClipSource("Titan_Run", "locomotion", "standard run.fbx"),
    ClipSource("Titan_Jump", "locomotion", "jump.fbx"),
    ClipSource("Titan_CombatIdle", "combat", "sword and shield idle (2).fbx"),
    ClipSource("Titan_Attack", "combat", "sword and shield attack.fbx"),
    ClipSource("Titan_Slash", "combat", "sword and shield slash.fbx"),
    ClipSource("Titan_Hit", "combat", "sword and shield impact.fbx"),
    ClipSource("Titan_Death", "combat", "sword and shield death.fbx"),
    ClipSource("Titan_Cast", "combat", "sword and shield casting.fbx"),
)


def args_after_double_dash() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-fbx", type=Path, required=True)
    parser.add_argument("--locomotion-dir", type=Path, required=True)
    parser.add_argument("--combat-dir", type=Path, required=True)
    parser.add_argument("--texture-dir", type=Path, required=True)
    parser.add_argument("--armor-fbx", type=Path, required=True)
    parser.add_argument("--armor-texture-dir", type=Path, required=True)
    parser.add_argument("--preview-output", type=Path)
    parser.add_argument("--preview-only", action="store_true")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args(args_after_double_dash())


def assert_file(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise FileNotFoundError(resolved)
    return resolved


def action_fcurves(action: bpy.types.Action) -> list[bpy.types.FCurve]:
    curves: list[bpy.types.FCurve] = []
    layers = getattr(action, "layers", None)
    if layers:
        for layer in layers:
            for strip in layer.strips:
                for slot in action.slots:
                    channelbag = strip.channelbag(slot, ensure=False)
                    if channelbag is not None:
                        curves.extend(channelbag.fcurves)
        return curves
    return list(action.fcurves)


def location_anchor(action: bpy.types.Action, index: int) -> float:
    path = f'pose.bones["{HIPS_BONE}"].location'
    for curve in action_fcurves(action):
        if curve.data_path == path and curve.array_index == index:
            points = curve.keyframe_points
            if points:
                return float(points[0].co.y)
    raise RuntimeError(f"{action.name} has no {path}[{index}] curve")


def scale_pose_locations(action: bpy.types.Action, scale: float) -> None:
    """Convert every animated bone translation from FBX centimetres to metres."""
    for curve in action_fcurves(action):
        if not curve.data_path.endswith(".location") or 'pose.bones["' not in curve.data_path:
            continue
        for point in curve.keyframe_points:
            point.co.y *= scale
            point.handle_left.y *= scale
            point.handle_right.y *= scale
        curve.update()


def remove_horizontal_root_motion(
    action: bpy.types.Action,
    anchor_x: float,
    anchor_z: float,
) -> None:
    path = f'pose.bones["{HIPS_BONE}"].location'
    anchors = {0: anchor_x, 2: anchor_z}
    for curve in action_fcurves(action):
        value = anchors.get(curve.array_index) if curve.data_path == path else None
        if value is None:
            continue
        for point in curve.keyframe_points:
            point.co.y = value
            point.handle_left.y = value
            point.handle_right.y = value
        curve.update()


def action_bone_names(action: bpy.types.Action) -> set[str]:
    names: set[str] = set()
    for curve in action_fcurves(action):
        match = BONE_PATH.fullmatch(curve.data_path.rsplit(".", 1)[0])
        if match:
            names.add(match.group(1))
    return names


def clear_animation(armature: bpy.types.Object) -> tuple[float, float]:
    if armature.animation_data is None or armature.animation_data.action is None:
        raise RuntimeError("The rigged base FBX has no bind-pose action")
    base_action = armature.animation_data.action
    scale_pose_locations(base_action, MIXAMO_UNIT_SCALE)
    anchor = (location_anchor(base_action, 0), location_anchor(base_action, 2))
    armature.animation_data_clear()
    if base_action.users == 0:
        bpy.data.actions.remove(base_action)
    armature.animation_data_create()
    return anchor


def build_material(
    texture_dir: Path,
    texture_stem: str = TEXTURE_STEM,
    material_name: str = "meshy_iron_titan_skin",
) -> bpy.types.Material:
    texture_paths = {
        "base": assert_file(texture_dir / f"{texture_stem}.png"),
        "normal": assert_file(texture_dir / f"{texture_stem}_normal.png"),
        "roughness": assert_file(texture_dir / f"{texture_stem}_roughness.png"),
        "metallic": assert_file(texture_dir / f"{texture_stem}_metallic.png"),
    }

    material = bpy.data.materials.new(material_name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (640, 0)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (360, 0)
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    base = nodes.new("ShaderNodeTexImage")
    base.name = "Base Color"
    base.location = (-520, 240)
    base.image = bpy.data.images.load(str(texture_paths["base"]), check_existing=True)
    links.new(base.outputs["Color"], shader.inputs["Base Color"])

    normal_image = nodes.new("ShaderNodeTexImage")
    normal_image.name = "Normal"
    normal_image.location = (-520, 20)
    normal_image.image = bpy.data.images.load(str(texture_paths["normal"]), check_existing=True)
    normal_image.image.colorspace_settings.name = "Non-Color"
    normal = nodes.new("ShaderNodeNormalMap")
    normal.location = (-120, 20)
    links.new(normal_image.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], shader.inputs["Normal"])

    roughness = nodes.new("ShaderNodeTexImage")
    roughness.name = "Roughness"
    roughness.location = (-520, -200)
    roughness.image = bpy.data.images.load(str(texture_paths["roughness"]), check_existing=True)
    roughness.image.colorspace_settings.name = "Non-Color"
    links.new(roughness.outputs["Color"], shader.inputs["Roughness"])

    metallic = nodes.new("ShaderNodeTexImage")
    metallic.name = "Metallic"
    metallic.location = (-520, -420)
    metallic.image = bpy.data.images.load(str(texture_paths["metallic"]), check_existing=True)
    metallic.image.colorspace_settings.name = "Non-Color"
    links.new(metallic.outputs["Color"], shader.inputs["Metallic"])

    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    return material


def remove_mixamo_rig_proxy_geometry(mesh: bpy.types.Object) -> int:
    """Remove temporary authorig silhouette helpers by their preserved material."""
    proxy_indices = {
        index
        for index, material in enumerate(mesh.data.materials)
        if material and material.name.startswith(MIXAMO_RIG_PROXY_MATERIAL_PREFIX)
    }
    if not proxy_indices:
        return 0
    editable = bmesh.new()
    editable.from_mesh(mesh.data)
    proxy_faces = [face for face in editable.faces if face.material_index in proxy_indices]
    removed = len(proxy_faces)
    bmesh.ops.delete(editable, geom=proxy_faces, context="FACES")
    loose_vertices = [vertex for vertex in editable.verts if not vertex.link_faces]
    if loose_vertices:
        bmesh.ops.delete(editable, geom=loose_vertices, context="VERTS")
    editable.to_mesh(mesh.data)
    editable.free()
    mesh.data.update()
    # Leave material-slot compaction to the final material rebuild. Polygon
    # indices remain stable and the proxy material cannot render without faces.
    return removed


def import_base(source_fbx: Path) -> tuple[bpy.types.Object, bpy.types.Object]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.fbx(filepath=str(source_fbx), use_anim=True)
    if result != {"FINISHED"}:
        raise RuntimeError(f"Base FBX import failed: {result}")

    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(armatures) != 1 or len(meshes) != 1:
        raise RuntimeError(
            f"Expected one armature and one mesh, found {len(armatures)} and {len(meshes)}"
        )
    armature = armatures[0]
    mesh = meshes[0]
    removed_proxy_faces = remove_mixamo_rig_proxy_geometry(mesh)
    if removed_proxy_faces:
        mesh["mixamo_proxy_faces_removed"] = removed_proxy_faces
    armature.name = "Titan_Rig"
    mesh.name = "Titan_Body"
    mesh.data.name = "Titan_Body_Mesh"

    # Mixamo's FBX imports as a centimetre-space armature (object scale 0.01)
    # with the inverse scale parked on the child mesh (scale 100 plus the FBX
    # axis correction). The glTF exporter used to drop that child transform,
    # leaving a 2 cm mesh around a metre-scale skeleton: skinning still drew via
    # inverse binds, but a prop parented to a hand landed ~100 body-heights away.
    # Applying the ARMATURE transform makes both the bones and its child mesh
    # metre-native in one operation while preserving the mesh's world bounds.
    # Imported action translations are converted separately below.
    before_dimensions = mesh.dimensions.copy()
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    result = bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if result != {"FINISHED"}:
        raise RuntimeError(f"Armature transform bake failed: {result}")
    if max(abs(value - 1.0) for value in armature.scale) > 1e-5:
        raise RuntimeError(f"Armature scale was not applied: {tuple(armature.scale)}")
    # Most Mixamo exports park the inverse scale on the child and Blender
    # consumes it when the armature transform is applied. A few FBX 7.7 files
    # keep a uniform 0.01 on the mesh instead. Bake that remaining object
    # transform explicitly; this changes neither world bounds nor skinning and
    # keeps the exported glTF in the same metre-native convention.
    if max(abs(value - 1.0) for value in mesh.scale) > 1e-5:
        bpy.ops.object.select_all(action="DESELECT")
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = mesh
        result = bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        if result != {"FINISHED"}:
            raise RuntimeError(f"Child mesh transform bake failed: {result}")
    if max(abs(value - 1.0) for value in mesh.scale) > 1e-5:
        raise RuntimeError(f"Child mesh scale was not normalized: {tuple(mesh.scale)}")
    dimension_delta = (mesh.dimensions - before_dimensions).length
    # FBX files that leave their axis correction on the mesh swap Y/Z when
    # that correction is baked. Compare the unordered extents as well: the
    # shape must stay identical even though its local up axis is normalized.
    sorted_dimension_delta = Vector(sorted(mesh.dimensions)) - Vector(sorted(before_dimensions))
    # FBX 7.7 round-trips can shift a bound by a few tenths of a millimetre
    # after temporary proxy faces are deleted. That is numeric noise at a
    # roughly two-metre character scale, while a real scale/axis failure is
    # orders of magnitude larger.
    if dimension_delta > 1e-3 and sorted_dimension_delta.length > 1e-3:
        raise RuntimeError(
            f"Mesh transform bake changed world dimensions: "
            f"{tuple(before_dimensions)} -> {tuple(mesh.dimensions)}"
        )
    return armature, mesh


def object_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(corner[axis] for corner in corners) for axis in range(3)))
    maximum = Vector(tuple(max(corner[axis] for corner in corners) for axis in range(3)))
    return minimum, maximum


def classify_armor_part(obj: bpy.types.Object) -> str | None:
    """Classify the thirteen substantial pieces in the known floating suit."""
    minimum, maximum = object_bounds(obj)
    center = (minimum + maximum) * 0.5
    if len(obj.data.vertices) < 1000:
        return None
    if abs(center.x) < 0.15:
        if minimum.z > 0.55:
            return "Armor_valor_Head"
        if minimum.z > 0.10:
            return "Armor_valor_Chest"
        return "Armor_valor_Waist"

    side = "L" if center.x > 0.0 else "R"
    if minimum.z > 0.48:
        return f"Armor_valor_Shoulder{side}"
    if minimum.z > 0.10:
        return f"Armor_valor_Bracer{side}"
    if maximum.z < -0.35:
        return f"Armor_valor_Foot{side}"
    if minimum.z > -0.42 and maximum.z < 0.06:
        return f"Armor_valor_Leg{side}"
    return f"Armor_valor_Glove{side}"


def join_mesh_objects(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    if not objects:
        raise RuntimeError(f"No source objects for {name}")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    active = objects[0]
    bpy.context.view_layer.objects.active = active
    if len(objects) > 1:
        result = bpy.ops.object.join()
        if result != {"FINISHED"}:
            raise RuntimeError(f"Failed to join armor pieces for {name}: {result}")
    active.name = name
    active.data.name = f"{name}_Mesh"
    return active


def apply_object_transform(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    result = bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if result != {"FINISHED"}:
        raise RuntimeError(f"Transform bake failed for {obj.name}: {result}")


def decimate_armor_part(obj: bpy.types.Object, ratio: float) -> tuple[int, int]:
    before = len(obj.data.polygons)
    modifier = obj.modifiers.new("Titan armor authored reduction", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    result = bpy.ops.object.modifier_apply(modifier=modifier.name)
    if result != {"FINISHED"}:
        raise RuntimeError(f"Armor decimate failed for {obj.name}: {result}")
    after = len(obj.data.polygons)
    if after <= 0 or after >= before:
        raise RuntimeError(f"Armor decimate did not reduce {obj.name}: {before} -> {after}")
    return before, after


def normalize_vertex_weights(obj: bpy.types.Object, max_influences: int = 4) -> None:
    groups = obj.vertex_groups
    for vertex in obj.data.vertices:
        memberships = [(entry.group, entry.weight) for entry in vertex.groups]
        weighted = sorted(
            ((group_index, weight) for group_index, weight in memberships if weight > 1e-6),
            key=lambda item: item[1],
            reverse=True,
        )
        if not weighted:
            raise RuntimeError(f"Unweighted armor vertex: {obj.name}[{vertex.index}]")
        keep = weighted[:max_influences]
        keep_indices = {group_index for group_index, _weight in keep}
        for group_index, _weight in memberships:
            if group_index not in keep_indices:
                groups[group_index].remove([vertex.index])
        total = sum(weight for _group_index, weight in keep)
        if total <= 1e-8:
            raise RuntimeError(f"Zero armor weight total: {obj.name}[{vertex.index}]")
        for group_index, weight in keep:
            groups[group_index].add([vertex.index], weight / total, "REPLACE")
        if any(entry.group not in keep_indices for entry in vertex.groups):
            raise RuntimeError(f"Armor weight limiting failed: {obj.name}[{vertex.index}]")


def bind_rigid_armor(
    armor: bpy.types.Object,
    armature: bpy.types.Object,
    bone_name: str,
) -> None:
    if armature.data.bones.get(bone_name) is None:
        raise RuntimeError(f"Armor bone is missing from Titan rig: {bone_name}")
    group = armor.vertex_groups.new(name=bone_name)
    group.add(range(len(armor.data.vertices)), 1.0, "REPLACE")
    normalize_vertex_weights(armor, max_influences=1)

    skin = armor.modifiers.new("Titan_Rig", "ARMATURE")
    skin.object = armature
    skin.use_deform_preserve_volume = True
    armor.parent = armature
    armor.matrix_parent_inverse = armature.matrix_world.inverted()


def pose_armor_part(part: bpy.types.Object, name: str, lift: float) -> None:
    part.location += Vector((0.0, 0.0, lift))
    apply_object_transform(part)
    if name in ARMOR_ARM_PARTS:
        is_left = name.endswith("L")
        pivot = Vector((0.23 if is_left else -0.23, 0.0, 1.55))
        scale = ARMOR_HAND_SCALE if name in ARMOR_HAND_PARTS else ARMOR_ARM_SCALE
        part.matrix_world = (
            Matrix.Translation(pivot)
            @ Matrix.Scale(scale, 4)
            @ Matrix.Translation(-pivot)
            @ part.matrix_world
        )
    part.matrix_world = Matrix.Translation(ARMOR_PART_OFFSETS[name]) @ part.matrix_world
    apply_object_transform(part)


def import_segmented_armor(
    source_fbx: Path,
    texture_dir: Path,
    armature: bpy.types.Object,
) -> list[bpy.types.Object]:
    existing_objects = set(bpy.data.objects)
    result = bpy.ops.import_scene.fbx(filepath=str(source_fbx), use_anim=False)
    if result != {"FINISHED"}:
        raise RuntimeError(f"Armor FBX import failed: {result}")
    imported = [obj for obj in bpy.data.objects if obj not in existing_objects]
    imported_meshes = [obj for obj in imported if obj.type == "MESH"]
    imported_armatures = [obj for obj in imported if obj.type == "ARMATURE"]
    if len(imported_meshes) != 1 or imported_armatures:
        raise RuntimeError(
            f"Expected one unrigged armor mesh, found meshes={len(imported_meshes)} "
            f"armatures={len(imported_armatures)}"
        )

    source = imported_meshes[0]
    bpy.ops.object.select_all(action="DESELECT")
    source.select_set(True)
    bpy.context.view_layer.objects.active = source
    bpy.ops.object.mode_set(mode="EDIT")
    result = bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    if result != {"FINISHED"}:
        raise RuntimeError(f"Armor loose-part split failed: {result}")
    pieces = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
    if len(pieces) != 15:
        raise RuntimeError(f"Expected 15 armor components, found {len(pieces)}")

    grouped: dict[str, list[bpy.types.Object]] = {}
    details: list[bpy.types.Object] = []
    for piece in pieces:
        name = classify_armor_part(piece)
        if name is None:
            details.append(piece)
            continue
        if name in grouped:
            raise RuntimeError(f"Duplicate substantial armor part classification: {name}")
        grouped[name] = [piece]
    missing = sorted(set(ARMOR_PART_OFFSETS) - set(grouped))
    if missing:
        raise RuntimeError(f"Armor part classification missed: {missing}")

    main_centers = {
        name: sum(object_bounds(objects[0]), Vector()) * 0.5
        for name, objects in grouped.items()
    }
    for detail in details:
        minimum, maximum = object_bounds(detail)
        center = (minimum + maximum) * 0.5
        target = min(main_centers, key=lambda name: (main_centers[name] - center).length)
        grouped[target].append(detail)

    armor_material = build_material(
        texture_dir,
        texture_stem=ARMOR_TEXTURE_STEM,
        material_name="meshy_knights_valor_armor",
    )
    ground = min(object_bounds(piece)[0].z for piece in pieces)
    # The normalized Mixamo rig is metre-native with visible feet on Z=0. The
    # body's raw object bound remains in its inverse-bind coordinate space and
    # sits about one metre above the visible skinned pose, so it is not a valid
    # placement anchor for unskinned source geometry.
    lift = -ground
    finished: list[bpy.types.Object] = []
    reductions: list[tuple[str, int, int]] = []
    for name in ARMOR_PART_OFFSETS:
        part = join_mesh_objects(grouped[name], name)
        pose_armor_part(part, name, lift)
        part.data.materials.clear()
        part.data.materials.append(armor_material)
        for polygon in part.data.polygons:
            polygon.use_smooth = True
        reductions.append((name, *decimate_armor_part(part, ARMOR_DECIMATE_RATIOS[name])))
        bind_rigid_armor(part, armature, ARMOR_PART_BONES[name])
        part["armor_set"] = ARMOR_SET_ID
        part["equipment_slot"] = ARMOR_PART_SLOTS[name]
        part.data.validate(verbose=True, clean_customdata=False)
        part.data.update()
        finished.append(part)

    for obj in imported:
        if obj.type != "MESH" and obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    print(
        "MESHY_TITAN_ARMOR",
        {
            "source": str(source_fbx),
            "components": len(pieces),
            "parts": len(finished),
            "ground_lift": round(lift, 6),
            "reductions": reductions,
            "vertices": sum(len(part.data.vertices) for part in finished),
            "polygons": sum(len(part.data.polygons) for part in finished),
        },
    )
    return finished


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_preview(output: Path, meshes: list[bpy.types.Object]) -> None:
    output = output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    armatures = [obj for obj in scene.objects if obj.type == "ARMATURE"]
    pose_positions = {obj.name: obj.data.pose_position for obj in armatures}
    for armature in armatures:
        armature.data.pose_position = "REST"
    bpy.context.view_layer.update()
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Titan_Armor_Preview_World")
    scene.world.color = (0.02, 0.025, 0.035)

    bounds = [object_bounds(mesh) for mesh in meshes]
    minimum = Vector(tuple(min(pair[0][axis] for pair in bounds) for axis in range(3)))
    maximum = Vector(tuple(max(pair[1][axis] for pair in bounds) for axis in range(3)))
    center = (minimum + maximum) * 0.5
    size = maximum - minimum

    camera_data = bpy.data.cameras.new("Titan_Armor_Preview_Camera")
    camera = bpy.data.objects.new("Titan_Armor_Preview_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + Vector((0.0, -4.0, 0.08))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(size.x, size.z) * 1.12
    look_at(camera, center)
    scene.camera = camera

    key_data = bpy.data.lights.new("Titan_Armor_Preview_Key", "AREA")
    key_data.energy = 1050.0
    key_data.shape = "DISK"
    key_data.size = 4.0
    key = bpy.data.objects.new("Titan_Armor_Preview_Key", key_data)
    bpy.context.collection.objects.link(key)
    key.location = center + Vector((-2.4, -3.0, 3.2))
    look_at(key, center)

    fill_data = bpy.data.lights.new("Titan_Armor_Preview_Fill", "AREA")
    fill_data.energy = 700.0
    fill_data.size = 3.0
    fill = bpy.data.objects.new("Titan_Armor_Preview_Fill", fill_data)
    bpy.context.collection.objects.link(fill)
    fill.location = center + Vector((2.8, -1.5, 1.2))
    look_at(fill, center)

    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    for armature in armatures:
        armature.data.pose_position = pose_positions[armature.name]
    bpy.context.view_layer.update()
    print("MESHY_TITAN_ARMOR_PREVIEW", output)


def apply_armature_object_transform(armature: bpy.types.Object) -> None:
    """Bake FBX centimetre scale and axis correction into an armature's data."""
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    result = bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if result != {"FINISHED"}:
        raise RuntimeError(f"Armature transform bake failed for {armature.name}: {result}")
    if max(abs(value - 1.0) for value in armature.scale) > 1e-5:
        raise RuntimeError(f"Armature scale was not applied: {tuple(armature.scale)}")


def pose_bone_depth(bone: bpy.types.PoseBone) -> int:
    depth = 0
    parent = bone.parent
    while parent is not None:
        depth += 1
        parent = parent.parent
    return depth


def retarget_action(
    base_armature: bpy.types.Object,
    donor_armature: bpy.types.Object,
    donor_action: bpy.types.Action,
    clip_name: str,
    allow_missing_bones: bool = False,
) -> bpy.types.Action:
    """Bake the donor's evaluated pose matrices onto the skinned base rig.

    A raw Mixamo Action cannot safely be moved between these FBXs: identical
    bone names hide different rest matrices/pre-rotations, most visibly on the
    upper arms, forearms and hands. Sampling the donor on its own rig and then
    solving the base pose from armature-space matrices preserves what Mixamo
    displays while producing one common skeleton for the game.
    """
    apply_armature_object_transform(donor_armature)
    scale_pose_locations(donor_action, MIXAMO_UNIT_SCALE)

    base_names = {bone.name for bone in base_armature.data.bones}
    missing_targets = sorted(action_bone_names(donor_action) - base_names)
    if missing_targets:
        raise RuntimeError(f"{donor_action.name} targets unknown bones: {missing_targets}")

    tracks = list(base_armature.animation_data.nla_tracks)
    previous_mutes = [track.mute for track in tracks]
    for track in tracks:
        track.mute = True

    action = bpy.data.actions.new(clip_name)
    base_armature.animation_data.action = action
    donor_armature.animation_data.action = donor_action
    ordered_bones = sorted(base_armature.pose.bones, key=pose_bone_depth)
    rest_skinning_remaps = {
        bone.name: donor_armature.data.bones[bone.name].matrix_local.inverted()
        @ base_armature.data.bones[bone.name].matrix_local
        for bone in ordered_bones
        if bone.name in donor_armature.data.bones
    }
    rest_relatives = {
        bone.name: (
            base_armature.data.bones[bone.parent.name].matrix_local.inverted()
            @ base_armature.data.bones[bone.name].matrix_local
            if bone.parent is not None
            else base_armature.data.bones[bone.name].matrix_local.copy()
        )
        for bone in ordered_bones
    }
    scene = bpy.context.scene
    start = int(round(donor_action.frame_range[0]))
    end = int(round(donor_action.frame_range[1]))
    previous_quaternions: dict[str, tuple[float, float, float, float]] = {}
    checkpoints = {0, 1, 2, 3, 4, end - start}
    expected_checkpoints: dict[int, dict[str, Matrix]] = {}

    try:
        for output_frame, source_frame in enumerate(range(start, end + 1)):
            scene.frame_set(source_frame)
            bpy.context.view_layer.update()
            donor_poses = {
                bone.name: bone.matrix.copy() for bone in donor_armature.pose.bones
            }
            target_matrices: dict[str, Matrix] = {}
            for bone in ordered_bones:
                donor_pose = donor_poses.get(bone.name)
                if donor_pose is None:
                    if not allow_missing_bones or bone.parent is None:
                        raise RuntimeError(f"{donor_action.name} is missing bone {bone.name}")
                    # Optional leaf chains absent from a compatible Mixamo
                    # donor (usually pinkies) follow their animated parent in
                    # the base rig's own rest relation instead of blocking the
                    # whole-body locomotion clip.
                    target_matrices[bone.name] = (
                        target_matrices[bone.parent.name] @ rest_relatives[bone.name]
                    )
                    bone.matrix_basis.identity()
                    continue
                # The pose matrix's local Y axis is the physical bone direction.
                # Copy that evaluated orientation directly, but rebuild every
                # child head from the base rest offsets below. Applying a full
                # rest-space delta rotates the broad Titan's forearms into the
                # torso because Mixamo's animation-only FBX uses a different
                # authored rest direction, not merely a different bone roll.
                target_rotation = donor_pose.to_quaternion().normalized()
                if bone.parent is None:
                    target_location = (
                        donor_pose @ rest_skinning_remaps[bone.name]
                    ).translation
                else:
                    target_location = (
                        target_matrices[bone.parent.name] @ rest_relatives[bone.name]
                    ).translation
                target_matrix = Matrix.LocRotScale(
                    target_location,
                    target_rotation,
                    Vector((1.0, 1.0, 1.0)),
                )
                target_matrices[bone.name] = target_matrix
                if bone.parent is None:
                    basis_matrix = (
                        rest_relatives[bone.name].inverted() @ target_matrix
                    )
                else:
                    basis_matrix = (
                        rest_relatives[bone.name].inverted()
                        @ target_matrices[bone.parent.name].inverted()
                        @ target_matrix
                    )
                bone.matrix_basis = basis_matrix
            bpy.context.view_layer.update()

            if output_frame in checkpoints:
                expected_checkpoints[output_frame] = target_matrices

            for bone in ordered_bones:
                quaternion = bone.rotation_quaternion
                previous = previous_quaternions.get(bone.name)
                if previous is not None:
                    dot = sum(a * b for a, b in zip(previous, quaternion))
                    if dot < 0.0:
                        quaternion.negate()
                previous_quaternions[bone.name] = tuple(quaternion)
                bone.keyframe_insert("location", frame=output_frame, group=bone.name)
                bone.keyframe_insert(
                    "rotation_quaternion", frame=output_frame, group=bone.name
                )
                bone.keyframe_insert("scale", frame=output_frame, group=bone.name)

        for output_frame, expected in expected_checkpoints.items():
            scene.frame_set(output_frame)
            bpy.context.view_layer.update()
            for bone in ordered_bones:
                actual = bone.matrix
                target = expected[bone.name]
                position_error = (actual.translation - target.translation).length
                rotation_error = actual.to_quaternion().rotation_difference(
                    target.to_quaternion()
                ).angle
                if position_error > 1e-4 or min(rotation_error, 6.283185307 - rotation_error) > 1e-4:
                    raise RuntimeError(
                        f"Retarget playback mismatch in {clip_name} frame {output_frame} "
                        f"bone {bone.name}: position={position_error}, rotation={rotation_error}, "
                        f"actual={tuple(actual.translation)}, target={tuple(target.translation)}, "
                        f"basis_location={tuple(bone.location)}, basis_scale={tuple(bone.scale)}"
                    )
    finally:
        base_armature.animation_data.action = None
        for track, muted in zip(tracks, previous_mutes):
            track.mute = muted

    for curve in action_fcurves(action):
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
        curve.update()
    return action


def add_clip(
    base_armature: bpy.types.Object,
    source: Path,
    clip_name: str,
    anchor_x: float,
    anchor_z: float,
    allow_missing_bones: bool = False,
) -> tuple[float, float]:
    existing_objects = set(bpy.data.objects)
    existing_actions = set(bpy.data.actions)
    result = bpy.ops.import_scene.fbx(filepath=str(source), use_anim=True)
    if result != {"FINISHED"}:
        raise RuntimeError(f"Animation FBX import failed for {source}: {result}")

    donor_objects = [obj for obj in bpy.data.objects if obj not in existing_objects]
    donor_armatures = [obj for obj in donor_objects if obj.type == "ARMATURE"]
    donor_actions = [action for action in bpy.data.actions if action not in existing_actions]
    if len(donor_armatures) != 1 or len(donor_actions) != 1:
        raise RuntimeError(
            f"Expected one donor armature/action in {source}, found "
            f"{len(donor_armatures)}/{len(donor_actions)}"
        )

    base_bones = {bone.name for bone in base_armature.data.bones}
    donor_bones = {bone.name for bone in donor_armatures[0].data.bones}
    if donor_bones != base_bones:
        missing = sorted(base_bones - donor_bones)
        extra = sorted(donor_bones - base_bones)
        if extra or (missing and not allow_missing_bones):
            raise RuntimeError(f"Skeleton mismatch in {source}: missing={missing}, extra={extra}")

    donor_armature = donor_armatures[0]
    donor_action = donor_actions[0]
    action = retarget_action(
        base_armature,
        donor_armature,
        donor_action,
        clip_name,
        allow_missing_bones=allow_missing_bones,
    )
    remove_horizontal_root_motion(action, anchor_x, anchor_z)

    track = base_armature.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 0, action)
    strip.name = clip_name

    frame_range = tuple(float(value) for value in action.frame_range)
    for obj in donor_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    if donor_action.users == 0:
        bpy.data.actions.remove(donor_action)
    return frame_range


def export_glb(
    output: Path,
    armature: bpy.types.Object,
    meshes: list[bpy.types.Object],
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = armature
    armature.animation_data.action = None

    result = bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips=True,
        export_anim_slide_to_zero=True,
        export_anim_single_armature=True,
        export_force_sampling=True,
        export_frame_range=False,
        export_frame_step=1,
        export_skins=True,
        export_all_influences=False,
        export_morph=True,
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
        raise RuntimeError(f"GLB export failed: {result}")


def main() -> None:
    args = parse_args()
    source_fbx = assert_file(args.source_fbx)
    locomotion_dir = args.locomotion_dir.expanduser().resolve()
    combat_dir = args.combat_dir.expanduser().resolve()
    texture_dir = args.texture_dir.expanduser().resolve()
    armor_fbx = assert_file(args.armor_fbx)
    armor_texture_dir = args.armor_texture_dir.expanduser().resolve()
    output = args.output.expanduser().resolve()

    armature, mesh = import_base(source_fbx)
    base_bones = {bone.name for bone in armature.data.bones}
    if HIPS_BONE not in base_bones:
        raise RuntimeError(f"Base rig has no {HIPS_BONE} bone")
    anchor_x, anchor_z = clear_animation(armature)

    material = build_material(texture_dir)
    mesh.data.materials.clear()
    mesh.data.materials.append(material)
    mesh.data.validate(verbose=True, clean_customdata=False)
    mesh.data.update()

    armor_parts = import_segmented_armor(
        armor_fbx,
        armor_texture_dir,
        armature,
    )
    if args.preview_output is not None:
        render_preview(args.preview_output, [mesh, *armor_parts])
    if args.preview_only:
        if args.preview_output is None:
            raise RuntimeError("--preview-only requires --preview-output")
        return

    built: list[tuple[str, tuple[float, float]]] = []
    for clip in CLIPS:
        folder = locomotion_dir if clip.folder == "locomotion" else combat_dir
        source = assert_file(folder / clip.filename)
        built.append(
            (
                clip.name,
                add_clip(
                    armature,
                    source,
                    clip.name,
                    anchor_x,
                    anchor_z,
                ),
            )
        )

    armature["source"] = "Meshy AI Iron Titan, Adobe Mixamo auto-rig and animations"
    mesh["source"] = "Meshy_AI_Iron_Titan_0918143427"
    export_glb(output, armature, [mesh, *armor_parts])
    print(
        "MESHY_TITAN_GLTF_EXPORTED",
        {
            "output": str(output),
            "bytes": output.stat().st_size,
            "bones": len(base_bones),
            "vertices": len(mesh.data.vertices),
            "polygons": len(mesh.data.polygons),
            "armor_parts": len(armor_parts),
            "armor_vertices": sum(len(part.data.vertices) for part in armor_parts),
            "armor_polygons": sum(len(part.data.polygons) for part in armor_parts),
            "clips": built,
        },
    )


if __name__ == "__main__":
    main()
