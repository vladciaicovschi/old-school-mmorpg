"""Author caprine motion on the owner's original 44-joint Smart Rig goat.

Original geometry, skin weights and PBR maps remain intact. Motion timing and
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

SOURCE = ROOT.parent / "bible/models/mobs/animals/goat.glb"
OUTPUT = ROOT / "tmp/asset_src/animals/smart_goat/smart_goat.glb"
FPS, HEIGHT, TAU = 60, 1.85, 2*math.pi
# Mapped from the actual source positions, including the fetlock and hoof.
LEGS = {"hind_left": ("Bone_013", "Bone_012", "Bone_011", "Bone_010"),
        "hind_right": ("Bone_018", "Bone_017", "Bone_016", "Bone_015"),
        "front_left": ("Bone_032", "Bone_031", "Bone_030", "Bone_029"),
        "front_right": ("Bone_026", "Bone_025", "Bone_024", "Bone_023")}
GAITS = {"walk": {"duration": 1.05, "stride": 0.46, "stance": 0.66, "lift": 0.11},
         "trot": {"duration": 0.65, "stride": 0.56, "stance": 0.54, "lift": 0.14},
         "run": {"duration": 0.52, "stride": 0.62, "stance": 0.46, "lift": 0.16}}


class GoatAuthor(NativeQuadrupedAuthor):
    def face(self, pitch=0.0, yaw=0.0, jaw=0.0, ears=0.0):
        self.rotate("Bone_021", "X", pitch*0.65)
        self.rotate("Bone_020", "X", pitch*0.35)
        self.rotate("Bone_019", "Z", yaw)
        self.rotate("Bone_043", "X", jaw)
        self.rotate("Bone_035", "Y", ears)
        self.rotate("Bone_037", "Y", -ears)

    def idle(self, phase, ready=False):
        beat = TAU*phase
        self.body(lift=0.006*math.sin(beat)-(0.07 if ready else 0.025))
        self.rotate("Bone_007", "X", 0.009*math.sin(beat-0.3))
        self.rotate("Bone_006", "Z", 0.008*math.sin(beat-0.55))
        self.face(pitch=0.17 if ready else 0.012*math.sin(beat-0.8),
                  yaw=0.008*math.sin(beat-1.0), ears=0.025*math.sin(beat+0.5))
        self.rotate("Bone_005", "Z", 0.045*math.sin(beat-0.8))
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
        self.body(lift=(-0.16+0.018*math.sin(beat)) if run else
                  (-0.145 if name == "trot" else -0.115)+0.012*math.cos(2*beat),
                  side=(0.014 if name == "walk" else 0.008)*math.sin(beat))
        self.rotate("Bone_000", "X", (0.035 if run else 0.008)*math.sin(beat-0.15))
        self.rotate("Bone_008", "X", (0.035 if run else 0.012)*math.sin(beat-0.4))
        self.rotate("Bone_006", "X", (0.035 if run else 0.014)*math.sin(beat-0.75))
        self.face(pitch=-(0.04 if run else 0.018)*math.sin(beat-1.05),
                  yaw=0.025*math.sin(beat-0.6), ears=0.025*math.sin(beat-0.9))
        self.rotate("Bone_005", "Z", 0.055*math.sin(beat-0.7))
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
            bias = 0.12 if "hind" in leg else (-0.05 if "left" in leg else 0.10)
            target.y -= forward+bias
            if "front" in leg:
                self.rotate("Bone_033" if "left" in leg else "Bone_027", "X", 0.035*math.sin(TAU*u+0.5))
            self.paw(leg, target, pitch)

    def headbutt(self, phase, side=1, ram=False):
        load = smoother(phase/0.30)*(1-smoother((phase-0.60)/0.40))
        drive = smoother((phase-0.28)/0.26)*(1-smoother((phase-0.60)/0.40))
        neck = smoother((phase-0.32)/0.25)*(1-smoother((phase-0.68)/0.32))
        bow = smoother(phase/0.34)*(1-smoother((phase-0.67)/0.33))
        rear = smoother((phase-0.12)/0.18)*(1-smoother((phase-0.34)/0.24)) if ram else 0.0
        self.body(lift=-0.10*load+0.045*rear,
                  forward=-0.045*load+(0.29 if ram else 0.235)*drive,
                  side=side*(0.022*load-0.033*drive))
        self.rotate("Bone_000", "X", -0.21*rear)
        self.rotate("Bone_008", "X", 0.035*drive)
        self.rotate("Bone_006", "X", 0.035*drive-0.015*load)
        # Keep the crown presented through contact, then lift it after the chest
        # has started recovering. The ram bows farther than the lateral butts.
        self.face(pitch=(0.84 if ram else 0.71)*bow-0.07*neck,
                  yaw=side*(0.16*load-0.30*neck), ears=-0.12*load)
        self.rotate("Bone_005", "Z", side*0.07*smoother((phase-0.08)/0.35)*(1-smoother((phase-0.7)/0.3)))
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
            target = anchor+Vector((0, -0.18*advance, lift+0.16*rear)) if stepping else anchor
            paw_pitch = pitch if stepping else 0
            if "hind" in leg:
                delay = .05 if ("left" in leg) == (side < 0) else 0
                step, clearance, paw_pitch = attack_step(
                    phase, .16 if ram else .12, .09,
                    start=.32+delay, plant=.60+delay, release=.78+delay/2)
                target = anchor+Vector((0, -step, clearance))
            self.paw(leg, target, paw_pitch)

    def hit(self, phase):
        recoil = math.sin(math.pi*smoother(phase))
        self.body(lift=-0.055*recoil, forward=-0.055*recoil)
        self.face(pitch=-0.16*recoil, yaw=0.10*recoil, ears=-0.13*recoil)
        self.planted()

    def bleat(self, phase):
        hold = smoother(phase/0.28)*(1-smoother((phase-0.70)/0.30))
        self.body(lift=-0.025+0.008*hold)
        self.face(pitch=-0.24*hold, yaw=0.025*hold, jaw=(0.24+0.025*math.sin(8*TAU*phase))*hold,
                  ears=0.10*hold)
        self.rotate("Bone_005", "Z", 0.06*math.sin(2*TAU*phase)*hold)
        self.planted()

    def look(self, phase):
        wave = math.sin(TAU*phase)*math.sin(math.pi*phase)**2
        self.body(lift=-0.025)
        self.face(pitch=-0.04*math.sin(math.pi*phase)**2, yaw=0.32*wave, ears=0.13*wave)
        self.planted()

    def graze(self, phase):
        hold = smoother(phase/0.35)*(1-smoother((phase-0.70)/0.30))
        self.body(lift=-0.12*hold, forward=0.025*hold)
        self.rotate("Bone_006", "X", 0.13*hold)
        self.face(pitch=1.0*hold, yaw=0.04*math.sin(2*TAU*phase)*hold,
                  jaw=0.07*(0.5+0.5*math.sin(6*TAU*phase))*hold)
        self.rotate("Bone_019", "X", 0.18*hold)
        self.planted()

    def death(self, phase):
        drop = smoother(phase/0.78)
        self.body(lift=-0.42*drop, side=0.08*drop)
        self.rotate("Bone_000", "Y", 1.48*smoother((phase-0.10)/0.68))
        self.face(pitch=0.14*drop, yaw=-0.07*drop, jaw=0.07*drop, ears=-0.08*drop)
        release = smoother((phase-0.24)/0.61)
        for leg in ("front_left", "hind_left"):
            upper, knee, hock, foot = self.legs[leg]
            self.rotate(upper, "Y", -0.55*release)
            self.rotate(knee, "Y", -0.30*release)
            self.rotate(hock, "Y", -0.06*release)
            self.rotate(foot, "Y", 0.08*smoother((phase-0.42)/0.43))
        self.settle_floor()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    rig = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and any(m.type == "ARMATURE" for m in obj.modifiers)]
    if len(meshes) != 1 or len(rig.data.bones) != 44:
        raise RuntimeError("Unexpected native goat topology")
    rig.animation_data_create()
    bpy.context.scene.render.fps = FPS
    author = GoatAuthor(rig, meshes[0], LEGS)
    author.bake("Goat_Idle", 2.8, author.idle, True)
    author.bake("Goat_CombatIdle", 2.0, lambda p: author.idle(p, True), True)
    for name, cfg in GAITS.items():
        author.bake(f"Goat_{name.title()}", cfg["duration"], lambda p, n=name: author.gait(p, n), True)
    author.bake("Goat_HeadbuttLeft", 1.15, lambda p: author.headbutt(p, -1))
    author.bake("Goat_HeadbuttRight", 1.15, lambda p: author.headbutt(p, 1))
    author.bake("Goat_Ram", 1.30, lambda p: author.headbutt(p, 0, True))
    author.bake("Goat_Hit", 0.45, author.hit)
    author.bake("Goat_Death", 1.4, author.death)
    author.bake("Goat_Bleat", 2.0, author.bleat)
    author.bake("Goat_AlertLook", 2.0, author.look)
    author.bake("Goat_Graze", 3.0, author.graze)
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    author.reset()
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    meshes[0]["source"] = "Owner-supplied Smart Rig goat; native geometry, skin weights and PBR maps"
    meshes[0]["source_sha256"] = digest
    export_glb(OUTPUT, rig, meshes)
    report = {"source_sha256": digest, "bones": 44, "height": HEIGHT, "gaits": GAITS, "clips": author.clip_reports,
              "walkRef": GAITS["walk"]["stride"]/(GAITS["walk"]["duration"]*GAITS["walk"]["stance"])*HEIGHT/1.7,
              "runRef": GAITS["run"]["stride"]/(GAITS["run"]["duration"]*GAITS["run"]["stance"])*HEIGHT/1.7}
    OUTPUT.with_suffix(".json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf8")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
