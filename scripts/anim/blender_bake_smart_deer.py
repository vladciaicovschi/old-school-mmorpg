"""Author cervine motion on the owner's original 44-joint Smart Rig deer.

Native topology, skin groups and PBR maps remain intact; the source stance is normalized. Motion timing and
weight transfer use the cataloged Quaternius ungulates as references. No donor
rotations, skin transfer, runtime IK or body-scale tricks are used.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from animal_motion_curves import attack_step, smoother, swing
from blender_bake_meshy_titan import export_glb
from native_quadruped_author import NativeQuadrupedAuthor
from native_animal_bind import commit_bind, probe_bake

SOURCE = ROOT.parent / "bible/models/mobs/animals/deer.glb"
OUTPUT = ROOT / "tmp/asset_src/animals/smart_deer/smart_deer.glb"
FPS, HEIGHT, TAU = 60, 2.25, 2*math.pi
# Mapped from the actual source positions, including the fetlock and hoof.
LEGS = {"hind_left": ("Bone_018", "Bone_017", "Bone_016", "Bone_015"),
        "hind_right": ("Bone_013", "Bone_012", "Bone_011", "Bone_010"),
        "front_left": ("Bone_028", "Bone_027", "Bone_026", "Bone_025"),
        "front_right": ("Bone_034", "Bone_033", "Bone_032", "Bone_031")}
GAITS = {"walk": {"duration": 1.20, "stride": 0.44, "stance": 0.66, "lift": 0.11},
         "trot": {"duration": 0.65, "stride": 0.52, "stance": 0.54, "lift": 0.14},
         "run": {"duration": 0.55, "stride": 0.50, "stance": 0.46, "lift": 0.13}}


class DeerAuthor(NativeQuadrupedAuthor):
    def face(self, pitch=0.0, yaw=0.0, ears=0.0):
        self.rotate("Bone_023", "X", pitch*0.65)
        self.rotate("Bone_022", "X", pitch*0.35)
        self.rotate("Bone_023", "Z", yaw)
        self.rotate("Bone_041", "Y", ears)
        self.rotate("Bone_043", "Y", -ears)

    def idle(self, phase, ready=False):
        beat = TAU*phase
        self.body(lift=0.006*math.sin(beat)-(0.07 if ready else 0.025))
        self.rotate("Bone_007", "X", 0.009*math.sin(beat-0.3))
        self.rotate("Bone_005", "Z", 0.008*math.sin(beat-0.55))
        self.face(pitch=0.17 if ready else 0.012*math.sin(beat-0.8),
                  yaw=0.008*math.sin(beat-1.0), ears=0.025*math.sin(beat+0.5))
        self.rotate("Bone_004", "Z", 0.045*math.sin(beat-0.8))
        self.planted()

    def gait(self, phase, name):
        cfg = GAITS[name]
        offsets = {"hind_left": 0, "front_left": 0.25, "hind_right": 0.5, "front_right": 0.75}
        if name == "trot":
            offsets = {"hind_left": 0, "front_right": 0, "hind_right": 0.5, "front_left": 0.5}
        elif name == "run":
            offsets = {"hind_left": 0, "hind_right": 0.07, "front_left": 0.49, "front_right": 0.56}
        run = name == "run"
        beat = TAU*phase
        self.body(lift=(-0.13+0.018*math.sin(beat)) if run else
                  (-0.145 if name == "trot" else -0.115)+0.012*math.cos(2*beat),
                  side=(0.014 if name == "walk" else 0.008)*math.sin(beat))
        self.rotate("Bone_000", "X", (0.035 if run else 0.008)*math.sin(beat-0.15))
        self.rotate("Bone_008", "X", (0.035 if run else 0.012)*math.sin(beat-0.4))
        self.rotate("Bone_005", "X", (0.035 if run else 0.014)*math.sin(beat-0.75))
        self.face(pitch=-(0.04 if run else 0.018)*math.sin(beat-1.05),
                  yaw=0.025*math.sin(beat-0.6), ears=0.025*math.sin(beat-0.9))
        self.rotate("Bone_004", "Z", 0.055*math.sin(beat-0.7))
        for leg, anchor in self.feet.items():
            u = (phase+offsets[leg]) % 1
            target, pitch = anchor.copy(), 0.0
            if u < cfg["stance"]:
                forward = cfg["stride"]*(0.5-u/cfg["stance"])
            else:
                v = (u-cfg["stance"])/(1-cfg["stance"])
                forward, arch = swing(v, cfg["stride"], cfg["stance"])
                target.z += cfg["lift"]*arch
                pitch = 0.14*math.sin(TAU*v)*arch
                target.x += (-1 if "left" in leg else 1)*0.012*arch
            # The source has staggered forefeet. Center each hock beneath its
            # own shoulder rather than giving both sides one stretch-prone bias.
            target.y -= forward
            if "front" in leg:
                self.rotate("Bone_029" if "left" in leg else "Bone_035", "X", 0.035*math.sin(TAU*u+0.5))
            self.paw(leg, target, pitch)

    def headbutt(self, phase, side=1, ram=False):
        load = smoother(phase/0.30)*(1-smoother((phase-0.60)/0.40))
        drive = smoother((phase-0.28)/0.26)*(1-smoother((phase-0.60)/0.40))
        neck = smoother((phase-0.32)/0.25)*(1-smoother((phase-0.68)/0.32))
        bow = smoother(phase/0.34)*(1-smoother((phase-0.67)/0.33))
        rear = smoother((phase-0.12)/0.18)*(1-smoother((phase-0.34)/0.24)) if ram else 0.0
        self.body(lift=-0.10*load+0.04*rear,
                  forward=-0.045*load+(0.31 if ram else 0.26)*drive,
                  side=side*(0.024*load-0.036*drive))
        self.rotate("Bone_000", "X", -0.22*rear)
        self.rotate("Bone_008", "X", 0.035*drive)
        self.rotate("Bone_005", "X", 0.035*drive-0.015*load)
        # Keep the crown presented through contact, then lift it after the chest
        # has started recovering. The ram bows farther than the lateral butts.
        self.face(pitch=(0.87 if ram else 0.74)*bow-0.07*neck,
                  yaw=side*(0.17*load-0.32*neck), ears=-0.12*load)
        self.rotate("Bone_004", "Z", side*0.07*smoother((phase-0.08)/0.35)*(1-smoother((phase-0.7)/0.3)))
        active = "front_left" if side < 0 else "front_right"
        advance = smoother((phase-0.15)/0.40)*(1-smoother((phase-0.70)/0.28))
        lift = pitch = 0.0
        for start, length in ((0.15, 0.40), (0.70, 0.28)):
            if start < phase < start+length:
                u = (phase-start)/length
                lift = (0.13 if ram else 0.11)*math.sin(math.pi*u)**3
                pitch = 0.12*math.sin(TAU*u)*math.sin(math.pi*u)**3
        for leg, anchor in self.feet.items():
            stepping = "front" in leg and (ram or leg == active)
            target = anchor+Vector((0, -0.20*advance, lift+0.16*rear)) if stepping else anchor
            paw_pitch = pitch if stepping else 0
            if "hind" in leg:
                delay = .05 if ("left" in leg) == (side < 0) else 0
                step, clearance, paw_pitch = attack_step(
                    phase, .18 if ram else .14, .10,
                    start=.32+delay, plant=.60+delay, release=.78+delay/2)
                target = anchor+Vector((0, -step, clearance))
            self.paw(leg, target, paw_pitch)

    def hit(self, phase):
        recoil = math.sin(math.pi*smoother(phase))
        self.body(lift=-0.055*recoil, forward=-0.055*recoil)
        self.face(pitch=-0.16*recoil, yaw=0.10*recoil, ears=-0.13*recoil)
        self.planted()

    def challenge(self, phase):
        hold = smoother(phase/0.28)*(1-smoother((phase-0.70)/0.30))
        self.body(lift=-0.025+0.008*hold)
        self.face(pitch=-0.24*hold, yaw=0.025*hold,
                  ears=0.10*hold)
        self.rotate("Bone_004", "Z", 0.06*math.sin(2*TAU*phase)*hold)
        self.planted()

    def look(self, phase):
        wave = math.sin(TAU*phase)*math.sin(math.pi*phase)**2
        self.body(lift=-0.025)
        self.face(pitch=-0.04*math.sin(math.pi*phase)**2, yaw=0.32*wave, ears=0.13*wave)
        self.planted()

    def graze(self, phase):
        hold = smoother(phase/0.35)*(1-smoother((phase-0.70)/0.30))
        self.body(lift=-0.12*hold, forward=0.025*hold)
        self.rotate("Bone_005", "X", 0.13*hold)
        self.face(pitch=1.0*hold, yaw=0.04*math.sin(2*TAU*phase)*hold)
        self.planted()

    def death(self, phase):
        drop = smoother(phase/0.78)
        self.body(lift=-0.42*drop, side=0.08*drop)
        self.rotate("Bone_000", "Y", 1.48*smoother((phase-0.10)/0.68))
        self.face(pitch=0.14*drop, yaw=-0.07*drop, ears=-0.08*drop)
        release = smoother((phase-0.24)/0.61)
        for leg in ("front_left", "hind_left"):
            upper, knee, hock, foot = self.legs[leg]
            self.rotate(upper, "Y", -0.55*release)
            self.rotate(knee, "Y", -0.30*release)
            self.rotate(hock, "Y", -0.06*release)
            self.rotate(foot, "Y", 0.08*smoother((phase-0.42)/0.43))
        self.settle_floor()


def normalize_stance(rig, mesh):
    author = DeerAuthor(rig, mesh, LEGS)
    author.phase = 0
    axis = author.bones["Bone_005"].head-author.bones["Bone_008"].head
    heading = math.atan2(axis.x, -axis.y)
    author.rotate("Bone_000", "Z", -heading)
    for parent, child in (("Bone_008", "Bone_007"), ("Bone_007", "Bone_006"), ("Bone_006", "Bone_005")):
        origin = author.bones[parent].head.copy()
        vector = author.bones[child].head-origin
        author.aim(parent, child, origin+Vector((0, vector.y, vector.z)).normalized()*vector.length)
    # The original head faces forward despite the diagonal torso. Counter its
    # accumulated normalization yaw at the lower neck, preserving the whole skull.
    forward = (author.bones["Bone_020"].matrix @ author.rest["Bone_020"].inverted()).to_3x3() @ Vector((0, -1, 0))
    author.rotate("Bone_023", "Z", -math.atan2(forward.x, -forward.y))
    author.body(lift=-.055)
    for prefix, width in (("front", .13), ("hind", .13)):
        pair = [f"{prefix}_{side}" for side in ("left", "right")]
        center = sum((author.bones[LEGS[leg][0]].head for leg in pair), Vector())*.5
        y = center.y+(.06 if prefix == "hind" else .015)
        for leg in pair:
            foot = LEGS[leg][3]
            author.hocks[leg] = author.bones[LEGS[leg][2]].head-author.bones[foot].head
            target = Vector((center.x+(-width if "left" in leg else width), y, .13))
            author.paw(leg, target)
            toe = {"front_left": "Bone_024", "front_right": "Bone_030", "hind_left": "Bone_014", "hind_right": "Bone_009"}[leg]
            vector = author.bones[toe].head-author.bones[foot].head
            author.rotate(foot, "Z", -math.atan2(vector.x, -vector.y))
    report = {"heading_radians": heading, "reach_clamp": author.reach_clamp}
    commit_bind(rig, mesh, "Bone_005")
    return report


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    rig = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and any(m.type == "ARMATURE" for m in obj.modifiers)]
    if len(meshes) != 1 or len(rig.data.bones) != 44:
        raise RuntimeError("Unexpected native deer topology")
    normalization = normalize_stance(rig, meshes[0])
    rig.animation_data_create()
    bpy.context.scene.render.fps = FPS
    author = DeerAuthor(rig, meshes[0], LEGS)
    if '--probe' in sys.argv:
        author.bake = lambda *args: probe_bake(author, *args)
    author.bake("Deer_Idle", 2.8, author.idle, True)
    author.bake("Deer_CombatIdle", 2.0, lambda p: author.idle(p, True), True)
    for name, cfg in GAITS.items():
        author.bake(f"Deer_{name.title()}", cfg["duration"], lambda p, n=name: author.gait(p, n), True)
    author.bake("Deer_AntlerLeft", 1.15, lambda p: author.headbutt(p, -1))
    author.bake("Deer_AntlerRight", 1.15, lambda p: author.headbutt(p, 1))
    author.bake("Deer_Charge", 1.30, lambda p: author.headbutt(p, 0, True))
    author.bake("Deer_Hit", 0.45, author.hit)
    author.bake("Deer_Death", 1.4, author.death)
    author.bake("Deer_Challenge", 2.0, author.challenge)
    author.bake("Deer_AlertLook", 2.0, author.look)
    author.bake("Deer_Graze", 3.0, author.graze)
    if '--probe' in sys.argv:
        print(json.dumps({'normalization': normalization, 'clips': author.clip_reports}), flush=True)
        return
    if any(r["reach_clamp"] > .004 for r in author.clip_reports.values()):
        raise RuntimeError("Deer motion exceeds native limb reserve")
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    author.reset()
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    meshes[0]["source"] = "Owner-supplied Smart Rig deer; native geometry, skin weights and PBR maps"
    meshes[0]["source_sha256"] = digest
    export_glb(OUTPUT, rig, meshes)
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    author.reset()
    author.idle(.5/2.8)
    evaluated = meshes[0].evaluated_get(bpy.context.evaluated_depsgraph_get())
    values = [(evaluated.matrix_world @ v.co).z for v in evaluated.data.vertices]
    idle_height = max(values)-min(values)
    report = {"normalization": normalization, "idle_height": idle_height, "source_sha256": digest, "bones": 44, "height": HEIGHT, "gaits": GAITS, "clips": author.clip_reports,
              "walkRef": GAITS["walk"]["stride"]/(GAITS["walk"]["duration"]*GAITS["walk"]["stance"])*HEIGHT/idle_height,
              "runRef": GAITS["run"]["stride"]/(GAITS["run"]["duration"]*GAITS["run"]["stance"])*HEIGHT/idle_height}
    OUTPUT.with_suffix(".json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf8")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
