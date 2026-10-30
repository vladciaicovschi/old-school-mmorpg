"""Adapt the accepted wolf motions to the owner's posed 47-joint wolf_v2.

Normalize the curved source stance, bake that pose into mesh and bind matrices,
then reuse WolfAuthor's timing and body gestures with anatomical bone mapping.
The source file stays untouched. Hind paws keep their extra native joint.
"""
from __future__ import annotations

import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import export_glb
from blender_bake_smart_wolf import WolfAuthor, smooth

SOURCE = ROOT.parent / "bible/models/mobs/animals/wolf_v2.glb"
OUTPUT = ROOT / "tmp/asset_src/animals/smart_wolf_v2/smart_wolf_v2.glb"
HEIGHT = 2.05
# Negative X is the animal's left. The source numbers its hind legs in the
# opposite order to the forelegs. The final hind segment is retained separately.
LEGS = {"hind_left": ("Bone_024", "Bone_023", "Bone_022", "Bone_020"),
        "hind_right": ("Bone_018", "Bone_017", "Bone_016", "Bone_014"),
        "front_left": ("Bone_031", "Bone_030", "Bone_029", "Bone_028"),
        "front_right": ("Bone_036", "Bone_035", "Bone_034", "Bone_033")}
FETLOCKS = {"hind_left": "Bone_021", "hind_right": "Bone_015"}
BONE_MAP = {"Bone_020": "Bone_011", "Bone_018": "Bone_009",
            "Bone_024": "Bone_026", "Bone_023": "Bone_025",
            "Bone_038": "Bone_042", "Bone_040": "Bone_044", "Bone_042": "Bone_046",
            "Bone_016": "Bone_008", "Bone_015": "Bone_007", "Bone_014": "Bone_006",
            "Bone_030": "Bone_031", "Bone_036": "Bone_036"}
GAITS = {"walk": {"duration": 1.12, "stride": .64, "stance": .67, "lift": .16},
         "trot": {"duration": .64, "stride": .60, "stance": .54, "lift": .18},
         "run": {"duration": .52, "stride": .76, "stance": .46, "lift": .22}}


