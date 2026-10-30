"""Build developer-island humanoid mobs from their Mixamo archives.

Blender 5.2 example:
  blender -b --python scripts/assets/export_meshy_test_minions.py -- \
    --bible-root D:/THE_GAME/bible/models

The Mixamo archives supply skinning and animation. Materials are rebuilt from the
source PBR maps preserved beside the clean Mixamo upload files.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

import bpy
from mathutils import Vector


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
class MinionBuild:
    asset_id: str
    archive: Path
    texture_dir: Path
    clip_prefix: str
    base_fbx: str
    animation_files: tuple[str, ...]
    idle_filename: str
    source_label: str
    repair_legs: bool = False
    supplemental_archives: tuple[Path, ...] = ()


ANIMATION_FILES = (
    "sword and shield run.fbx",
    "sword and shield strafe.fbx",
    "sword and shield strafe (2).fbx",
    "sword and shield run (2).fbx",
    "sword and shield block.fbx",
    "sword and shield block idle.fbx",
    "sword and shield block (2).fbx",
    "sword and shield attack.fbx",
    "sword and shield attack (2).fbx",
    "sword and shield attack (3).fbx",
    "sword and shield attack (4).fbx",
    "sword and shield death.fbx",
    "sword and shield turn.fbx",
    "sword and shield turn (2).fbx",
    "sword and shield idle.fbx",
    "draw sword 1.fbx",
    "sheath sword 1.fbx",
)

MELEE_DEATH_FILE = "Standing React Death Backward.fbx"

MELEE_ANIMATION_FILES = (
    "standing block idle.fbx",
    "standing idle.fbx",
    "standing idle looking ver. 1.fbx",
    "standing melee attack backhand.fbx",
    "standing melee attack downward.fbx",
    "standing melee attack horizontal.fbx",
    "standing melee attack 360 high.fbx",
    "standing melee attack 360 low.fbx",
    "standing melee combo attack ver. 1.fbx",
    "standing melee combo attack ver. 2.fbx",
    "standing melee combo attack ver. 3.fbx",
    "standing react large from left.fbx",
    "standing react large from right.fbx",
    "standing react large gut.fbx",
    MELEE_DEATH_FILE,
    "standing run forward.fbx",
    "standing taunt battlecry.fbx",
    "standing turn left 90.fbx",
    "standing turn right 90.fbx",
    "standing walk forward.fbx",
    "standing jump.fbx",
)

CULTIST_ANIMATION_FILES = (
    "standing idle.fbx",
    "Standing 1H Magic Attack 01.fbx",
    "Standing 2H Magic Area Attack 02.fbx",
    "standing idle 02.fbx",
    "Standing Jump.fbx",
    "Standing React Death Backward.fbx",
    "Standing React Large From Front.fbx",
    "Standing React Small From Front.fbx",
    "Standing Run Back.fbx",
    "Standing Run Forward.fbx",
    "Standing Turn Left 90.fbx",
    "Standing Turn Right 90.fbx",
    "Standing Walk Back.fbx",
    "Standing Walk Forward.fbx",
)

GOLEM_ANIMATION_FILES = (
    "mutant walking.fbx",
    "mutant swiping.fbx",
    "mutant run.fbx",
    "mutant dying.fbx",
    "mutant idle.fbx",
    "mutant breathing idle.fbx",
    "mutant right turn 45.fbx",
    "mutant left turn 45.fbx",
    "mutant flexing muscles.fbx",
    "jump attack.fbx",
    "mutant jump attack.fbx",
    "mutant punch.fbx",
    "mutant roaring.fbx",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bible-root", type=Path, required=True)
    parser.add_argument("--only", action="append", help="Build only this asset id")
    parser.add_argument("--skip-preview", action="store_true", help="Skip the optional Blender still")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])


def clip_name(prefix: str, filename: str) -> str:
    stem = Path(filename).stem
    stem = stem.replace("sword and shield ", "")
    stem = re.sub(r"\s*\((\d+)\)$", r"_\1", stem)
    stem = re.sub(r"[^a-zA-Z0-9]+", "_", stem).strip("_")
    return f"{prefix}_{'_'.join(part.title() for part in stem.split('_'))}"


def build_material(asset_id: str, texture_dir: Path) -> bpy.types.Material:
    paths = {kind: texture_dir / f"{kind}.png" for kind in ("base", "normal", "metallic", "roughness")}
    missing = [path for path in paths.values() if not path.is_file()]
    if missing:
        raise RuntimeError(f"{asset_id}: missing source PBR maps: {missing}")

    material = bpy.data.materials.new(f"meshy_{asset_id}_pbr")
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
        texture.image = bpy.data.images.load(str(paths[kind]), check_existing=False)
        if kind != "base":
            texture.image.colorspace_settings.name = "Non-Color"
        links.new(texture.outputs["Color"], shader.inputs[socket])

    texture = nodes.new("ShaderNodeTexImage")
    texture.name = "Normal"
    texture.image = bpy.data.images.load(str(paths["normal"]), check_existing=False)
    texture.image.colorspace_settings.name = "Non-Color"
    normal = nodes.new("ShaderNodeNormalMap")
    links.new(texture.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    return material


def select_idle(rig: bpy.types.Object, action_name: str) -> None:
    if rig.animation_data is None:
        raise RuntimeError("Rig has no animation data after clip bake")
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    action = bpy.data.actions[action_name]
    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(0)


def repair_skeleton_warrior_legs(rig: bpy.types.Object, mesh: bpy.types.Object) -> None:
    """Repair the collapsed Mixamo leg markers in the supplied warrior FBX.

    The upload placed each knee at mid-thigh, then ankle, foot and toe within
    roughly one centimetre of that point. Mixamo consequently assigned the
    whole shin and foot to ToeBase. Restore humanoid joint positions from the
    visible mesh and redistribute only the affected leg-chain weights.
    """
    joints = {
        "Left": (
            Vector((0.154, -0.018, 0.465)),
            Vector((0.186, 0.018, 0.100)),
            Vector((0.202, -0.105, 0.010)),
            Vector((0.220, -0.180, 0.008)),
        ),
        "Right": (
            Vector((-0.154, -0.018, 0.465)),
            Vector((-0.186, 0.018, 0.100)),
            Vector((-0.202, -0.105, 0.010)),
            Vector((-0.220, -0.180, 0.008)),
        ),
    }
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for side, (knee, ankle, toe, toe_tip) in joints.items():
        upper = rig.data.edit_bones[f"mixamorig:{side}UpLeg"]
        lower = rig.data.edit_bones[f"mixamorig:{side}Leg"]
        foot = rig.data.edit_bones[f"mixamorig:{side}Foot"]
        toe_bone = rig.data.edit_bones[f"mixamorig:{side}ToeBase"]
        upper.tail = knee
        lower.head = knee
        lower.tail = ankle
        foot.head = ankle
        foot.tail = toe
        toe_bone.head = toe
        toe_bone.tail = toe_tip
    bpy.ops.object.mode_set(mode="OBJECT")

    for side in ("Left", "Right"):
        names = [
            f"mixamorig:{side}UpLeg",
            f"mixamorig:{side}Leg",
            f"mixamorig:{side}Foot",
            f"mixamorig:{side}ToeBase",
        ]
        groups = [mesh.vertex_groups[name] for name in names]
        indices = {group.index for group in groups}
        for vertex in mesh.data.vertices:
            total = sum(entry.weight for entry in vertex.groups if entry.group in indices)
            if total <= 1e-6:
                continue
            z = vertex.co.z
            y = vertex.co.y
            if z >= 0.50:
                weights = (1.0, 0.0, 0.0, 0.0)
            elif z >= 0.42:
                lower = (0.50 - z) / 0.08
                weights = (1.0 - lower, lower, 0.0, 0.0)
            elif z >= 0.15:
                weights = (0.0, 1.0, 0.0, 0.0)
            elif z >= 0.08:
                foot = (0.15 - z) / 0.07
                weights = (0.0, 1.0 - foot, foot, 0.0)
            else:
                toe = max(0.0, min(1.0, (-y - 0.035) / 0.10))
                weights = (0.0, 0.0, 1.0 - toe, toe)
            for group, weight in zip(groups, weights):
                if weight > 1e-6:
                    group.add([vertex.index], total * weight, "REPLACE")
                else:
                    group.remove([vertex.index])

    rig["mixamo_leg_repair"] = (
        "Collapsed knee/ankle/toe joints restored and lower-leg weights redistributed"
    )


def build_one(config: MinionBuild, *, render_idle_preview: bool = True) -> dict[str, object]:
    for path in (config.archive, config.texture_dir):
        if not path.exists():
            raise RuntimeError(f"Missing source: {path}")

    with tempfile.TemporaryDirectory(prefix=f"woc_{config.asset_id}_rig_") as temporary:
        source_dir = Path(temporary)
        with zipfile.ZipFile(config.archive) as package:
            package.extractall(source_dir)
        for archive in config.supplemental_archives:
            with zipfile.ZipFile(archive) as package:
                for filename in config.animation_files:
                    destination = source_dir / filename
                    if not destination.is_file() and filename in package.namelist():
                        destination.write_bytes(package.read(filename))

        base_fbx = source_dir / config.base_fbx
        required = [base_fbx, *(source_dir / filename for filename in config.animation_files)]
        missing = [path.name for path in required if not path.is_file()]
        if missing:
            raise RuntimeError(f"{config.archive.name}: missing files: {missing}")

        rig, mesh = import_base(base_fbx)
        rig.name = f"{config.asset_id}_Rig"
        mesh.name = f"{config.asset_id}_Body"
        mesh.data.name = mesh.name
        if config.repair_legs:
            repair_skeleton_warrior_legs(rig, mesh)
        anchor_x, anchor_z = clear_animation(rig)
        bpy.context.scene.render.fps = 30

        clips: list[dict[str, object]] = []
        for filename in config.animation_files:
            name = clip_name(config.clip_prefix, filename)
            frames = add_clip(
                rig,
                source_dir / filename,
                name,
                anchor_x,
                anchor_z,
                allow_missing_bones=filename == MELEE_DEATH_FILE,
            )
            clips.append({"name": name, "frames": frames})
            print(f"CLIP {config.asset_id} {name}", flush=True)

        mesh.data.materials.clear()
        mesh.data.materials.append(build_material(config.asset_id, config.texture_dir))
        rig["source"] = config.source_label

        output_dir = ROOT / "tmp/asset_src/npcs" / config.asset_id
        output_dir.mkdir(parents=True, exist_ok=True)
        output_glb = output_dir / f"{config.asset_id}.glb"
        export_glb(output_glb, rig, [mesh])

        idle_name = clip_name(config.clip_prefix, config.idle_filename)
        preview = output_dir / f"{config.asset_id}_idle.png"
        if render_idle_preview:
            select_idle(rig, idle_name)
            render_preview(preview, [mesh])
            bpy.context.view_layer.update()
            bpy.ops.render.render(write_still=True)

        report = {
            "id": config.asset_id,
            "output": str(output_glb.relative_to(ROOT)),
            "preview": str(preview.relative_to(ROOT)) if render_idle_preview else None,
            "bones": len(rig.data.bones),
            "vertices": len(mesh.data.vertices),
            "triangles": len(mesh.data.polygons),
            "materials": len(mesh.data.materials),
            "clips": clips,
            "sourceMaps": ["base", "normal", "metallic", "roughness"],
        }
        (output_dir / f"{config.asset_id}.json").write_text(
            json.dumps(report, indent=2), encoding="utf-8"
        )
        return report


def main() -> None:
    args = parse_args()
    bible_root = args.bible_root.resolve()
    builds = (
        MinionBuild(
            asset_id="dev_rogue_minion",
            archive=bible_root / "rougs/mixamo_rigged/minion.zip",
            texture_dir=bible_root / "rougs/mixamo_ready_fixed/minion/source_pbr",
            clip_prefix="RogueMinion",
            base_fbx="minion_mixamo.fbx",
            animation_files=MELEE_ANIMATION_FILES,
            idle_filename="standing idle.fbx",
            source_label="User-provided Meshy rogue minion; Mixamo rig and melee animation pack",
            supplemental_archives=(bible_root / "skeletons/mixamo_rigged/cultist.zip",),
        ),
        MinionBuild(
            asset_id="dev_skeleton_minion",
            archive=bible_root / "skeletons/mixamo_rigged/minion.zip",
            texture_dir=bible_root / "skeletons/mixamo_ready_fixed/minion/source_pbr",
            clip_prefix="SkeletonMinion",
            base_fbx="minion_mixamo.fbx",
            animation_files=ANIMATION_FILES,
            idle_filename="sword and shield idle.fbx",
            source_label="User-provided Meshy model; Mixamo rig and Sword and Shield Pack",
        ),
        MinionBuild(
            asset_id="dev_rogue_assassin",
            archive=bible_root / "rougs/mixamo_rigged/assasin.zip",
            texture_dir=bible_root / "rougs/mixamo_ready_fixed/assasin/source_pbr",
            clip_prefix="RogueAssassin",
            base_fbx="assasin_mixamo.fbx",
            animation_files=ANIMATION_FILES,
            idle_filename="sword and shield idle.fbx",
            source_label="User-provided Meshy assassin; Mixamo rig and Sword and Shield Pack",
        ),
        MinionBuild(
            asset_id="dev_skeleton_warrior",
            archive=bible_root / "skeletons/mixamo_rigged/warior.zip",
            texture_dir=bible_root / "skeletons/mixamo_ready_problem_fixed/warior/source_pbr",
            clip_prefix="SkeletonWarrior",
            base_fbx="warior_mixamo_problem_fixed.fbx",
            animation_files=ANIMATION_FILES,
            idle_filename="sword and shield idle.fbx",
            source_label="User-provided Meshy skeleton warrior; corrected Mixamo rig and Sword and Shield Pack",
        ),
        MinionBuild(
            asset_id="dev_skeleton_cultist",
            archive=bible_root / "skeletons/mixamo_rigged/cultist.zip",
            texture_dir=bible_root / "skeletons/mixamo_ready_fixed/cultist/source_pbr",
            clip_prefix="Cultist",
            base_fbx="cultist_mixamo.fbx",
            animation_files=CULTIST_ANIMATION_FILES,
            idle_filename="standing idle.fbx",
            source_label="User-provided Meshy cultist; Mixamo rig and magic animation pack",
        ),
        MinionBuild(
            asset_id="dev_kobold",
            archive=bible_root / "mobs/mixamo_rigged/cobold.zip",
            texture_dir=bible_root / "mobs/mixamo_ready_fixed/cobold/source_pbr",
            clip_prefix="Kobold",
            base_fbx="cobold_mixamo.fbx",
            animation_files=MELEE_ANIMATION_FILES,
            idle_filename="standing idle.fbx",
            source_label="User-provided Meshy kobold; Mixamo rig and melee animation pack",
            supplemental_archives=(bible_root / "skeletons/mixamo_rigged/cultist.zip",),
        ),
        MinionBuild(
            asset_id="dev_troll",
            archive=bible_root / "mobs/mixamo_rigged/troll.zip",
            texture_dir=bible_root / "mobs/mixamo_ready_fixed/troll/source_pbr",
            clip_prefix="Troll",
            base_fbx="troll_mixamo.fbx",
            animation_files=MELEE_ANIMATION_FILES,
            idle_filename="standing idle.fbx",
            source_label="User-provided Meshy troll; Mixamo rig and melee animation pack",
            supplemental_archives=(bible_root / "skeletons/mixamo_rigged/cultist.zip",),
        ),
        MinionBuild(
            asset_id="dev_bone_golem",
            archive=bible_root / "skeletons/mixamo_rigged/golem.zip",
            texture_dir=bible_root / "skeletons/mixamo_ready_fixed/golem/source_pbr",
            clip_prefix="BoneGolem",
            base_fbx="golem_mixamo.fbx",
            animation_files=GOLEM_ANIMATION_FILES,
            idle_filename="mutant idle.fbx",
            source_label="User-provided Meshy bone golem; Mixamo rig and mutant animation pack",
        ),
    )
    selected = [build for build in builds if not args.only or build.asset_id in args.only]
    unknown = sorted(set(args.only or ()) - {build.asset_id for build in builds})
    if unknown:
        raise RuntimeError(f"Unknown --only asset id: {', '.join(unknown)}")
    print(
        json.dumps(
            [build_one(build, render_idle_preview=not args.skip_preview) for build in selected],
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
