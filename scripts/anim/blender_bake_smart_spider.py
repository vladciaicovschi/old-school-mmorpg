"""Author eight-legged motion on the supplied spider's original Smart Rig.

Run Blender --background --factory-startup --python this_file.py. The source
has no donor animation. FABRIK runs offline on the measured six-bone legs,
preserving their lengths, native bend shapes, geometry and skin weights.
Output still requires smart_spider.json and the KTX2 texture compressor.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import export_glb
from native_quadruped_author import NativeQuadrupedAuthor

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT.parent / "bible/models/mobs/comunity/spider.glb"
OUTPUT = ROOT / "tmp/asset_src/animals/smart_spider/smart_spider.glb"
# Front to back on each side. Source forward is Blender -Y / glTF +Z.
LEGS = {"R0": 11, "R1": 47, "R2": 29, "R3": 53,
        "L0": 17, "L1": 23, "L2": 41, "L3": 35}
# Quaternius Spider_Walk is 0.833s with alternating tetrapods and little body
# bob. The new rig needs its own faster, longer-stride sprint for game speeds.
WALK = {"duration": 5/6, "stride": 1.0, "stance": 0.56, "lift": 0.23}
RUN = {"duration": 0.25, "stride": 1.5, "stance": 0.55, "lift": 0.31}
HEIGHT = 0.85


def smooth(a, b, p):
    p = max(0.0, min(1.0, (p-a)/(b-a)))
    return p*p*(3-2*p)


class SpiderAuthor(NativeQuadrupedAuthor):
    def __init__(self, rig, mesh):
        super().__init__(rig, mesh, {})
        self.chains = {leg: [f"Bone_{n:03d}" for n in range(top, top-6, -1)]
                       for leg, top in LEGS.items()}
        self.anchors = {leg: self.bones[chain[-1]].tail.copy()
                        for leg, chain in self.chains.items()}
        self.max_contact_error = 0.0

    def leg(self, leg, target):
        chain = self.chains[leg]
        points = [self.bones[n].head.copy() for n in chain]
        points.append(self.bones[chain[-1]].tail.copy())
        rest = [p.copy() for p in points]
        lengths = [(points[i+1]-points[i]).length for i in range(6)]
        origin = points[0].copy()
        if (target-origin).length >= sum(lengths)-0.01:
            raise RuntimeError(f"Unreachable spider foot: {leg}, phase {self.phase}")
        # Seed with this frame's transformed rest shape, never the previous
        # frame: baking is deterministic and both loop endpoints solve alike.
        for _ in range(60):
            points[-1] = target.copy()
            for i in range(5, -1, -1):
                points[i] = points[i+1] + (points[i]-points[i+1]).normalized()*lengths[i]
            points[0] = origin.copy()
            for i in range(6):
                points[i+1] = points[i] + (points[i+1]-points[i]).normalized()*lengths[i]
            if (points[-1]-target).length < 0.00005:
                break
        self.max_contact_error = max(self.max_contact_error, (points[-1]-target).length)
        for i, name in enumerate(chain):
            q = (rest[i+1]-rest[i]).rotation_difference(points[i+1]-points[i])
            matrix = q.to_matrix().to_4x4() @ self.rest[name]
            matrix.translation = points[i]
            self.bones[name].matrix = matrix
            self.update()

    def planted(self, overrides=None):
        for leg, anchor in self.anchors.items():
            self.leg(leg, (overrides or {}).get(leg, anchor))

    def idle(self, p, combat=False):
        wave = math.sin(p*math.tau)
        self.body(lift=0.012*wave, forward=0.025 if combat else 0)
        self.rotate("Bone_005", "X", 0.016*wave)
        self.rotate("Bone_003", "X", -0.055 if combat else 0.015*wave)
        for name, side in [("Bone_057", -1), ("Bone_061", 1)]:
            self.rotate(name, "Z", side*(0.025*math.sin(p*math.tau*2)+ (0.08 if combat else 0)))
        self.planted()

    def gait(self, p, config):
        self.body(lift=0.022*math.sin(p*math.tau*2), side=0.025*math.sin(p*math.tau))
        self.rotate("Bone_005", "Z", 0.018*math.sin(p*math.tau))
        for leg, anchor in self.anchors.items():
            # Alternating tetrapods, with a slight rear-to-front wave. At
            # least four legs support the body throughout a stride.
            rank = int(leg[1])
            offset = ((rank % 2)*0.5 + (0.5 if leg[0] == "L" else 0)) % 1
            phase = (p+offset) % 1
            stance = config["stance"]
            target = anchor.copy()
            if phase < stance:
                target.y += config["stride"]*(phase/stance-0.5)
            else:
                t = (phase-stance)/(1-stance)
                ease = t-math.sin(t*math.tau)/math.tau
                target.y += config["stride"]*(0.5-ease)
                target.z += config["lift"]*math.sin(math.pi*t)**2
            self.leg(leg, target)
        self.rotate("Bone_003", "X", 0.025*math.sin(p*math.tau*2))

    def attack(self, p, heavy=False):
        prepare = smooth(0, 0.30, p)*(1-smooth(0.30, 0.48, p))
        strike = smooth(0.30, 0.48, p)*(1-smooth(0.48, 1, p))
        self.body(lift=0.09*prepare-0.07*strike,
                  forward=-0.13*prepare+(0.43 if heavy else 0.30)*strike)
        self.rotate("Bone_003", "X", -0.16*prepare+0.20*strike)
        self.rotate("Bone_005", "X", 0.06*prepare-0.05*strike)
        for name, side in [("Bone_057", -1), ("Bone_061", 1)]:
            self.rotate(name, "Z", side*(0.25*prepare-0.13*strike))
        targets = {}
        for leg in ("L0", "R0"):
            target = self.anchors[leg].copy()
            target.z += (0.60 if heavy else 0.36)*prepare+0.14*strike
            target.y -= 0.20*strike
            targets[leg] = target
        self.planted(targets)

    def hit(self, p):
        pulse = math.sin(math.pi*smooth(0, 1, p))
        self.body(lift=-0.10*pulse, forward=-0.16*pulse)
        self.rotate("Bone_003", "X", -0.13*pulse)
        self.planted()

    def death(self, p):
        fall = smooth(0.08, 0.68, p)
        curl = smooth(0.25, 0.92, p)
        self.body(lift=-0.68*fall)
        self.rotate("Bone_005", "X", 0.11*fall)
        self.rotate("Bone_003", "X", 0.18*fall)
        for leg, anchor in self.anchors.items():
            target = anchor.copy()
            target.x *= 1-0.39*curl
            target.y *= 1-0.31*curl
            target.z += 0.06*curl
            self.leg(leg, target)
        # Ground the actual deformed corpse, including abdomen and mandibles.
        self.settle_floor()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
    if len(rig.data.bones) != 62 or len(mesh.data.polygons) != 103844:
        raise RuntimeError("Unexpected supplied spider topology")
    rig.animation_data_create()
    bpy.context.scene.render.fps = 60
    author = SpiderAuthor(rig, mesh)
    for name, duration, pose, loop in [
        ("Spider_Idle", 3.2, author.idle, True),
        ("Spider_CombatIdle", 2.4, lambda p: author.idle(p, True), True),
        ("Spider_Walk", WALK["duration"], lambda p: author.gait(p, WALK), True),
        ("Spider_Run", RUN["duration"], lambda p: author.gait(p, RUN), True),
        ("Spider_Bite", 0.9, author.attack, False),
        ("Spider_Lunge", 1.1, lambda p: author.attack(p, True), False),
        ("Spider_Hit", 0.42, author.hit, False),
        ("Spider_Death", 1.4, author.death, False),
    ]:
        author.bake(name, duration, pose, loop=loop)
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    author.reset()
    mesh["source"] = "Owner-supplied spider Smart Rig; original geometry, weights and PBR maps"
    mesh["source_sha256"] = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    export_glb(OUTPUT, rig, [mesh])
    report = {"source": str(SOURCE), "source_sha256": mesh["source_sha256"],
              "bones": 62, "triangles": 103844, "walk": WALK, "run": RUN,
              "max_contact_error": author.max_contact_error, "height": HEIGHT,
              "walkRef": WALK["stride"]/(WALK["duration"]*WALK["stance"])*HEIGHT/1.7,
              "runRef": RUN["stride"]/(RUN["duration"]*RUN["stance"])*HEIGHT/1.7}
    OUTPUT.with_suffix(".json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf8")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