class WolfV2Author(WolfAuthor):
    gaits = GAITS
    attack_expression = 1.15
    attack_hind_stride = .16

    def __init__(self, rig, mesh):
        super().__init__(rig, mesh, LEGS, BONE_MAP)
        self.segments = {leg: (self.rest[hock].translation-self.rest[mid].translation,
                              self.rest[mid].translation-self.feet[leg])
                         for leg, mid in FETLOCKS.items()
                         for _, _, hock, _ in [LEGS[leg]]}
        self.min_fold = math.inf

    def native_rotate(self, name, axis, angle):
        bone = self.bones[name]
        origin = bone.head.copy()
        bone.matrix = Matrix.Translation(origin) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-origin) @ bone.matrix
        self.update()

    def body(self, lift=0, forward=0, side=0):
        # V2 has shorter upper forelegs than the donor. Reserve extension for
        # the bite and paw recovery instead of locking the elbows at full reach.
        super().body(lift=lift-.12, forward=forward*.80, side=side)

    def paw(self, leg, target, pitch=0):
        upper, knee, hock, foot = self.legs[leg]
        offset = Matrix.Rotation(pitch*.5, 3, "X") @ self.hocks[leg]
        destination = target+offset
        start = self.bones[upper].head.copy()
        a = (self.bones[knee].head-start).length
        b = (self.bones[hock].head-self.bones[knee].head).length
        delta = destination-start
        direction = delta.normalized()
        distance = min(a+b-.003, max(abs(a-b)+.003, delta.length))
        self.max_reach_error = max(self.max_reach_error, abs(distance-delta.length))
        self.min_fold = min(self.min_fold, distance-abs(a-b))
        along = (a*a-b*b+distance*distance)/(2*distance)
        pole = Vector(((-1 if "left" in leg else 1)*.08, 1 if "front" in leg else -1, 0))
        pole -= direction*pole.dot(direction)
        bend = start+direction*along+pole.normalized()*math.sqrt(max(0, a*a-along*along))
        self.aim(upper, knee, bend)
        self.aim(knee, hock, start+direction*distance)
        if leg in FETLOCKS:
            mid = FETLOCKS[leg]
            # Preserve both distal lengths and their rest bend. A single aim
            # through this two-link chain would straighten the canine hock.
            proximal, distal = self.segments[leg]
            destination_mid = target+Matrix.Rotation(pitch*.5, 3, "X") @ distal
            self.aim(hock, mid, destination_mid)
            self.aim(mid, foot, target)
        else:
            self.aim(hock, foot, target)
        matrix = self.rest[foot].copy()
        matrix.translation = self.bones[foot].head.copy()
        self.bones[foot].matrix = matrix
        self.update()
        self.native_rotate(foot, "X", pitch)

    def face(self, pitch=0, yaw=0, jaw=0, ears=0):
        self.native_rotate("Bone_026", "X", pitch)
        self.native_rotate("Bone_025", "Z", yaw)
        # The supplied jaw is already open. Keep a small resting aperture and
        # add only a modest opening, avoiding the old closed-mouth rig's 40 deg.
        self.native_rotate("Bone_042", "X", .42*jaw)
        self.native_rotate("Bone_044", "Y", ears)
        self.native_rotate("Bone_046", "Y", -ears)

    def gait(self, phase, name):
        super().gait(phase, name)
        # The new tail is longer and lower than the donor's. Clear the floor
        # during the gallop compression without lifting the planted paws.
        self.native_rotate("Bone_008", "X", .16 if name == "run" else .045)

    def death(self, phase):
        drop = smooth(phase/.75)
        self.body(lift=-.52*drop, side=.12*drop)
        self.native_rotate("Bone_000", "Y", 1.48*smooth((phase-.08)/.67))
        self.face(pitch=.12*drop, jaw=.13*drop)
        for leg, (_, knee, hock, _) in self.legs.items():
            self.native_rotate(knee, "X", (.25 if "front" in leg else -.18)*drop)
            self.native_rotate(hock, "X", -.12*drop)
        release = smooth((phase-.22)/.63)
        for leg in ("front_left", "hind_left"):
            upper, knee, hock, foot = self.legs[leg]
            for bone, angle in ((upper, -.55), (knee, -.28), (hock, -.08)):
                self.native_rotate(bone, "Y", angle*release)
            self.native_rotate(foot, "Y", .12*smooth((phase-.4)/.45))
        # V2's extra hind fetlock leaves the lower rear paw above the flank if
        # only the upper limbs relax. Let that leg release toward the floor too.
        self.native_rotate("Bone_018", "Y", -.20*release)
        self.native_rotate("Bone_017", "Y", -.10*release)
        # Ground the flank first so the tail settles against the final floor,
        # rather than being lifted again with the corpse after its release.
        evaluated = self.mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        floor = min((evaluated.matrix_world @ Vector(c)).z for c in evaluated.bound_box)
        if floor < 0:
            super().body(lift=-floor+.002)
        # Gravity releases the complete tail after the flank roll. Aim each
        # native segment down until it reaches the floor, then lay it along
        # the ground. Segment lengths and the original skin remain intact.
        tail = ("Bone_008", "Bone_007", "Bone_006", "Bone_005", "Bone_004")
        for parent, child in zip(tail, tail[1:]):
            origin = self.bones[parent].head.copy()
            vector = self.bones[child].head-origin
            length = vector.length
            # The distal fur extends about .18 below its centreline. Keep
            # that thickness clear so grounding the tail cannot lift the legs.
            down = max(-.96*length, min(0, .18-origin.z))
            horizontal = Vector((vector.x, vector.y, 0)).normalized()
            settled = horizontal*math.sqrt(max(0, length*length-down*down))
            settled.z = down
            direction = vector.lerp(settled, release).normalized()
            self.aim(parent, child, origin+direction*length)
        evaluated = self.mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        floor = min((evaluated.matrix_world @ Vector(c)).z for c in evaluated.bound_box)
        if floor < 0:
            super().body(lift=-floor+.002)


