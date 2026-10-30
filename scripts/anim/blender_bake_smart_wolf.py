"""Bake canine motion on the supplied 43-joint Smart Rig, without rerigging.

Keep the original digitigrade hocks, carpi and mesh. Repair only the upper
muzzle's erroneous jaw/ear weights after export. All paw IK is
offline; the game consumes ordinary baked clips through its existing mixer.
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
from blender_bake_meshy_titan import action_fcurves, export_glb
from animal_motion_curves import attack_step, smoother, swing

SOURCE = ROOT.parent / "bible/models/mobs/animals/wolf.glb"
OUTPUT = ROOT / "tmp/asset_src/animals/smart_wolf/smart_wolf.glb"
FPS = 60
TAU = 2 * math.pi
HEIGHT = 2.05
# Verified in the source's actual world-space hierarchy. Blender forward -Y,
# up +Z; glTF/game forward +Z, up +Y. Each chain retains its third leg segment.
LEGS = {
    "hind_left": ("Bone_006", "Bone_005", "Bone_004", "Bone_003"),
    "hind_right": ("Bone_011", "Bone_010", "Bone_009", "Bone_008"),
    "front_left": ("Bone_029", "Bone_028", "Bone_027", "Bone_026"),
    "front_right": ("Bone_035", "Bone_034", "Bone_033", "Bone_032"),
}
GAITS = {
    "walk": {"duration": 1.12, "stride": 0.78, "stance": 0.67, "lift": 0.19},
    "trot": {"duration": 0.64, "stride": 0.90, "stance": 0.54, "lift": 0.22},
    "run": {"duration": 0.52, "stride": 1.00, "stance": 0.46, "lift": 0.28},
}


def smooth(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


class WolfAuthor:
    gaits = GAITS
    attack_expression = 1.0
    attack_hind_stride = 0.0

    def __init__(self, rig, mesh, legs=None, bone_map=None):
        self.rig, self.mesh = rig, mesh
        self.legs = LEGS if legs is None else legs
        self.bone_map = bone_map or {}
        self.bones = rig.pose.bones
        self.rest = {bone.name: bone.matrix.copy() for bone in self.bones}
        self.feet = {leg: self.rest[names[3]].translation.copy() for leg, names in self.legs.items()}
        self.hocks = {leg: self.rest[names[2]].translation - self.feet[leg] for leg, names in self.legs.items()}
        self.max_reach_error = 0.0

    def update(self):
        bpy.context.view_layer.update()

    def reset(self):
        for bone in self.bones:
            bone.matrix_basis = Matrix.Identity(4)
        self.update()

    def rotate(self, name, axis, angle):
        bone = self.bones[self.bone_map.get(name, name)]
        pivot = bone.head.copy()
        bone.matrix = Matrix.Translation(pivot) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-pivot) @ bone.matrix
        self.update()

    def body(self, lift=0.0, forward=0.0, side=0.0):
        matrix = self.bones["Bone_000"].matrix.copy()
        matrix.translation += Vector((side, -forward, lift))
        self.bones["Bone_000"].matrix = matrix
        self.update()

    def aim(self, name, child, target):
        bone = self.bones[name]
        origin = bone.head.copy()
        rotation = (self.bones[child].head - origin).rotation_difference(target - origin).to_matrix().to_4x4()
        bone.matrix = Matrix.Translation(origin) @ rotation @ Matrix.Translation(-origin) @ bone.matrix
        self.update()

    def paw(self, leg, target, pitch=0.0):
        upper, knee, hock, foot = self.legs[leg]
        # Keep the metatarsal/carpal segment, solving the upper two bones to
        # its proximal end, then aiming the third segment at the paw anchor.
        hock_target = target + Matrix.Rotation(pitch * 0.5, 3, "X") @ self.hocks[leg]
        start = self.bones[upper].head.copy()
        a = (self.bones[knee].head - start).length
        b = (self.bones[hock].head - self.bones[knee].head).length
        delta = hock_target - start
        direction = delta.normalized()
        distance = min(a + b - 0.003, max(abs(a - b) + 0.003, delta.length))
        self.max_reach_error = max(self.max_reach_error, abs(delta.length - distance))
        along = (a*a - b*b + distance*distance) / (2 * distance)
        side = -1 if "left" in leg else 1
        pole = Vector((side * 0.08, 1 if "front" in leg else -1, 0))
        pole -= direction * pole.dot(direction)
        if pole.length < 0.001:
            raise RuntimeError(f"Degenerate wolf bend plane: {leg}")
        bend = start + direction * along + pole.normalized() * math.sqrt(max(0, a*a - along*along))
        self.aim(upper, knee, bend)
        self.aim(knee, hock, start + direction * distance)
        self.aim(hock, foot, target)
        matrix = self.rest[foot].copy()
        matrix.translation = self.bones[foot].head.copy()
        self.bones[foot].matrix = matrix
        self.update()
        if pitch:
            self.rotate(foot, "X", pitch)

    def planted(self, overrides=None):
        overrides = overrides or {}
        for leg, anchor in self.feet.items():
            self.paw(leg, overrides.get(leg, anchor))

    def face(self, pitch=0.0, yaw=0.0, jaw=0.0, ears=0.0):
        self.rotate("Bone_024", "X", pitch)
        self.rotate("Bone_023", "Z", yaw)
        self.rotate("Bone_038", "X", jaw)
        self.rotate("Bone_040", "Y", ears)
        self.rotate("Bone_042", "Y", -ears)

    def idle(self, phase, combat=False):
        breath = math.sin(TAU * phase)
        self.body(lift=0.006 * breath - (0.035 if combat else 0))
        self.rotate("Bone_020", "X", 0.008 * math.sin(TAU*phase-0.30))
        self.rotate("Bone_018", "X", 0.012 * math.sin(TAU*phase-0.55))
        self.face(pitch=0.06 if combat else 0.013 * math.sin(TAU*phase-0.85),
                  jaw=0.08 if combat else 0.0, ears=-0.08 if combat else 0.012*math.sin(2*TAU*phase+0.4))
        self.rotate("Bone_016", "Z", 0.035 * math.sin(TAU*phase-1.1))
        self.rotate("Bone_015", "X", 0.03 * math.sin(TAU*phase-0.8))
        self.planted()

    def gait(self, phase, name):
        cfg = self.gaits[name]
        stride, stance, lift = (cfg[key] for key in ("stride", "stance", "lift"))
        offsets = {"hind_left": 0, "front_left": 0.25, "hind_right": 0.5, "front_right": 0.75}
        if name == "trot":
            offsets = {"hind_left": 0, "front_right": 0, "hind_right": 0.5, "front_left": 0.5}
        elif name == "run":
            offsets = {"hind_left": 0, "hind_right": 0.08, "front_left": 0.48, "front_right": 0.56}
        beat = math.sin(TAU * phase)
        running = name == "run"
        self.body(lift=(-0.10 + 0.035 * beat) if running else -0.08 + 0.023 * math.cos(2 * TAU * phase),
                  side=0.022 * beat if name == "walk" else 0.010 * beat)
        self.rotate("Bone_000", "X", (0.055 if running else 0.014) * math.sin(TAU*phase-0.12))
        self.rotate("Bone_000", "Y", 0.018 * math.sin(TAU*phase-0.20))
        self.rotate("Bone_020", "X", (0.065 if running else 0.02) * math.sin(TAU*phase-0.40))
        self.rotate("Bone_018", "X", (0.060 if running else 0.025) * math.sin(TAU*phase-0.80))
        self.rotate("Bone_018", "Z", 0.025 * math.sin(TAU*phase+0.20))
        self.face(pitch=-(0.07 if running else 0.025) * math.sin(TAU*phase-1.10),
                  yaw=0.025 * math.sin(TAU*phase-0.70), jaw=0.065 if running else 0.0)
        self.rotate("Bone_016", "Z", 0.08 * math.sin(TAU*phase-0.80))
        self.rotate("Bone_015", "X", -0.065 * math.sin(TAU*phase-1.10))
        self.rotate("Bone_014", "Z", 0.05 * math.sin(TAU*phase-1.50))
        for leg, rest in self.feet.items():
            u = (phase + offsets[leg]) % 1
            target = rest.copy()
            pitch = 0
            if u < stance:
                forward = stride * (0.5 - u / stance)
            else:
                v = (u - stance) / (1 - stance)
                forward, arch = swing(v, stride, stance)
                target.z += lift * arch
                pitch = 0.30 * math.sin(TAU * v) * arch
                target.x += (-1 if "left" in leg else 1) * 0.028 * arch
            # Center each recovery beneath its hip/shoulder. A long rearward
            # hind stroke followed by a high tuck otherwise reaches both IK
            # limits in one cycle and makes the hock snap.
            target.y -= forward + ((-0.06 if "front" in leg else 0.10) if running else 0.0)
            if "front" in leg:
                shoulder = "Bone_030" if "left" in leg else "Bone_036"
                self.rotate(shoulder, "X", (0.10 if running else 0.075)*math.sin(TAU*u+0.60))
            self.paw(leg, target, pitch)

    def bite(self, phase, side=1, lunge=False):
        expression = self.attack_expression
        load = smoother(phase/0.30)
        brace = load * (1-smoother((phase-0.58)/0.42))
        power = smoother((phase-0.24)/0.28) * (1-smoother((phase-0.58)/0.42))
        neck = smoother((phase-0.28)/0.25) * (1-smoother((phase-0.65)/0.35))
        reach = smoother((phase-0.30)/0.27) * (1-smoother((phase-0.69)/0.31))
        self.body(lift=(-0.075*brace + 0.045*power)*expression,
                  forward=(-0.055*brace + (0.42 if lunge else 0.32)*power)*expression,
                  side=side*(0.028*brace-0.04*power)*expression)
        self.rotate("Bone_020", "X", 0.04*brace+0.06*power)
        self.rotate("Bone_018", "X", -0.05*brace+0.08*power)
        self.rotate("Bone_018", "Z", side*(0.08*brace-0.15*power)*expression)
        self.face(pitch=-0.22*brace+0.48*neck,
                  yaw=side*(0.25*brace-0.45*neck)*expression,
                  jaw=0.70*load*(1-smoother((phase-0.38)/0.14))+0.06*power,
                  ears=-0.18*brace)
        # Reach through the upper neck while leveling the muzzle. Keeping this
        # release behind the chest lets the bite finish before the head withdraws.
        self.rotate("Bone_023", "X", -0.24*reach)
        self.rotate("Bone_016", "Z", side*0.09*brace)
        self.rotate("Bone_015", "X", -0.06*smoother((phase-0.1)/0.35)*(1-smoother((phase-0.7)/0.3)))
        advance = smoother((phase-0.14)/0.40)*(1-smoother((phase-0.68)/0.30))
        lift = 0.0
        pitch = 0.0
        for start, length in ((0.14, 0.40), (0.68, 0.30)):
            if start < phase < start+length:
                u = (phase-start)/length
                lift = (0.16 if lunge else 0.14)*math.sin(math.pi*u)**3
                pitch = 0.22*math.sin(TAU*u)*math.sin(math.pi*u)**3
        active = "front_left" if side < 0 else "front_right"
        for leg, anchor in self.feet.items():
            stepping = "front" in leg and (lunge or leg == active)
            target = anchor + Vector((0, -(0.26 if lunge else 0.20)*advance*expression, lift*expression)) if stepping else anchor
            paw_pitch = pitch if stepping else 0.0
            if "hind" in leg and self.attack_hind_stride:
                delay = .05 if ("left" in leg) == (side < 0) else 0
                step, clearance, paw_pitch = attack_step(
                    phase, self.attack_hind_stride*(1.15 if lunge else 1), .10,
                    start=.34+delay, plant=.61+delay, release=.79+delay/2)
                target = anchor+Vector((0, -step, clearance))
            if stepping:
                self.rotate("Bone_030" if "left" in leg else "Bone_036", "X", -0.10*advance)
            self.paw(leg, target, paw_pitch)

    def hit(self, phase):
        recoil = math.sin(math.pi * smooth(phase))
        self.body(lift=-0.04 * recoil, forward=-0.07 * recoil)
        self.rotate("Bone_018", "X", -0.04 * recoil)
        self.face(pitch=-0.10 * recoil, yaw=0.09 * recoil, jaw=0.12 * recoil, ears=-0.12 * recoil)
        self.planted()

    def howl(self, phase):
        hold = smooth(phase / 0.30) * (1 - smooth((phase - 0.72) / 0.28))
        self.body(lift=0.018 * hold)
        self.rotate("Bone_018", "X", -0.075 * hold)
        self.face(pitch=-0.62 * hold, yaw=0.0, jaw=0.55 * hold, ears=0.05 * hold)
        self.rotate("Bone_023", "X", -0.14*hold)
        self.rotate("Bone_016", "X", -0.05 * hold)
        self.planted()

    def alert(self, phase):
        envelope = math.sin(math.pi * phase)**2
        look = math.sin(TAU * phase) * envelope
        self.face(pitch=-0.04 * envelope, yaw=0.30 * look, ears=0.16 * look)
        self.rotate("Bone_016", "Z", 0.06 * look)
        self.planted()

    def death(self, phase):
        drop = smooth(phase / 0.75)
        self.body(lift=-0.52 * drop, side=0.12 * drop)
        self.rotate("Bone_000", "Y", 1.48 * smooth((phase - 0.08) / 0.67))
        self.rotate("Bone_024", "X", 0.12 * drop)
        self.rotate("Bone_038", "X", 0.13 * drop)
        for leg, (_, knee, hock, _) in self.legs.items():
            self.rotate(knee, "X", (0.25 if "front" in leg else -0.18) * drop)
            self.rotate(hock, "X", -0.12 * drop)
        # The left flank becomes the upper side after the body rolls. Let its
        # limbs fall toward the floor, with a soft elbow/hock bend and a late
        # wrist release instead of retaining the standing silhouette.
        release = smooth((phase - 0.22) / 0.63)
        for leg in ("front_left", "hind_left"):
            upper, knee, hock, foot = self.legs[leg]
            self.rotate(upper, "Y", -0.55 * release)
            self.rotate(knee, "Y", -0.28 * release)
            self.rotate(hock, "Y", -0.08 * release)
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
            pose(0 if loop and frame == frames else frame / frames)
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
    if len(meshes) != 1 or len(rig.data.bones) != 43:
        raise RuntimeError("Unexpected wolf topology or Smart Rig")
    rig.animation_data_create()
    bpy.context.scene.render.fps = FPS
    author = WolfAuthor(rig, meshes[0])
    author.bake("Wolf_Idle", 2.8, author.idle, True)
    author.bake("Wolf_CombatIdle", 2.0, lambda p: author.idle(p, True), True)
    for name, cfg in GAITS.items():
        author.bake(f"Wolf_{name.title()}", cfg["duration"], lambda p, n=name: author.gait(p, n), True)
    author.bake("Wolf_BiteLeft", 1.12, lambda p: author.bite(p, -1))
    author.bake("Wolf_BiteRight", 1.12, lambda p: author.bite(p, 1))
    author.bake("Wolf_Lunge", 1.30, lambda p: author.bite(p, 0, True))
    author.bake("Wolf_Hit", 0.42, author.hit)
    author.bake("Wolf_Death", 1.35, author.death)
    author.bake("Wolf_Howl", 2.2, author.howl)
    author.bake("Wolf_AlertLook", 1.8, author.alert)
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    author.reset()
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    meshes[0]["source"] = "Owner-supplied Meshy Smart Rig wolf; original geometry and PBR maps; local upper-muzzle skin correction"
    meshes[0]["source_sha256"] = digest
    export_glb(OUTPUT, rig, meshes)
    subprocess.run(["node", str(Path(__file__).with_name("repair_smart_wolf_muzzle.mjs")),
                    str(OUTPUT)], check=True, cwd=ROOT)
    report = {"source_sha256": digest, "bones": 43, "height": HEIGHT, "gaits": GAITS,
              "max_ik_reach_clamp": author.max_reach_error,
              "walkRef": GAITS["walk"]["stride"] / (GAITS["walk"]["duration"] * GAITS["walk"]["stance"]) * HEIGHT / 1.7,
              "runRef": GAITS["run"]["stride"] / (GAITS["run"]["duration"] * GAITS["run"]["stance"]) * HEIGHT / 1.7}
    OUTPUT.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
