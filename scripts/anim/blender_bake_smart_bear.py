"""Author quadruped motion on the owner's original Meshy Smart Rig bear.

No downloaded motion, rerig, weight transfer or mesh simplification is used.
All four paw paths are solved offline against the actual target limb lengths.
Run Blender --background --python-exit-code 1 --python this_file.py.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import action_fcurves, export_glb
from animal_motion_curves import swing, timing

SOURCE = ROOT.parent / "bible/models/mobs/animals/bear.glb"
OUTPUT = ROOT / "tmp/asset_src/animals/smart_bear/smart_bear.glb"
FPS = 60
TAU = 2 * math.pi

# Mapping verified from joint positions and weighted mesh, not anonymous names.
# Blender forward is -Y, up is +Z; the glTF/game forward is +Z, up is +Y.
LEGS = {
    "hind_left": ("Bone_007", "Bone_006", "Bone_005"),
    "hind_right": ("Bone_013", "Bone_012", "Bone_011"),
    "front_left": ("Bone_027", "Bone_026", "Bone_025"),
    "front_right": ("Bone_033", "Bone_032", "Bone_031"),
}
WALK = {"duration": 1.2, "stride": 0.52, "stance": 0.68, "lift": 0.20}
RUN = {"duration": 0.4, "stride": 0.90, "stance": 0.48, "lift": 0.24}


def smooth(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


class BearAuthor:
    def __init__(self, rig, mesh):
        self.rig = rig
        self.mesh = mesh
        self.bones = rig.pose.bones
        self.rest = {bone.name: bone.matrix.copy() for bone in self.bones}
        self.feet = {leg: self.rest[names[2]].translation.copy() for leg, names in LEGS.items()}
        self.max_reach_error = 0.0

    def update(self):
        bpy.context.view_layer.update()

    def reset(self):
        for bone in self.bones:
            bone.matrix_basis = Matrix.Identity(4)
        self.update()

    def rotate(self, name, axis, radians):
        bone = self.bones[name]
        pivot = bone.head.copy()
        bone.matrix = Matrix.Translation(pivot) @ Matrix.Rotation(radians, 4, axis) @ Matrix.Translation(-pivot) @ bone.matrix
        self.update()

    def body(self, lift=0.0, forward=0.0, side=0.0):
        bone = self.bones["Bone_000"]
        matrix = bone.matrix.copy()
        matrix.translation += Vector((side, -forward, lift))
        bone.matrix = matrix
        self.update()

    def aim(self, name, child, destination):
        bone = self.bones[name]
        origin = bone.head.copy()
        current = self.bones[child].head - origin
        desired = destination - origin
        rotation = current.rotation_difference(desired).to_matrix().to_4x4()
        bone.matrix = Matrix.Translation(origin) @ rotation @ Matrix.Translation(-origin) @ bone.matrix
        self.update()

    def paw(self, leg, target, roll=0.0, splay=0.12):
        upper, lower, foot = LEGS[leg]
        shoulder = self.bones[upper].head.copy()
        elbow = self.bones[lower].head.copy()
        wrist = self.bones[foot].head.copy()
        a, b = (elbow - shoulder).length, (wrist - elbow).length
        delta = target - shoulder
        direction = delta.normalized()
        distance = min(a + b - 0.003, max(abs(a - b) + 0.003, delta.length))
        self.max_reach_error = max(self.max_reach_error, abs(delta.length - distance))
        along = (a * a - b * b + distance * distance) / (2 * distance)
        # Keep each limb's anatomical bend rather than imposing a human knee.
        side = -1 if "left" in leg else 1
        # A downward rest-knee vector can flip its projection when a stretched
        # foot crosses it. Fixed anatomical bend planes avoid that singularity.
        pole = Vector((side * splay, 1 if "front" in leg else -1, 0))
        pole -= direction * pole.dot(direction)
        if pole.length < 0.001:
            pole = Vector((0, 1, 0))
            pole -= direction * pole.dot(direction)
        elbow_target = shoulder + direction * along + pole.normalized() * math.sqrt(max(0, a * a - along * along))
        self.aim(upper, lower, elbow_target)
        self.aim(lower, foot, shoulder + direction * distance)
        # Keep the paw level through support. Only the airborne paw pitches.
        matrix = self.rest[foot].copy()
        matrix.translation = self.bones[foot].head.copy()
        self.bones[foot].matrix = matrix
        self.update()
        if roll:
            self.rotate(foot, "X", roll)

    def planted(self, overrides=None):
        overrides = overrides or {}
        for leg, point in self.feet.items():
            self.paw(leg, overrides.get(leg, point))

    def idle(self, phase, ready=False):
        breath = math.sin(TAU * phase)
        self.body(lift=0.006 * breath - (0.015 if ready else 0.0))
        self.rotate("Bone_016", "X", 0.006 * breath)
        self.rotate("Bone_021", "Z", 0.012 * math.sin(TAU * phase))
        self.rotate("Bone_020", "X", -0.025 if ready else 0.009 * breath)
        self.planted()

    def gait(self, phase, config, running=False):
        stride, stance, lift = (config[key] for key in ("stride", "stance", "lift"))
        offsets = {"hind_left": 0, "front_left": 0.25, "hind_right": 0.5, "front_right": 0.75}
        if running:
            # Transverse gallop: hind pair pushes, then the fore pair receives.
            offsets = {"hind_left": 0, "hind_right": 0.08, "front_left": 0.49, "front_right": 0.57}
        sway = math.sin(TAU * phase)
        # A bear rolls its weight over broad planted paws. Counter-motion in
        # the shoulders and head keeps the heavy trunk from reading as a box.
        self.body(lift=(-0.12 + 0.075 * sway) if running else -0.045 + 0.023 * math.cos(2 * TAU * phase),
                  side=(0.025 if running else 0.045) * sway)
        self.rotate("Bone_000", "Y", (0.025 if running else 0.045) * math.sin(TAU*phase-0.20))
        self.rotate("Bone_016", "X", (0.065 if running else 0.025) * math.sin(TAU*phase-0.35))
        self.rotate("Bone_016", "Z", (0.025 if running else 0.045) * math.sin(TAU*phase+0.25))
        self.rotate("Bone_021", "Y", -0.03 * math.sin(TAU*phase-0.55))
        self.rotate("Bone_020", "X", -0.035 * math.sin(TAU*phase-0.90))
        for leg, rest in self.feet.items():
            u = (phase + offsets[leg]) % 1
            target = rest.copy()
            roll = 0
            if u < stance:
                forward = stride * (0.5 - u / stance)
            else:
                v = (u - stance) / (1 - stance)
                forward, arch = swing(v, stride, stance)
                target.z += lift * arch
                roll = (0.20 if running else 0.30) * math.sin(TAU * v) * arch
                # Lift the paw clear around the outside of the broad chest.
                target.x += (-1 if "left" in leg else 1) * 0.045 * arch
            target.y -= forward
            self.paw(leg, target, roll)

    def attack(self, phase, left):
        leg = "front_left" if left else "front_right"
        sign = -1 if left else 1
        # Three cubic arcs: preparation, one uninterrupted rounded rake, and
        # a relaxed return. The stroke bows outside/forward before crossing
        # down, instead of extending straight at the target between pose keys.
        if phase < 0.32:
            points = [(0, 0, 0), (0.12, -0.16, 0.08),
                      (0.42, -0.24, 0.55), (0.32, -0.10, 0.78)]
            u = smooth(phase / 0.32)
        elif phase < 0.62:
            points = [(0.32, -0.10, 0.78), (0.43, 0.36, 0.88),
                      (-0.32, 0.43, 0.57), (-0.46, 0.22, 0.26)]
            u = timing((phase - 0.32) / 0.30, outgoing=0.5)
        else:
            # Match the strike's tangent in physical time across the join.
            points = [(-0.46, 0.22, 0.26), (-0.637333, -0.046, -0.132667),
                      (0.12, -0.10, 0.18), (0, 0, 0)]
            u = timing((phase - 0.62) / 0.38, incoming=0.5)
        a, b, c, d = map(Vector, points)
        delta = (1-u)**3 * a + 3*(1-u)**2*u * b + 3*(1-u)*u*u * c + u**3 * d
        delta.x *= sign
        load = smooth(phase / 0.20) * (1 - smooth((phase - 0.68) / 0.32))
        release = smooth((phase - 0.32) / 0.30)
        settle = 1 - smooth((phase - 0.62) / 0.38)
        twist = sign * (0.18 * load - 0.38 * release * settle)
        self.body(lift=-0.035 * load, forward=(-0.035 * load + 0.065 * release * settle),
                  side=-sign * 0.045 * load)
        self.rotate("Bone_000", "Y", -sign * 0.035 * load)
        self.rotate("Bone_016", "Z", twist)
        self.rotate("Bone_016", "X", -0.035 * load + 0.04 * release * settle)
        self.rotate("Bone_021", "Z", -0.45 * twist)
        self.rotate("Bone_020", "X", -0.07 * load)
        point = self.feet[leg] + Vector((delta.x, -delta.y, delta.z))
        for support, anchor in self.feet.items():
            self.paw(support, point if support == leg else anchor,
                     -0.32 * load + 0.60 * release * settle if support == leg else 0,
                     0.12 + 0.18 * load if support == leg else 0.12)
        # Let the claws turn across the target with the shoulder. A world-fixed
        # forward-facing paw makes even a curved trajectory look like a punch.
        yaw = sign * (0.35 * load - 0.85 * release * settle)
        self.rotate(LEGS[leg][2], "Z", yaw)
        # Present the broad underside through contact, then relax before
        # replanting. Mirror the wrist roll about its turned longitudinal axis.
        contact = smooth((phase - 0.20) / 0.18) * (1 - smooth((phase - 0.58) / 0.26))
        self.rotate(LEGS[leg][2], Vector((-math.sin(yaw), math.cos(yaw), 0)),
                    sign * math.radians(30) * contact)

    def double_attack(self, phase):
        # Rear around the pelvis while both hind paws carry the body. The
        # shoulders rise with the trunk, rather than stretching two forelegs.
        crouch = smooth(phase / 0.12) * (1 - smooth((phase - 0.12) / 0.20))
        rear = smooth((phase - 0.12) / 0.26) * (1 - smooth((phase - 0.44) / 0.24))
        impact = smooth((phase - 0.44) / 0.24) * (1 - smooth((phase - 0.68) / 0.32))
        self.body(lift=-0.065 * crouch - 0.025 * rear - 0.035 * impact,
                  forward=-0.08 * rear + 0.065 * impact)
        self.rotate("Bone_000", "X", -0.58 * rear)
        self.rotate("Bone_016", "X", -0.10 * rear + 0.08 * impact)
        self.rotate("Bone_021", "X", 0.12 * rear - 0.06 * impact)
        self.rotate("Bone_020", "X", -0.04 * rear)
        # Both paws open outside the shoulders and sweep down/inward in one
        # rounded arc. Keep a short loaded pause at the top, then follow the
        # curve with the chest instead of thrusting two straight forelegs.
        if phase < 0.38:
            points = [(0, 0, 0), (0.08, -0.14, 0.35),
                      (0.30, -0.38, 1.15), (0.20, -0.24, 1.32)]
            u = smooth((phase - 0.12) / 0.26)
        elif phase < 0.44:
            points = [(0.20, -0.24, 1.32)] * 4
            u = 0
        elif phase < 0.68:
            points = [(0.20, -0.24, 1.32), (0.42, 0.10, 1.38),
                      (0.24, 0.38, 0.75), (-0.10, 0.24, 0.36)]
            u = timing((phase - 0.44) / 0.24, outgoing=0.5)
        else:
            points = [(-0.10, 0.24, 0.36), (-0.553333, 0.053333, -0.16),
                      (0.05, -0.05, 0.13), (0, 0, 0)]
            u = timing((phase - 0.68) / 0.32, incoming=0.5)
        a, b, c, d = map(Vector, points)
        delta = (1-u)**3 * a + 3*(1-u)**2*u * b + 3*(1-u)*u*u * c + u**3 * d
        contact = smooth((phase - 0.32) / 0.16) * (1 - smooth((phase - 0.68) / 0.20))
        for leg, anchor in self.feet.items():
            if "hind" in leg:
                self.paw(leg, anchor)
            else:
                sign = -1 if "left" in leg else 1
                self.paw(leg, anchor + Vector((sign * delta.x, -delta.y, delta.z)),
                         -0.20 * rear + 0.18 * impact * smooth(delta.z / 0.23),
                         0.12 + 0.10 * rear + 0.06 * contact)
                yaw = sign * (0.25 * rear - 0.35 * impact)
                self.rotate(LEGS[leg][2], "Z", yaw)
                self.rotate(LEGS[leg][2], Vector((-math.sin(yaw), math.cos(yaw), 0)),
                            sign * math.radians(30) * contact)

    def hit(self, phase):
        recoil = math.sin(math.pi * smooth(phase))
        self.body(lift=-0.035 * recoil, forward=-0.065 * recoil)
        self.rotate("Bone_016", "X", 0.055 * recoil)
        self.rotate("Bone_020", "X", -0.08 * recoil)
        self.planted()

    def roar(self, phase):
        lift = math.sin(math.pi * phase) ** 2
        self.body(lift=0.018 * lift)
        self.rotate("Bone_016", "X", -0.035 * lift)
        self.rotate("Bone_021", "X", -0.20 * lift)
        self.rotate("Bone_020", "X", -0.08 * lift)
        self.planted()

    def death(self, phase):
        drop = smooth(phase / 0.75)
        self.body(lift=-0.46 * drop, side=0.10 * drop)
        self.rotate("Bone_000", "Y", 1.48 * smooth((phase - 0.10) / 0.70))
        self.rotate("Bone_021", "X", 0.14 * drop)
        self.rotate("Bone_020", "Z", -0.10 * drop)
        # Collapse on the flank; no paw IK may pull the corpse upright again.
        # The upper limbs soften after the trunk falls, rather than remaining
        # outstretched at standing width above the lower paws.
        release = smooth((phase - 0.25) / 0.60)
        for leg in ("front_left", "hind_left"):
            upper, lower, foot = LEGS[leg]
            self.rotate(upper, "Y", -0.58 * release)
            self.rotate(lower, "Y", -0.28 * release)
            self.rotate(foot, "Y", 0.12 * smooth((phase - 0.40) / 0.45))
        evaluated = self.mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        floor = min((evaluated.matrix_world @ Vector(corner)).z for corner in evaluated.bound_box)
        if floor < 0:
            self.body(lift=-floor + 0.002)

    def bake(self, name, seconds, pose, loop=False):
        action = bpy.data.actions.new(name)
        self.rig.animation_data.action = action
        frames = round(seconds * FPS)
        previous = {}
        for frame in range(frames + 1):
            bpy.context.scene.frame_set(frame)
            self.reset()
            phase = 0 if loop and frame == frames else frame / frames
            pose(phase)
            for bone in self.bones:
                bone.rotation_mode = "QUATERNION"
                q = bone.rotation_quaternion
                q.normalize()
                if bone.name in previous and q.dot(previous[bone.name]) < 0:
                    q.negate()
                previous[bone.name] = q.copy()
                for prop in ("location", "rotation_quaternion", "scale"):
                    bone.keyframe_insert(prop, frame=frame, group=bone.name)
        for curve in action_fcurves(action):
            for point in curve.keyframe_points:
                point.interpolation = "LINEAR"
        self.rig.animation_data.action = None
        track = self.rig.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, action)
        strip.name = name
        track.mute = True
        print(f"Baked {name}: {frames + 1} frames", flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    rig = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and any(m.type == "ARMATURE" for m in obj.modifiers)]
    if len(meshes) != 1 or len(rig.data.bones) != 34:
        raise RuntimeError("Unexpected source bear topology or Smart Rig")
    rig.animation_data_create()
    bpy.context.scene.render.fps = FPS
    author = BearAuthor(rig, meshes[0])
    author.bake("Bear_Idle", 3.2, author.idle, loop=True)
    author.bake("Bear_CombatIdle", 2.4, lambda p: author.idle(p, True), loop=True)
    author.bake("Bear_Walk", WALK["duration"], lambda p: author.gait(p, WALK), loop=True)
    author.bake("Bear_Run", RUN["duration"], lambda p: author.gait(p, RUN, True), loop=True)
    author.bake("Bear_SwipeLeft", 0.95, lambda p: author.attack(p, True))
    author.bake("Bear_SwipeRight", 0.95, lambda p: author.attack(p, False))
    author.bake("Bear_DoubleSlam", 1.2, author.double_attack)
    author.bake("Bear_Hit", 0.45, author.hit)
    author.bake("Bear_Death", 1.4, author.death)
    author.bake("Bear_Roar", 1.6, author.roar)
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    rig.animation_data.action = None
    author.reset()
    meshes[0]["source"] = "Owner-supplied Meshy Smart Rig bear; original geometry, skin weights and PBR maps"
    meshes[0]["source_sha256"] = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    export_glb(OUTPUT, rig, meshes)
    report = {"source": str(SOURCE), "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              "bones": 34, "walk": WALK, "run": RUN, "max_ik_reach_clamp": author.max_reach_error,
              "height": 2.7, "walkRef": WALK["stride"] / (WALK["duration"] * WALK["stance"]) * 2.7 / 1.7,
              "runRef": RUN["stride"] / (RUN["duration"] * RUN["stance"]) * 2.7 / 1.7}
    OUTPUT.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