def normalize_stance(rig, mesh):
    """Pose the native chain without scaling, then make it the new bind pose."""
    author = WolfV2Author(rig, mesh)
    # Remove the source's overall diagonal and straighten the axial chain in
    # its sagittal plane. Segment lengths and each native joint are preserved.
    axis = author.bones["Bone_026"].head-author.bones["Bone_002"].head
    heading = math.atan2(axis.x, -axis.y)
    author.native_rotate("Bone_000", "Z", -heading)
    for parent, child in (("Bone_012", "Bone_011"), ("Bone_011", "Bone_010"),
                          ("Bone_010", "Bone_009"), ("Bone_009", "Bone_026")):
        origin = author.bones[parent].head.copy()
        vector = author.bones[child].head-origin
        direction = Vector((0, vector.y, vector.z)).normalized()
        author.aim(parent, child, origin+direction*vector.length)
    ears = (author.bones["Bone_044"].head+author.bones["Bone_046"].head)*.5
    eyes = (author.bones["Bone_038"].head+author.bones["Bone_040"].head)*.5
    face = eyes-ears
    author.native_rotate("Bone_025", "Z", -math.atan2(face.x, -face.y))
    # Use matched supports, with feet below their own shoulder/hip pair. Keep
    # the source's digitigrade distal posture rather than forcing straight legs.
    for prefix, width in (("front", .27), ("hind", .22)):
        pair = [f"{prefix}_{side}" for side in ("left", "right")]
        center = sum((author.bones[LEGS[leg][0]].head for leg in pair), Vector())*.5
        anchors = [author.bones[LEGS[leg][3]].head.copy() for leg in pair]
        y = sum(p.y for p in anchors)*.5
        for leg in pair:
            target = Vector((center.x+(-width if "left" in leg else width), y, .04))
            author.paw(leg, target)
    # Evaluate once before rebinding. Applying only the armature modifier keeps
    # vertex order, UVs, materials and native skin groups intact.
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    modifier = next(m for m in mesh.modifiers if m.type == "ARMATURE")
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    mesh.select_set(False)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    modifier = mesh.modifiers.new("Normalized native skin", "ARMATURE")
    modifier.object = rig
    bpy.context.view_layer.update()
    # Center the normalized skeleton and geometry together, then ground the mesh.
    center_x = rig.pose.bones["Bone_009"].head.x
    floor = min(v.co.z for v in mesh.data.vertices)
    shift = Vector((-center_x, 0, -floor))
    for vertex in mesh.data.vertices:
        vertex.co += shift
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in rig.data.edit_bones:
        bone.head += shift
        bone.tail += shift
    bpy.ops.object.mode_set(mode="OBJECT")
    return {"heading_radians": heading, "floor_shift": -floor,
            "normalization_reach_clamp": author.max_reach_error}


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fixed = ROOT / "tmp/wolf-v2/skin-fixed.glb"
    fixed.parent.mkdir(parents=True, exist_ok=True)
    repair = subprocess.run(["node", str(Path(__file__).with_name("repair_smart_wolf_muzzle.mjs")),
                    str(SOURCE), "--v2", "--out", str(fixed)], check=True, cwd=ROOT,
                    capture_output=True, text=True)
    repair_report = json.loads(repair.stdout.strip().splitlines()[-1])
    print(repair.stdout, flush=True)
    bpy.ops.import_scene.gltf(filepath=str(fixed))
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)]
    if len(meshes) != 1 or len(rig.data.bones) != 47:
        raise RuntimeError("Unexpected wolf_v2 topology")
    mesh = meshes[0]
    normalization = normalize_stance(rig, mesh)
    rig.animation_data_create()
    bpy.context.scene.render.fps = 60
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    mesh["source_sha256"] = digest
    mesh["source"] = "Owner wolf_v2; normalized native stance; adapted accepted wolf motions"
    mesh["wolf_v2_stance_revision"] = 1
    mesh["wolf_v2_muzzle_skin_revision"] = 2
    mesh["wolf_v2_teeth_revision"] = 1
    mesh["wolf_v2_teeth_added_triangles"] = repair_report["teeth"]["addedTriangles"]
    export_glb(ROOT / "tmp/wolf-v2/normalized.glb", rig, meshes)
    author = WolfV2Author(rig, mesh)
    author.bake("Wolf_Idle", 2.8, author.idle, True)
    author.bake("Wolf_CombatIdle", 2, lambda p: author.idle(p, True), True)
    for name, cfg in GAITS.items():
        author.bake(f"Wolf_{name.title()}", cfg["duration"], lambda p, n=name: author.gait(p, n), True)
    author.bake("Wolf_BiteLeft", 1.12, lambda p: author.bite(p, -1))
    author.bake("Wolf_BiteRight", 1.12, lambda p: author.bite(p, 1))
    author.bake("Wolf_Lunge", 1.30, lambda p: author.bite(p, 0, True))
    author.bake("Wolf_Hit", .42, author.hit)
    author.bake("Wolf_Death", 1.35, author.death)
    author.bake("Wolf_Howl", 2.2, author.howl)
    author.bake("Wolf_AlertLook", 1.8, author.alert)
    if author.max_reach_error > .001 or author.min_fold < .05:
        raise RuntimeError("Wolf V2 motion exceeds its native limb reserve")
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    author.reset()
    export_glb(OUTPUT, rig, meshes)
    author.idle(0)
    evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    coordinates = [(evaluated.matrix_world @ v.co).z for v in evaluated.data.vertices]
    idle_height = max(coordinates)-min(coordinates)
    durations = {name: round(cfg["duration"]*60)/60 for name, cfg in GAITS.items()}
    report = {"source_sha256": digest, "bones": 47, "normalization": normalization,
              "gaits": GAITS, "muzzle_repair": repair_report,
              "max_ik_reach_clamp": author.max_reach_error,
              "min_fold_margin": author.min_fold, "idle_height": idle_height,
              "baked_durations": durations,
              "walkRef": GAITS["walk"]["stride"]/(durations["walk"]*GAITS["walk"]["stance"])*HEIGHT/idle_height,
              "runRef": GAITS["run"]["stride"]/(durations["run"]*GAITS["run"]["stance"])*HEIGHT/idle_height}
    OUTPUT.with_suffix(".json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf8")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
