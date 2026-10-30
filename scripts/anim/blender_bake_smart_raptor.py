"""Bake native biped dinosaur motion, using the owner's Velociraptor timing reference.

No facial pseudo-jaw: the supplied open mouth and its teeth move as one skull.
Four native hind segments, arm arcs and delayed tail balance are baked offline.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from animal_motion_curves import attack_step, smoother, swing
from blender_bake_meshy_titan import export_glb
from native_animal_bind import NativeDigitigradeAuthor, commit_bind, probe_bake

SOURCE = ROOT.parent / 'bible/models/mobs/animals/raptor.glb'
OUTPUT = ROOT / 'tmp/asset_src/animals/smart_raptor/smart_raptor.glb'
HEIGHT, TAU = 2.1, 2*math.pi
LEGS = {'hind_left': ('Bone_016', 'Bone_015', 'Bone_014', 'Bone_012'),
        'hind_right': ('Bone_010', 'Bone_009', 'Bone_008', 'Bone_006')}
FETLOCKS = {'hind_left': 'Bone_013', 'hind_right': 'Bone_007'}
ARMS = {-1: ('Bone_033', 'Bone_032', 'Bone_031'), 1: ('Bone_038', 'Bone_037', 'Bone_036')}
GAITS = {'walk': {'duration': 1.50, 'stride': .62, 'stance': .66, 'lift': .13},
         'run': {'duration': .55, 'stride': .68, 'stance': .46, 'lift': .16}}


def envelope(phase, start, rise, fall, end):
    return smoother((phase-start)/rise)*(1-smoother((phase-fall)/(end-fall)))


class RaptorAuthor(NativeDigitigradeAuthor):
    def __init__(self, rig, mesh):
        super().__init__(rig, mesh, LEGS, FETLOCKS)
        self.wrists = {side: self.rest[chain[2]].translation.copy() for side, chain in ARMS.items()}

    def face(self, pitch=0, yaw=0):
        # Every skull and tooth group descends from this neck chain. In
        # particular Bone_024/025 are not an independent mandible joint.
        self.rotate('Bone_029', 'X', pitch*.6)
        self.rotate('Bone_028', 'X', pitch*.4)
        self.rotate('Bone_029', 'Z', yaw)

    def tail(self, phase, strength=.04, balance=0):
        for index, bone in enumerate(('Bone_023', 'Bone_022', 'Bone_021', 'Bone_020', 'Bone_019')):
            self.rotate(bone, 'Z', strength*math.sin(TAU*phase-index*.4)-balance/(index+2))
            self.rotate(bone, 'X', .012*math.sin(TAU*phase-index*.5))

    def arm(self, side, delta, roll=0):
        upper, elbow, wrist = ARMS[side]
        start = self.bones[upper].head.copy()
        target = self.wrists[side]+delta
        a = (self.bones[elbow].head-start).length
        b = (self.bones[wrist].head-self.bones[elbow].head).length
        vector = target-start
        direction = vector.normalized()
        distance = min(a+b-.008, max(abs(a-b)+.008, vector.length))
        # Claws remain within reach even during the circular crossing stroke.
        self.reach_clamp = max(self.reach_clamp, abs(distance-vector.length))
        along = (a*a-b*b+distance*distance)/(2*distance)
        pole = Vector((side*.6, .3, -.5))
        pole -= direction*pole.dot(direction)
        bend = start+direction*along+pole.normalized()*math.sqrt(max(0, a*a-along*along))
        self.aim(upper, elbow, bend)
        self.aim(elbow, wrist, start+direction*distance)
        matrix = self.rest[wrist].copy()
        matrix.translation = self.bones[wrist].head.copy()
        self.bones[wrist].matrix = matrix
        self.update()
        self.rotate(wrist, 'Y', side*roll)

    def idle(self, phase, ready=False):
        beat = TAU*phase
        self.body(lift=-.075+(.006 if not ready else .009)*math.sin(beat), forward=.025 if ready else 0)
        self.rotate('Bone_004', 'X', .015*math.sin(beat-.4))
        self.face(-.04 if ready else .012*math.sin(beat-.8), .015*math.sin(beat-1.1))
        self.tail(phase, .025)
        for side in ARMS:
            self.arm(side, Vector((0, -.025 if ready else 0, .008*math.sin(beat-.5))))
        self.planted()

    def gait(self, phase, name):
        cfg = GAITS[name]
        run, beat = name == 'run', TAU*phase
        self.body(lift=(-.13 if run else -.105)+(.025 if run else .016)*math.cos(2*beat),
                  side=(.012 if run else .025)*math.sin(beat))
        self.rotate('Bone_000', 'X', (.025 if run else .012)*math.sin(2*beat-.3))
        self.rotate('Bone_004', 'Z', .018*math.sin(beat-.3))
        self.face((.04 if run else .02)*math.sin(2*beat-1.0), -.02*math.sin(beat-.6))
        self.tail(phase, .055 if run else .04)
        for leg, offset in (('hind_left', 0), ('hind_right', .5)):
            u = (phase+offset) % 1
            target = self.feet[leg].copy()
            pitch = 0
            if u < cfg['stance']:
                forward = cfg['stride']*(.5-u/cfg['stance'])
            else:
                v = (u-cfg['stance'])/(1-cfg['stance'])
                forward, arch = swing(v, cfg['stride'], cfg['stance'])
                target.z += cfg['lift']*arch
                pitch = .20*math.sin(TAU*v)*arch
            target.y -= forward
            self.paw(leg, target, pitch)
        for side in ARMS:
            self.arm(side, Vector((side*.01*math.sin(beat), .035*side*math.sin(beat-.6),
                                   .018*math.sin(2*beat-.8))))

    def slash(self, phase, side=-1, pounce=False):
        load = envelope(phase, 0, .3, .55, 1)
        drive = envelope(phase, .27, .25, .64, 1)
        recover = envelope(phase, .57, .20, .80, 1)
        air = envelope(phase, .22, .17, .66, .84) if pounce else 0
        kick = envelope(phase, .36, .18, .64, .88) if pounce else 0
        jump = .36*air
        turn = side*(.12*load-.23*drive)
        self.body(lift=-.075-.085*load+jump,
                  forward=-.055*load+(.26 if pounce else .17)*drive,
                  side=side*(.018*load-.035*drive))
        self.rotate('Bone_004', 'X', .10*drive)
        self.rotate('Bone_004', 'Z', turn)
        self.face(.12*drive-.08*load, -turn*.55)
        self.tail(phase, .02*load, turn)
        for current in ARMS:
            active = pounce or current == side
            if active:
                # Lift outward, then draw a rounded descending diagonal through
                # contact. The recovery trails the torso instead of snapping.
                x = current*(.13*load-.20*drive+.025*recover)
                forward = -.09*load+.24*drive-.02*recover
                lift = .23*load-.10*drive-.035*recover+jump
                self.arm(current, Vector((x, -forward, lift)), .38*drive-.15*load)
            else:
                self.arm(current, Vector((0, .035*load, .035*load)))
        advance = envelope(phase, .12, .36, .70, 1)
        for leg, anchor in self.feet.items():
            target = anchor.copy()
            pitch = 0
            active = pounce or ('left' in leg) == (side < 0)
            if pounce:
                # Both hind claws leave the floor with the pelvis, tuck on
                # takeoff, and drive forward through contact before landing.
                target.y -= .58*kick
                target.z += jump+.065*air
                self.paw(leg, target, -.28*kick)
                continue
            if active:
                target.y -= .15*advance
                for start, end in ((.12, .48), (.70, 1)):
                    if start < phase < end:
                        target.z += .13*math.sin(math.pi*(phase-start)/(end-start))**3
            else:
                step, clearance, pitch = attack_step(phase, .11, .085, start=.39, plant=.67, release=.81)
                target += Vector((0, -step, clearance))
            self.paw(leg, target, pitch)

    def tail_whip(self, phase):
        load = envelope(phase, 0, .30, .56, 1)
        strike = envelope(phase, .29, .24, .65, 1)
        turn = .20*load-.32*strike
        forward = -.035*load+.08*strike
        self.body(lift=-.075-.04*load, forward=forward)
        self.rotate('Bone_000', 'Z', turn)
        self.rotate('Bone_004', 'Z', -.12*load+.18*strike)
        self.face(.06*load, -turn*.6)
        tail = ('Bone_023', 'Bone_022', 'Bone_021', 'Bone_020', 'Bone_019', 'Bone_018')
        for index, bone in enumerate(tail):
            delay = index*.018
            coil = envelope(phase, .02+delay, .23, .45+delay, 1)
            whip = envelope(phase, .28+delay, .19, .67+delay, 1)
            self.rotate(bone, 'Z', .11*coil-.22*whip)
            self.rotate(bone, 'X', .025*strike)
        for leg, anchor in self.feet.items():
            delay = .06 if 'left' in leg else 0
            step, clearance, pitch = attack_step(
                phase, .08, .095, start=.16+delay, plant=.43+delay, release=.76+delay/2)
            self.paw(leg, anchor+Vector((0, -step, clearance)), pitch)
        # Arms counterbalance the pelvis turn; their targets turn with the
        # body, retaining the native reach instead of stretching the wrists.
        pivot = self.rest['Bone_000'].translation
        rotation = Matrix.Rotation(turn, 3, 'Z')
        for side in ARMS:
            turned = pivot+rotation @ (self.wrists[side]-pivot)
            self.arm(side, turned-self.wrists[side]+Vector((0, -forward, .03*load)))

    def hit(self, phase):
        hit = math.sin(math.pi*smoother(phase))
        self.body(lift=-.075-.065*hit, forward=-.045*hit)
        self.face(-.16*hit, .11*hit)
        self.planted()

    def look(self, phase):
        hold = math.sin(math.pi*phase)**2
        yaw = .30*math.sin(TAU*phase)*hold
        self.body(lift=-.075)
        self.face(-.06*hold, yaw)
        self.tail(phase, .02*hold, yaw*.3)
        self.planted()

    def threat(self, phase):
        hold = envelope(phase, 0, .30, .70, 1)
        self.body(lift=-.075+.04*hold)
        self.face(-.19*hold, .035*math.sin(2*TAU*phase)*hold)
        self.tail(phase, .045*hold)
        for side in ARMS:
            self.arm(side, Vector((side*.06*hold, -.03*hold, .09*hold)), .18*hold)
        self.planted()

    def death(self, phase):
        drop = smoother(phase/.82)
        release = smoother((phase-.22)/.63)
        self.body(lift=-.48*drop, side=.08*drop)
        self.rotate('Bone_000', 'Y', 1.48*smoother((phase-.12)/.70))
        self.face(.16*drop, -.08*drop)
        for leg, (upper, knee, hock, foot) in LEGS.items():
            self.rotate(knee, 'X', -.24*drop)
            self.rotate(hock, 'X', .10*drop)
            if 'left' in leg:
                self.rotate(upper, 'Y', -.62*release)
                self.rotate(knee, 'Y', -.25*release)
                self.rotate(FETLOCKS[leg], 'Y', -.10*release)
        for side, (upper, elbow, wrist) in ARMS.items():
            self.rotate(upper, 'Y', (-.65 if side < 0 else -.12)*release)
            self.rotate(elbow, 'Y', -.18*release)
            self.rotate(wrist, 'X', .15*release)
        self.rotate('Bone_022', 'Z', -.10*release)
        # The source tail curves sideways and rises after a flank roll. Let
        # each native link settle toward the floor rather than holding it up.
        tail = ('Bone_023', 'Bone_022', 'Bone_021', 'Bone_020', 'Bone_019', 'Bone_018', 'Bone_017')
        for parent, child in zip(tail, tail[1:]):
            origin = self.bones[parent].head.copy()
            vector = self.bones[child].head-origin
            settled = Vector((vector.x, vector.y, vector.z*(1-release)-.40*vector.length*release))
            self.aim(parent, child, origin+settled.normalized()*vector.length)
        self.settle_floor()


def normalize_stance(rig, mesh):
    author = RaptorAuthor(rig, mesh)
    author.phase = 0
    author.body(lift=-.035)
    center = (author.bones['Bone_016'].head+author.bones['Bone_010'].head)*.5
    for leg in LEGS:
        target = Vector((center.x+(-.29 if 'left' in leg else .29), -.2864, .045))
        author.paw(leg, target)
    report = {'reach_clamp': author.reach_clamp}
    commit_bind(rig, mesh, 'Bone_004')
    return report


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
    if len(meshes) != 1 or len(rig.data.bones) != 64:
        raise RuntimeError('Unexpected native raptor topology')
    mesh = meshes[0]
    normalization = normalize_stance(rig, mesh)
    rig.animation_data_create()
    bpy.context.scene.render.fps = 60
    author = RaptorAuthor(rig, mesh)
    if '--probe' in sys.argv:
        author.bake = lambda *args: probe_bake(author, *args)
    author.bake('Raptor_Idle', 2.5, author.idle, True)
    author.bake('Raptor_CombatIdle', 2, lambda p: author.idle(p, True), True)
    for name, cfg in GAITS.items():
        author.bake(f'Raptor_{name.title()}', cfg['duration'], lambda p, n=name: author.gait(p, n), True)
    author.bake('Raptor_SlashLeft', 1.10, lambda p: author.slash(p, -1))
    author.bake('Raptor_SlashRight', 1.10, lambda p: author.slash(p, 1))
    author.bake('Raptor_Pounce', 1.30, lambda p: author.slash(p, 0, True))
    author.bake('Raptor_TailWhip', 1.35, author.tail_whip)
    author.bake('Raptor_Hit', .45, author.hit)
    author.bake('Raptor_Death', 1.45, author.death)
    author.bake('Raptor_AlertLook', 2, author.look)
    author.bake('Raptor_Threat', 2, author.threat)
    if '--probe' in sys.argv:
        print(json.dumps({'normalization': normalization, 'clips': author.clip_reports}), flush=True)
        return
    if any(r['reach_clamp'] > .004 for r in author.clip_reports.values()):
        raise RuntimeError('Raptor motion exceeds native limb reserve')
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    author.reset()
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    mesh['source_sha256'] = digest
    mesh['source'] = 'Owner native raptor; normalized stance; baked biped motion'
    export_glb(OUTPUT, rig, meshes)
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    author.reset()
    author.idle(.5/2.5)
    evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    values = [(evaluated.matrix_world @ v.co).z for v in evaluated.data.vertices]
    idle_height = max(values)-min(values)
    report = {'source_sha256': digest, 'bones': 64, 'height': HEIGHT, 'idle_height': idle_height,
              'normalization': normalization, 'gaits': GAITS, 'clips': author.clip_reports}
    for name in GAITS:
        cfg = GAITS[name]
        report[f'{name}Ref'] = cfg['stride']/(round(cfg['duration']*60)/60*cfg['stance'])*HEIGHT/idle_height
    OUTPUT.with_suffix('.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
