"""Bake the owner's native winged imp, with airborne legs and grounded death.

Wing roots carry the stroke; small delayed outer-joint motion preserves the
membrane. No jaw imitation, reskinning, body scaling or runtime solver is used.
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
from animal_motion_curves import smoother
from blender_bake_meshy_titan import export_glb
from native_quadruped_author import NativeQuadrupedAuthor

SOURCE = ROOT.parent / 'bible/models/mobs/meshy_smart_rig/imp.glb'
OUTPUT = ROOT / 'tmp/asset_src/meshy_smart_rig/smart_imp/smart_imp.glb'
HEIGHT, HOVER, TAU = 1.65, .60, math.tau
WINGS = {1: ('Bone_040', 'Bone_039', 'Bone_038'), -1: ('Bone_043', 'Bone_042', 'Bone_041')}
ARMS = {1: ('Bone_031', 'Bone_030', 'Bone_029'), -1: ('Bone_036', 'Bone_035', 'Bone_034')}
LEGS = {1: ('Bone_010', 'Bone_009', 'Bone_008', 'Bone_007'),
        -1: ('Bone_015', 'Bone_014', 'Bone_013', 'Bone_012')}
TAIL = ('Bone_021', 'Bone_020', 'Bone_019', 'Bone_018', 'Bone_017', 'Bone_016')


def envelope(p, start=0, rise=.28, fall=.65, end=1):
    return smoother((p-start)/rise)*(1-smoother((p-fall)/(end-fall)))


class ImpAuthor(NativeQuadrupedAuthor):
    def __init__(self, rig, mesh):
        super().__init__(rig, mesh, {})
        self.wrists = {side: self.rest[chain[2]].translation.copy() for side, chain in ARMS.items()}
        self.death_floor = 0

    def face(self, pitch=0, yaw=0):
        self.rotate('Bone_025', 'X', pitch)
        self.rotate('Bone_025', 'Z', yaw)

    def wing_stroke(self, cycle, amplitude=1, fold=0, bank=0):
        # Slightly faster downstroke and slower recovery. Quintic extrema
        # avoid abrupt reversal without making the membrane rigidly sinusoidal.
        u = cycle % 1
        stroke = (-.56+1.12*smoother(u/.43)) if u < .43 else (.56-1.12*smoother((u-.43)/.57))
        for side, (root, elbow, tip) in WINGS.items():
            self.rotate(root, 'Y', side*(amplitude*stroke+.10)+bank)
            self.rotate(root, 'Z', side*fold)
            self.rotate(elbow, 'Y', side*.10*amplitude*math.sin(TAU*(cycle-.10)))
            self.rotate(elbow, 'Z', side*(.07*math.sin(TAU*(cycle-.16))+.15*fold))
            self.rotate(tip, 'Y', side*.045*amplitude*math.sin(TAU*(cycle-.18)))

    def tuck_legs(self, cycle=0, tuck=1, bank=0):
        for side, (hip, knee, hock, foot) in LEGS.items():
            lag = math.sin(TAU*cycle-side*.28)
            self.rotate(hip, 'X', -.28*tuck+.025*lag)
            self.rotate(hip, 'Y', side*.045*tuck+.03*bank)
            self.rotate(knee, 'X', 1.00*tuck+.045*lag)
            self.rotate(hock, 'X', -.30*tuck-.025*lag)
            self.rotate(foot, 'X', -.10*tuck)

    def tail(self, cycle=0, strength=1, bank=0):
        for i, bone in enumerate(TAIL[:-1]):
            self.rotate(bone, 'X', .025*strength*math.sin(TAU*cycle-i*.45))
            self.rotate(bone, 'Z', .04*strength*math.sin(TAU*cycle-i*.5)-bank/(i+3))

    def arm(self, side, delta, roll=0):
        upper, elbow, wrist = ARMS[side]
        target = self.wrists[side]+Vector((-side*.055, -.09, .06))+delta
        start = self.bones[upper].head.copy()
        a = (self.bones[elbow].head-start).length
        b = (self.bones[wrist].head-self.bones[elbow].head).length
        vector = target-start
        direction = vector.normalized()
        distance = min(a+b-.006, max(abs(a-b)+.006, vector.length))
        if abs(distance-vector.length) > self.reach_clamp:
            self.reach_clamp = abs(distance-vector.length)
            self.reach_leg, self.reach_phase = f'arm_{side}', self.phase
        self.fold_margin = min(self.fold_margin, distance-abs(a-b))
        along = (a*a-b*b+distance*distance)/(2*distance)
        pole = Vector((side*.8, .5, -.4))
        pole -= direction*pole.dot(direction)
        bend = start+direction*along+pole.normalized()*math.sqrt(max(0, a*a-along*along))
        self.aim(upper, elbow, bend)
        self.aim(elbow, wrist, start+direction*distance)
        matrix = self.rest[wrist].copy()
        matrix.translation = self.bones[wrist].head.copy()
        self.bones[wrist].matrix = matrix
        self.update()
        self.rotate(wrist, 'Y', side*roll)

    def flight(self, phase, beats=4, ready=False, fast=False):
        cycle = beats*phase
        beat = TAU*cycle
        bank = (.025 if fast else .012)*math.sin(TAU*phase)
        self.body(lift=.025*math.sin(beat-.9)+.008*math.sin(TAU*phase),
                  side=.012*math.sin(TAU*phase))
        self.rotate('Bone_000', 'X', .15 if fast else .035)
        self.rotate('Bone_004', 'X', .012*math.sin(beat-.5))
        self.rotate('Bone_003', 'Z', bank)
        self.face(pitch=-(.14 if fast else .025)+.015*math.sin(beat-1.1),
                  yaw=.02*math.sin(TAU*phase-.5))
        self.wing_stroke(cycle, 1.08 if fast else 1, .09 if fast else 0, bank)
        self.tuck_legs(cycle, 1.12 if fast else 1, bank)
        self.tail(phase, bank=bank)
        for side in ARMS:
            self.arm(side, Vector((0, -.025 if ready else 0, .008*math.sin(beat-.8))))

    def attack(self, phase, side=-1, dive=False):
        cycle = 2*phase
        load = envelope(phase, rise=.30)
        drive = envelope(phase, .27, .25, .65)
        follow = envelope(phase, .52, .22, .78)
        turn = side*(.07*load-.16*drive)
        self.body(lift=.035*load-.07*drive,
                  forward=-.025*load+(.19 if dive else .10)*drive)
        self.rotate('Bone_000', 'X', (.20 if dive else .08)*drive)
        self.rotate('Bone_004', 'Z', turn)
        self.face(pitch=-.06*load+.06*follow, yaw=-.45*turn)
        self.wing_stroke(cycle, 1-.40*drive, .14*load+(.25 if dive else .09)*drive, -.08*turn)
        self.tuck_legs(cycle, 1+.12*load)
        self.tail(cycle/2, bank=turn)
        for current in ARMS:
            active = dive or current == side
            if active:
                self.arm(current, Vector((current*(.075*load-.11*drive),
                                          .045*load-.155*drive,
                                          .10*load-.065*drive-.015*follow)),
                         -.12*load+.35*drive)
            else:
                self.arm(current, Vector((0, .025*load, .015*load)))

    def hit(self, phase):
        recoil = math.sin(math.pi*smoother(phase))
        self.body(lift=-.055*recoil, forward=-.06*recoil)
        self.rotate('Bone_004', 'X', -.14*recoil)
        self.face(-.10*recoil, .09*recoil)
        self.wing_stroke(phase, 1-.25*recoil)
        self.tuck_legs(phase, 1+.12*recoil)
        self.tail(phase, .5)
        for side in ARMS:
            self.arm(side, Vector((side*.025*recoil, .02*recoil, .025*recoil)))

    def gesture(self, phase, threat=False):
        hold = envelope(phase)
        self.flight(phase)
        self.face(-.14*hold if threat else -.035*hold,
                  .035*math.sin(2*TAU*phase)*hold if threat else .28*math.sin(TAU*phase)*hold)
        if threat:
            for side in ARMS:
                self.arm(side, Vector((side*.045*hold, -.035*hold, .065*hold)), .20*hold)

    def cast(self, phase, release=False):
        cycle = 2*phase
        charge = 1-smoother((phase-.42)/.58) if release else 1
        thrust = envelope(phase, .12, .24, .48, .90) if release else 0
        beat = TAU*cycle
        self.body(lift=.018*math.sin(beat-.9)-.025*thrust,
                  forward=-.015*charge+.08*thrust)
        self.rotate('Bone_004', 'X', -.025*charge+.07*thrust)
        self.face(pitch=-.04*charge+.035*thrust)
        self.wing_stroke(cycle, 1-.12*thrust, .04*charge)
        self.tuck_legs(cycle, 1+.06*thrust)
        self.tail(phase, .6)
        for side, (_, _, wrist) in ARMS.items():
            # Cup both hands around a point in front of the chest, then send
            # them forward together. The wings keep supplying lift throughout.
            pulse = .006*math.sin(TAU*phase)*charge
            self.arm(side, Vector((-side*(.18*charge-.03*thrust),
                                   -.079*charge-.175*thrust,
                                   .12*charge+.06*thrust+pulse)),
                     .45*charge-.15*thrust)
            self.rotate(wrist, 'X', -.70*charge-.10*thrust)

    def death(self, phase):
        drop = smoother((phase-.10)/.62)
        release = smoother((phase-.28)/.57)
        self.body(lift=-1.0*drop, forward=.08*drop)
        self.tuck_legs(0, 1-.40*release)
        self.face(.14*drop, -.10*drop)
        self.wing_stroke(phase*2*(1-release), 1-release, 1.15*release)
        for side, (_, elbow, _) in ARMS.items():
            self.rotate(elbow, 'X', -.25*release)
        self.rotate('Bone_000', 'Y', 1.30*smoother((phase-.16)/.62))
        # The upper arm and shin release under gravity after the body rolls.
        self.rotate('Bone_036', 'Y', -.48*release)
        self.rotate('Bone_035', 'Y', -.18*release)
        self.rotate('Bone_015', 'Y', -.45*release)
        self.rotate('Bone_014', 'Y', -.18*release)
        # The upper wing settles onto the flank rather than remaining raised
        # in its flight plane after the roll. Preserve both native link lengths.
        for parent, child in zip(WINGS[-1], WINGS[-1][1:]):
            origin = self.bones[parent].head.copy()
            v = self.bones[child].head-origin
            target = Vector((v.x, v.y, v.z*(1-release)-.05*v.length*release))
            self.aim(parent, child, origin+target.normalized()*v.length)
        for parent, child in zip(TAIL, TAIL[1:]):
            origin = self.bones[parent].head.copy()
            v = self.bones[child].head-origin
            target = Vector((v.x, v.y, v.z*(1-release)-.24*v.length*release))
            self.aim(parent, child, origin+target.normalized()*v.length)
        evaluated = self.mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        floor = min((evaluated.matrix_world @ Vector(c)).z for c in evaluated.bound_box)
        if floor < self.death_floor:
            self.body(lift=self.death_floor-floor+.001)
        elif phase > .80:
            self.body(lift=(self.death_floor-floor)*smoother((phase-.80)/.10))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
    if len(meshes) != 1 or len(rig.data.bones) != 56:
        raise RuntimeError('Unexpected native imp topology')
    rig.animation_data_create()
    bpy.context.scene.render.fps = 60
    author = ImpAuthor(rig, meshes[0])
    author.phase = 0
    author.flight(.5/2.4)
    evaluated = meshes[0].evaluated_get(bpy.context.evaluated_depsgraph_get())
    values = [(evaluated.matrix_world @ v.co).z for v in evaluated.data.vertices]
    idle_floor, idle_height = min(values), max(values)-min(values)
    author.death_floor = idle_floor-HOVER*idle_height/HEIGHT
    author.reset()
    if '--casts-only' in sys.argv:
        author.bake('Imp_Cast', 1.2, author.cast, True)
        author.bake('Imp_CastRelease', 1.2, lambda p: author.cast(p, True))
        if any(r['reach_clamp'] > .004 for r in author.clip_reports.values()):
            raise RuntimeError('Imp cast exceeds native arm reach')
        for track in rig.animation_data.nla_tracks:
            track.mute = False
        author.reset()
        export_glb(OUTPUT.with_name('smart_imp_cast.glb'), rig, meshes)
        OUTPUT.with_name('smart_imp_cast.json').write_text(json.dumps(author.clip_reports, indent=2)+'\n', encoding='utf8')
        return
    author.bake('Imp_Hover', 2.4, author.flight, True)
    author.bake('Imp_CombatHover', 1.8, lambda p: author.flight(p, 3, True), True)
    author.bake('Imp_Fly', 1.2, lambda p: author.flight(p, 2), True)
    author.bake('Imp_FlyFast', 1.0, lambda p: author.flight(p, 2, fast=True), True)
    author.bake('Imp_ClawLeft', 1.2, lambda p: author.attack(p, -1))
    author.bake('Imp_ClawRight', 1.2, lambda p: author.attack(p, 1))
    author.bake('Imp_Dive', 1.35, lambda p: author.attack(p, 0, True))
    author.bake('Imp_Hit', .60, author.hit)
    author.bake('Imp_Death', 1.8, author.death)
    author.bake('Imp_Threat', 2.4, lambda p: author.gesture(p, True))
    author.bake('Imp_AlertLook', 2.4, author.gesture)
    author.bake('Imp_Cast', 1.2, author.cast, True)
    author.bake('Imp_CastRelease', 1.2, lambda p: author.cast(p, True))
    if any(r['reach_clamp'] > .004 for r in author.clip_reports.values()):
        raise RuntimeError('Imp arm gesture exceeds native reach')
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    meshes[0]['source_sha256'] = digest
    meshes[0]['source'] = 'Owner native Smart Rig imp; intact topology, skin and PBR maps'
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    author.reset()
    export_glb(OUTPUT, rig, meshes)
    report = {'source_sha256': digest, 'bones': 56, 'height': HEIGHT, 'hover': HOVER,
              'idle_height': idle_height, 'idle_floor': idle_floor,
              'death_floor': author.death_floor, 'clips': author.clip_reports}
    OUTPUT.with_suffix('.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
