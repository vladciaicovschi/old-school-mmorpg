"""Build the user-provided Emberclaw crab with authored game clips.

Run from the repository root:

  blender --background --factory-startup \
    --python scripts/anim/blender_bake_emberclaw_crab.py -- \
    --source "D:/MODELS/Meshy_AI_Emberclaw_Crab_smart/Meshy_AI_Emberclaw_Crab_smart/Meshy_AI_Emberclaw_Crab_smart_Character_output.fbx" \
    --texture-dir "D:/MODELS/Meshy_AI_Emberclaw_Crab_smart/Meshy_AI_Emberclaw_Crab_smart"

The FBX contains a usable non-humanoid rig but no animation donors. This
headless-Blender escalation authors Idle, Locomotion, Attack, Hit and Death on
the source skeleton, limits skinning to four influences, and reduces the raw
149k-triangle mesh for an ordinary multi-spawn mob. The raw GLB lands under
tmp/asset_src and must still pass build_assets.mjs and KTX2 compression.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = REPO_ROOT / "tmp" / "asset_src" / "emberclaw_crab" / "emberclaw_crab.glb"
DEFAULT_PREVIEW_DIR = REPO_ROOT / "tmp" / "asset_src" / "emberclaw_crab" / "previews"

LEG_CHAINS = (
    ("Bone_013", "Bone_012", "Bone_011", "Bone_010", 0.0),
    ("Bone_019", "Bone_018", "Bone_017", "Bone_016", math.pi),
    ("Bone_025", "Bone_024", "Bone_023", "Bone_022", math.pi),
    ("Bone_031", "Bone_030", "Bone_029", "Bone_028", 0.0),
    ("Bone_037", "Bone_036", "Bone_035", "Bone_034", 0.0),
    ("Bone_043", "Bone_042", "Bone_041", "Bone_040", math.pi),
)


def args_after_double_dash() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--texture-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--preview-dir", type=Path, default=DEFAULT_PREVIEW_DIR)
    parser.add_argument("--decimate-ratio", type=float, default=0.4)
    parser.add_argument("--no-preview", action="store_true")
    return parser.parse_args(args_after_double_dash())


def require_file(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise FileNotFoundError(resolved)
    return resolved


def build_material(texture_dir: Path) -> bpy.types.Material:
    stem = "Meshy_AI_Emberclaw_Crab_smart_texture_0"
    paths = {
        "base": require_file(texture_dir / f"{stem}.png"),
        "normal": require_file(texture_dir / f"{stem}_normal.png"),
        "roughness": require_file(texture_dir / f"{stem}_roughness.png"),
        "metallic": require_file(texture_dir / f"{stem}_metallic.png"),
    }
    material = bpy.data.materials.new("Emberclaw_Crab_PBR")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    base = nodes.new("ShaderNodeTexImage")
    base.name = "Base Color"
    base.image = bpy.data.images.load(str(paths["base"]), check_existing=True)
    links.new(base.outputs["Color"], shader.inputs["Base Color"])

    normal_image = nodes.new("ShaderNodeTexImage")
    normal_image.name = "Normal"
    normal_image.image = bpy.data.images.load(str(paths["normal"]), check_existing=True)
    normal_image.image.colorspace_settings.name = "Non-Color"
    normal = nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = 0.75
    links.new(normal_image.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], shader.inputs["Normal"])

    roughness = nodes.new("ShaderNodeTexImage")
    roughness.name = "Roughness"
    roughness.image = bpy.data.images.load(str(paths["roughness"]), check_existing=True)
    roughness.image.colorspace_settings.name = "Non-Color"
    links.new(roughness.outputs["Color"], shader.inputs["Roughness"])

    metallic = nodes.new("ShaderNodeTexImage")
    metallic.name = "Metallic"
    metallic.image = bpy.data.images.load(str(paths["metallic"]), check_existing=True)
    metallic.image.colorspace_settings.name = "Non-Color"
    links.new(metallic.outputs["Color"], shader.inputs["Metallic"])
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    return material


def optimize_mesh(mesh: bpy.types.Object, ratio: float) -> tuple[int, int]:
    if not 0 < ratio <= 1:
        raise ValueError(f"decimate ratio must be in (0, 1], got {ratio}")
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    before = len(mesh.data.polygons)
    if ratio < 1:
        modifier = mesh.modifiers.new("GameReady_Decimate", "DECIMATE")
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        while mesh.modifiers.find(modifier.name) > 0:
            bpy.ops.object.modifier_move_up(modifier=modifier.name)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    mesh.data.validate(verbose=True, clean_customdata=False)
    mesh.data.update()
    return before, len(mesh.data.polygons)


def reset_pose(armature: bpy.types.Object) -> None:
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def key_pose(
    armature: bpy.types.Object,
    frame: int,
    locations: dict[str, tuple[float, float, float]],
    rotations: dict[str, tuple[float, float, float]],
) -> None:
    reset_pose(armature)
    for name, value in locations.items():
        armature.pose.bones[name].location = value
    for name, value in rotations.items():
        armature.pose.bones[name].rotation_euler = value
    for name in locations:
        armature.pose.bones[name].keyframe_insert("location", frame=frame, group=name)
    for name in rotations:
        armature.pose.bones[name].keyframe_insert("rotation_euler", frame=frame, group=name)


def new_action(armature: bpy.types.Object, name: str) -> bpy.types.Action:
    action = bpy.data.actions.new(name)
    armature.animation_data.action = action
    return action


def finish_action(
    armature: bpy.types.Object,
    action: bpy.types.Action,
    start: int,
    end: int,
) -> bpy.types.Action:
    armature.animation_data.action = None
    track = armature.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, start, action)
    strip.name = action.name
    strip.action_frame_start = start
    strip.action_frame_end = end
    strip.frame_start = start
    strip.frame_end = end
    return action


def build_idle(armature: bpy.types.Object) -> bpy.types.Action:
    action = new_action(armature, "Idle")
    for frame, phase in ((1, 0.0), (25, 1.0), (49, 0.0), (73, -1.0), (97, 0.0)):
        rotations = {
            "Bone_000": (math.radians(0.8) * phase, math.radians(1.2) * phase, 0.0),
            "Bone_004": (0.0, 0.0, math.radians(3.5) * phase),
            "Bone_007": (0.0, 0.0, -math.radians(3.5) * phase),
            "Bone_045": (math.radians(2.5) * phase, 0.0, 0.0),
            "Bone_049": (-math.radians(2.5) * phase, 0.0, 0.0),
            "Bone_013": (0.0, math.radians(0.8) * phase, 0.0),
            "Bone_019": (0.0, -math.radians(0.8) * phase, 0.0),
            "Bone_037": (0.0, -math.radians(0.6) * phase, 0.0),
            "Bone_043": (0.0, math.radians(0.6) * phase, 0.0),
        }
        key_pose(armature, frame, {"Bone_000": (0.0, 0.0, 0.018 * phase)}, rotations)
    return finish_action(armature, action, 1, 97)


def build_locomotion(armature: bpy.types.Object) -> bpy.types.Action:
    action = new_action(armature, "Locomotion")
    for frame in (1, 7, 13, 19, 25):
        t = (frame - 1) / 24.0 * math.tau
        rotations: dict[str, tuple[float, float, float]] = {
            "Bone_000": (
                math.radians(1.4) * math.sin(t * 2.0),
                math.radians(2.0) * math.sin(t),
                0.0,
            ),
            "Bone_004": (0.0, 0.0, math.radians(4.0) * math.sin(t + 0.35)),
            "Bone_007": (0.0, 0.0, -math.radians(4.0) * math.sin(t + 0.35)),
            "Bone_003": (math.radians(2.0) * math.sin(t), 0.0, 0.0),
            "Bone_006": (-math.radians(2.0) * math.sin(t), 0.0, 0.0),
        }
        for root, upper, knee, lower, offset in LEG_CHAINS:
            wave = math.sin(t + offset)
            lift = max(0.0, math.sin(t + offset + math.pi / 2.0))
            rotations[root] = (
                math.radians(7.0) * lift,
                math.radians(3.0) * wave,
                math.radians(12.0) * wave,
            )
            rotations[upper] = (-math.radians(10.0) * lift, 0.0, -math.radians(7.0) * wave)
            rotations[knee] = (math.radians(14.0) * lift, 0.0, math.radians(4.0) * wave)
            rotations[lower] = (-math.radians(8.0) * lift, 0.0, 0.0)
        key_pose(
            armature,
            frame,
            {"Bone_000": (0.0, 0.0, 0.022 + 0.016 * math.cos(t * 2.0))},
            rotations,
        )
    return finish_action(armature, action, 1, 25)


def neutral_pose() -> dict[str, tuple[float, float, float]]:
    return {
        "Bone_000": (0.0, 0.0, 0.0),
        "Bone_004": (0.0, 0.0, 0.0),
        "Bone_007": (0.0, 0.0, 0.0),
        "Bone_003": (0.0, 0.0, 0.0),
        "Bone_006": (0.0, 0.0, 0.0),
        "Bone_045": (0.0, 0.0, 0.0),
        "Bone_047": (0.0, 0.0, 0.0),
        "Bone_049": (0.0, 0.0, 0.0),
        "Bone_051": (0.0, 0.0, 0.0),
    }


def build_attack(armature: bpy.types.Object) -> bpy.types.Action:
    action = new_action(armature, "Attack")
    key_pose(armature, 1, {"Bone_000": (0.0, 0.0, 0.0)}, neutral_pose())
    key_pose(
        armature,
        7,
        {"Bone_000": (0.0, 0.025, 0.025)},
        {
            "Bone_000": (math.radians(-3), math.radians(-4), 0.0),
            "Bone_004": (math.radians(-8), 0.0, math.radians(10)),
            "Bone_007": (math.radians(14), 0.0, math.radians(-18)),
            "Bone_003": (math.radians(-6), 0.0, math.radians(5)),
            "Bone_006": (math.radians(10), 0.0, math.radians(-8)),
            "Bone_045": (math.radians(-8), 0.0, 0.0),
            "Bone_049": (math.radians(10), 0.0, 0.0),
        },
    )
    key_pose(
        armature,
        13,
        {"Bone_000": (0.0, -0.085, 0.005)},
        {
            "Bone_000": (math.radians(5), math.radians(5), 0.0),
            "Bone_004": (math.radians(8), 0.0, math.radians(-8)),
            "Bone_007": (math.radians(-18), 0.0, math.radians(24)),
            "Bone_003": (math.radians(8), 0.0, math.radians(-5)),
            "Bone_006": (math.radians(-12), 0.0, math.radians(10)),
            "Bone_045": (math.radians(9), 0.0, 0.0),
            "Bone_047": (-math.radians(7), 0.0, 0.0),
            "Bone_049": (-math.radians(12), 0.0, 0.0),
            "Bone_051": (math.radians(8), 0.0, 0.0),
        },
    )
    key_pose(armature, 25, {"Bone_000": (0.0, 0.0, 0.0)}, neutral_pose())
    return finish_action(armature, action, 1, 25)


def build_hit(armature: bpy.types.Object) -> bpy.types.Action:
    action = new_action(armature, "Hit")
    key_pose(armature, 1, {"Bone_000": (0.0, 0.0, 0.0)}, neutral_pose())
    key_pose(
        armature,
        6,
        {"Bone_000": (0.0, 0.075, 0.035)},
        {
            "Bone_000": (math.radians(-7), math.radians(-5), math.radians(4)),
            "Bone_004": (math.radians(-9), 0.0, math.radians(8)),
            "Bone_007": (math.radians(-9), 0.0, math.radians(-8)),
        },
    )
    key_pose(armature, 17, {"Bone_000": (0.0, 0.0, 0.0)}, neutral_pose())
    return finish_action(armature, action, 1, 17)


def build_death(armature: bpy.types.Object) -> bpy.types.Action:
    action = new_action(armature, "Death")
    animated = neutral_pose()
    for root, upper, knee, lower, _offset in LEG_CHAINS:
        animated[root] = (0.0, 0.0, 0.0)
        animated[upper] = (0.0, 0.0, 0.0)
        animated[knee] = (0.0, 0.0, 0.0)
        animated[lower] = (0.0, 0.0, 0.0)
    key_pose(armature, 1, {"Bone_000": (0.0, 0.0, 0.0)}, animated)
    collapsed = dict(animated)
    collapsed["Bone_000"] = (math.radians(10), math.radians(-8), math.radians(7))
    collapsed["Bone_004"] = (math.radians(18), 0.0, math.radians(18))
    collapsed["Bone_007"] = (math.radians(18), 0.0, math.radians(-18))
    for index, (root, upper, knee, lower, _offset) in enumerate(LEG_CHAINS):
        side = -1 if index % 2 == 0 else 1
        collapsed[root] = (math.radians(18), 0.0, math.radians(18 * side))
        collapsed[upper] = (math.radians(-25), 0.0, math.radians(-10 * side))
        collapsed[knee] = (math.radians(28), 0.0, 0.0)
        collapsed[lower] = (math.radians(-18), 0.0, 0.0)
    key_pose(armature, 31, {"Bone_000": (0.0, 0.06, -0.28)}, collapsed)
    return finish_action(armature, action, 1, 31)


def mesh_world_bounds(mesh: bpy.types.Object) -> tuple[Vector, Vector]:
    coords = [mesh.matrix_world @ vertex.co for vertex in mesh.data.vertices]
    minimum = Vector(tuple(min(coord[i] for coord in coords) for i in range(3)))
    maximum = Vector(tuple(max(coord[i] for coord in coords) for i in range(3)))
    return minimum, maximum


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_preview(mesh: bpy.types.Object) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 800
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Preview_World")
    scene.world.color = (0.012, 0.017, 0.025)
    minimum, maximum = mesh_world_bounds(mesh)
    center = (minimum + maximum) * 0.5
    size = maximum - minimum

    bpy.ops.object.camera_add(
        location=center + Vector((size.x * 1.3, -size.y * 2.4, size.z * 0.9))
    )
    camera = bpy.context.object
    camera.data.lens = 58
    point_at(camera, center)
    scene.camera = camera

    bpy.ops.object.light_add(
        type="AREA", location=center + Vector((-size.x, -size.y * 1.8, size.z * 2.2))
    )
    key = bpy.context.object
    key.data.energy = 1100
    key.data.size = max(size) * 2.0
    point_at(key, center)
    bpy.ops.object.light_add(
        type="AREA", location=center + Vector((size.x * 1.4, size.y, size.z * 1.2))
    )
    fill = bpy.context.object
    fill.data.energy = 700
    fill.data.color = (0.3, 0.5, 1.0)
    fill.data.size = max(size) * 1.5
    point_at(fill, center)


def render_action_sample(
    output_dir: Path,
    armature: bpy.types.Object,
    action: bpy.types.Action,
    frame: int,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for track in armature.animation_data.nla_tracks:
        track.mute = True
    armature.animation_data.action = action
    bpy.context.scene.frame_set(frame)
    bpy.context.scene.render.filepath = str(output_dir / f"{action.name.lower()}_{frame:03d}.png")
    bpy.ops.render.render(write_still=True)
    armature.animation_data.action = None
    for track in armature.animation_data.nla_tracks:
        track.mute = False


def export_glb(output: Path, armature: bpy.types.Object, mesh: bpy.types.Object) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
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
        export_morph=False,
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
    source = require_file(args.source)
    texture_dir = args.texture_dir.expanduser().resolve()
    output = args.output.expanduser().resolve()
    preview_dir = args.preview_dir.expanduser().resolve()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    if bpy.ops.import_scene.fbx(filepath=str(source), use_anim=True) != {"FINISHED"}:
        raise RuntimeError("FBX import failed")
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(armatures) != 1 or len(meshes) != 1:
        raise RuntimeError(f"Expected one armature/mesh, found {len(armatures)}/{len(meshes)}")
    armature, mesh = armatures[0], meshes[0]
    armature.name = "Emberclaw_Rig"
    mesh.name = "Emberclaw_Body"
    mesh.data.name = "Emberclaw_Body_Mesh"

    expected = {f"Bone_{index:03d}" for index in range(60)}
    actual = {bone.name for bone in armature.data.bones}
    if actual != expected:
        raise RuntimeError(
            f"Unexpected rig: missing={sorted(expected-actual)}, extra={sorted(actual-expected)}"
        )
    if armature.animation_data is not None:
        armature.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    armature.animation_data_create()

    material = build_material(texture_dir)
    mesh.data.materials.clear()
    mesh.data.materials.append(material)
    polygons_before, polygons_after = optimize_mesh(mesh, args.decimate_ratio)

    actions = [
        build_idle(armature),
        build_locomotion(armature),
        build_attack(armature),
        build_hit(armature),
        build_death(armature),
    ]
    if not args.no_preview:
        setup_preview(mesh)
        for action, frame in zip(actions, (25, 7, 13, 6, 31), strict=True):
            render_action_sample(preview_dir, armature, action, frame)
    export_glb(output, armature, mesh)
    print(
        "EMBERCLAW_EXPORTED",
        {
            "output": str(output),
            "bytes": output.stat().st_size,
            "bones": len(actual),
            "vertices": len(mesh.data.vertices),
            "polygons_before": polygons_before,
            "polygons_after": polygons_after,
            "clips": [(action.name, tuple(action.frame_range)) for action in actions],
        },
    )


main()
