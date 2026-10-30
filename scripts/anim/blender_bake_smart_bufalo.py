"""Author heavy bovine motion on the owner's native 52-joint buffalo.

Use the supplied Quaternius Bull for support rhythm and head-first weight transfer.
Preserve native geometry, skin and materials; export ordinary clips at 60 fps.
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

SOURCE = ROOT.parent / "bible/models/mobs/animals/bufalo.glb"
OUTPUT = ROOT / "tmp/asset_src/animals/smart_bufalo/smart_bufalo.glb"
HEIGHT, TAU = 2.4, 2*math.pi
LEGS = {"hind_left": ("Bone_017", "Bone_016", "Bone_015", "Bone_014"),
        "hind_right": ("Bone_022", "Bone_021", "Bone_020", "Bone_019"),
        "front_left": ("Bone_036", "Bone_035", "Bone_034", "Bone_033"),
        "front_right": ("Bone_030", "Bone_029", "Bone_028", "Bone_027")}
GAITS = {"walk": {"duration": 1.24, "stride": 0.50, "stance": 0.70, "lift": 0.09},
         "trot": {"duration": 0.80, "stride": 0.65, "stance": 0.58, "lift": 0.12},
         "run": {"duration": 0.62, "stride": 0.72, "stance": 0.50, "lift": 0.16}}


class BuffaloAuthor(NativeQuadrupedAuthor):
    def face(self, pitch=0.0, yaw=0.0, jaw=0.0):
        self.rotate("Bone_025", "X", 0.75*pitch)
        self.rotate("Bone_024", "X", 0.25*pitch)
        # Turn at the neck base, keeping the skull, horns and muzzle together.
        self.rotate("Bone_025", "Z", yaw)
        self.rotate("Bone_047", "X", jaw)
        # The outer 049/051 chains carry horns, so keep them rigid on the skull.

    def idle(self, phase, ready=False):
        beat = TAU*phase
        self.body(lift=-(0.09 if ready else 0.025)+0.005*math.sin(beat))
        self.rotate("Bone_012", "X", 0.008*math.sin(beat-0.25))
        self.rotate("Bone_010", "X", 0.006*math.sin(beat-0.55))
        self.face(pitch=0.18 if ready else 0.009*math.sin(beat-0.8),
                  yaw=0.006*math.sin(beat-1))
        self.rotate("Bone_009", "Z", 0.04*math.sin(beat-0.7))
        self.rotate("Bone_007", "Z", 0.055*math.sin(beat-1.1))
        self.planted()

    def gait(self, phase, name):
        cfg = GAITS[name]
        # Enter the walk with the source's leading left forefoot already forward.
        # This avoids dragging it across half a stride during the idle crossfade.
        if name == "walk":
            phase = (phase+0.25) % 1
        # Bovine lateral-sequence walk: hind-left, front-left, hind-right, front-right.
        offsets = {"hind_left": 0, "front_left": 0.75, "hind_right": 0.5, "front_right": 0.25}
        if name == "trot":
            offsets = {"hind_left": 0, "front_right": 0, "hind_right": 0.5, "front_left": 0.5}
        elif name == "run":
            offsets = {"hind_left": 0, "hind_right": 0.09, "front_left": 0.48, "front_right": 0.57}
        running, beat = name == "run", TAU*phase
        nod = beat if running else 2*beat
        self.body(lift=(-0.13+0.018*math.sin(beat)) if running else -0.10+0.010*math.cos(2*beat),
                  side=(0.012 if name == "walk" else 0.009)*math.sin(beat+math.pi/2))
        self.rotate("Bone_000", "X", (0.025 if running else 0.008)*math.sin(nod-0.10))
        self.rotate("Bone_012", "X", (0.028 if running else 0.010)*math.sin(nod-0.4))
        self.rotate("Bone_010", "X", (0.025 if running else 0.010)*math.sin(nod-0.7))
        self.face(pitch=-(0.035 if running else 0.018)*math.sin(nod-1.05),
                  yaw=0.012*math.sin(beat-0.8))
        self.rotate("Bone_009", "Z", 0.055*math.sin(beat-0.8))
        self.rotate("Bone_007", "Z", 0.07*math.sin(beat-1.1))
        for leg, anchor in self.feet.items():
            u = (phase+offsets[leg]) % 1
            target, pitch = anchor.copy(), 0.0
            if u < cfg["stance"]:
                forward = cfg["stride"]*(0.5-u/cfg["stance"])
            else:
                v = (u-cfg["stance"])/(1-cfg["stance"])
                forward, arch = swing(v, cfg["stride"], cfg["stance"])
                target.z += cfg["lift"]*arch
                pitch = 0.12*math.sin(TAU*v)*arch
            hock_offset = None
            if "front" in leg:
                shoulder = "Bone_036" if "left" in leg else "Bone_030"
                # The source has one leaning fetlock and one upright fetlock.
                # Align their support angles while retaining each segment length.
                length = self.hocks[leg].length
                hock_offset = Vector((0.01 if "left" in leg else -0.01, 0.035,
                                      math.sqrt(length*length-0.01**2-0.035**2)))
                target.x = self.rest["Bone_000"].translation.x + (-0.36 if "left" in leg else 0.36)
                target.y = self.rest[shoulder].translation.y-0.035-forward
                self.rotate("Bone_037" if "left" in leg else "Bone_031", "X", 0.025*math.sin(TAU*u+0.5))
            else:
                target.y -= forward+0.06
            self.paw(leg, target, pitch, hock_offset=hock_offset)

    def horn_strike(self, phase, side=1, charge=False):
        load = smoother(phase/0.32)*(1-smoother((phase-0.62)/0.38))
        drive = smoother((phase-0.28)/0.30)*(1-smoother((phase-0.62)/0.38))
        bow = smoother(phase/0.38)*(1-smoother((phase-0.69)/0.31))
        sweep = smoother((phase-0.30)/0.30)*(1-smoother((phase-0.70)/0.30))
        self.body(lift=-0.12*load-0.015*drive, forward=-0.055*load+(0.45 if charge else 0.33)*drive,
                  side=side*(0.026*load-0.034*drive))
        self.rotate("Bone_012", "X", 0.025*drive)
        self.rotate("Bone_010", "Z", side*(0.025*load-0.06*drive))
        self.face(pitch=(0.72 if charge else 0.62)*bow,
                  yaw=side*(0.20*load-0.43*sweep))
        self.rotate("Bone_009", "Z", side*0.06*load)
        self.rotate("Bone_007", "Z", side*0.08*smoother((phase-0.10)/0.35)*(1-smoother((phase-0.72)/0.28)))
        active = "front_left" if side < 0 else "front_right"
        for leg, anchor in self.feet.items():
            stepping = "front" in leg and (charge or leg == active)
            delay = 0.06 if charge and leg == "front_left" else 0.0
            advance = smoother((phase-0.14-delay)/0.42)*(1-smoother((phase-0.71-delay)/0.23))
            lift = pitch = 0.0
            for start, length in ((0.14+delay, 0.42), (0.71+delay, 0.23)):
                if start < phase < start+length:
                    u = (phase-start)/length
                    lift = (0.12 if charge else 0.10)*math.sin(math.pi*u)**3
                    pitch = 0.10*math.sin(TAU*u)*math.sin(math.pi*u)**3
            target = anchor+Vector((0, -(0.22 if charge else 0.15)*advance, lift)) if stepping else anchor
            paw_pitch = pitch if stepping else 0
            if "hind" in leg:
                delay = .05 if ("left" in leg) == (side < 0) else 0
                step, clearance, paw_pitch = attack_step(
                    phase, .13 if charge else .10, .085 if charge else .075,
                    start=.34+delay, plant=.62+delay, release=.79+delay/2)
                target = anchor+Vector((0, -step, clearance))
            self.paw(leg, target, paw_pitch)

    def hit(self, phase):
        recoil = math.sin(math.pi*smoother(phase))
        self.body(lift=-0.05*recoil, forward=-0.05*recoil)
        self.face(pitch=-0.08*recoil, yaw=0.07*recoil)
        self.planted()

    def bellow(self, phase):
        hold = smoother(phase/0.30)*(1-smoother((phase-0.70)/0.30))
        self.body(lift=-0.025+0.009*hold)
        self.face(pitch=-0.20*hold, jaw=0.045*hold)
        self.rotate("Bone_010", "X", -0.025*hold)
        self.planted()

    def look(self, phase):
        wave = math.sin(TAU*phase)*math.sin(math.pi*phase)**2
        self.body(lift=-0.025)
        self.face(pitch=-0.025*math.sin(math.pi*phase)**2, yaw=0.24*wave)
        self.planted()

    def graze(self, phase):
        hold = smoother(phase/0.36)*(1-smoother((phase-0.72)/0.28))
        self.body(lift=-0.12*hold, forward=0.015*hold)
        self.rotate("Bone_010", "X", 0.09*hold)
        self.face(pitch=0.70*hold, yaw=0.025*math.sin(2*TAU*phase)*hold,
                  jaw=0.025*(0.5+0.5*math.sin(5*TAU*phase))*hold)
        self.planted()

    def death(self, phase):
        drop = smoother(phase/0.78)
        self.body(lift=-0.43*drop, side=0.08*drop)
        self.rotate("Bone_000", "Y", 1.48*smoother((phase-0.10)/0.68))
        self.face(pitch=0.10*drop, yaw=-0.04*drop)
        release = smoother((phase-0.24)/0.61)
        for leg in ("front_left", "hind_left"):
            upper, knee, hock, foot = self.legs[leg]
            self.rotate(upper, "Y", -0.72*release)
            self.rotate(knee, "Y", -0.30*release)
            self.rotate(hock, "Y", -0.07*release)
            self.rotate(foot, "Y", 0.10*smoother((phase-0.42)/0.43))
        self.settle_floor()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    rig = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and any(m.type == "ARMATURE" for m in obj.modifiers)]
    if len(meshes) != 1 or len(rig.data.bones) != 52:
        raise RuntimeError("Unexpected native buffalo topology")
    rig.animation_data_create()
    bpy.context.scene.render.fps = 60
    author = BuffaloAuthor(rig, meshes[0], LEGS)
    author.bake("Buffalo_Idle", 3.2, author.idle, True)
    author.bake("Buffalo_CombatIdle", 2.4, lambda p: author.idle(p, True), True)
    for name, cfg in GAITS.items():
        author.bake(f"Buffalo_{name.title()}", cfg["duration"], lambda p, n=name: author.gait(p, n), True)
    author.bake("Buffalo_HornLeft", 1.3, lambda p: author.horn_strike(p, -1))
    author.bake("Buffalo_HornRight", 1.3, lambda p: author.horn_strike(p, 1))
    author.bake("Buffalo_Charge", 1.5, lambda p: author.horn_strike(p, 0, True))
    author.bake("Buffalo_Hit", 0.55, author.hit)
    author.bake("Buffalo_Death", 1.6, author.death)
    author.bake("Buffalo_Bellow", 2.4, author.bellow)
    author.bake("Buffalo_AlertLook", 2.4, author.look)
    author.bake("Buffalo_Graze", 3.4, author.graze)
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    author.reset()
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    meshes[0]["source"] = "Owner-supplied Smart Rig buffalo; native geometry, skin weights and PBR maps"
    meshes[0]["source_sha256"] = digest
    export_glb(OUTPUT, rig, meshes)
    report = {"source_sha256": digest, "bones": 52, "height": HEIGHT, "gaits": GAITS, "clips": author.clip_reports,
              "walkRef": GAITS["walk"]["stride"]/(GAITS["walk"]["duration"]*GAITS["walk"]["stance"])*HEIGHT/1.7,
              "runRef": GAITS["run"]["stride"]/(GAITS["run"]["duration"]*GAITS["run"]["stance"])*HEIGHT/1.7}
    OUTPUT.with_suffix(".json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf8")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
