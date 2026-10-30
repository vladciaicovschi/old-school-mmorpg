"""Bake a hovering wraith on the supplied intact replacement 68-bone Meshy humanoid.

Run Blender --background --factory-startup --python this_file.py. No source
clip exists. The two-hand lift/rake follows the unarmed bone-golem gesture,
but is authored on measured native chains instead of copying foreign tracks.
Lower limbs stay in their source pose in every clip, including death.
The output must pass community_ghost.json and the scoped KTX2 compressor.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import export_glb
from native_quadruped_author import NativeQuadrupedAuthor

SOURCE = ROOT.parent / 'bible/models/mobs/comunity/ghost.glb'
OUTPUT = ROOT / 'tmp/asset_src/community_ghost/community_ghost.glb'
HEIGHT, HOVER = 1.9, .28
SOURCE_HEIGHT = 1.7
SOURCE_SHA256 = 'f54059d80edc05c036dea96cdf855b09cb13c45591a415809c65c78ffed3d8f2'
# Native clavicles 022/027 stay in their source rest pose. These chains
# start at the upper arms and terminate at the actual wrist, not the elbow.
ARMS = {-1: ('Bone_026', 'Bone_025', 'Bone_024'),
        1: ('Bone_021', 'Bone_020', 'Bone_019')}
# Pelvis, central shroud chain and both artificial leg chains.
LOWER = tuple(f'Bone_{n:03d}' for n in range(1, 11))


def smooth(p):
    p = max(0, min(1, p))
    return p*p*p*(p*(p*6-15)+10)


def pulse(p, start, peak, end):
    return smooth((p-start)/(peak-start)) if p < peak else 1-smooth((p-peak)/(end-peak))


class GhostAuthor(NativeQuadrupedAuthor):
    def __init__(self, rig, mesh):
        super().__init__(rig, mesh, {})
        # Infer the measured frontal plane from the native upper arms. The
        # replacement is symmetric, facing Blender -Y before glTF export.
        right = self.rest[ARMS[1][0]].translation-self.rest[ARMS[-1][0]].translation
        right.z = 0
        self.right = right.normalized()
        self.forward = Vector((self.right.y, -self.right.x, 0))
        self.up = Vector((0, 0, 1))
        self.wrists = {side: self.rest[chain[2]].translation.copy() for side, chain in ARMS.items()}
        self.hand_quats = {side: self.rest[chain[2]].to_quaternion() for side, chain in ARMS.items()}
        self.lower_error = 0

    def delta(self, side=0, forward=0, up=0):
        return self.right*side+self.forward*forward+self.up*up

    def drift(self, lift=0, forward=0, side=0):
        root = self.bones['Bone_000']
        matrix = root.matrix.copy()
        matrix.translation += self.delta(side, forward, lift)
        root.matrix = matrix
        self.update()

    def arm(self, side, displacement):
        upper, elbow, wrist = ARMS[side]
        target = self.wrists[side]+displacement
        # Root bob and torso motion move the shoulder, while hand targets
        # follow the same body translation. No leg or cloth-chain IK is used.
        target += self.bones['Bone_000'].head-self.rest['Bone_000'].translation
        origin = self.bones[upper].head.copy()
        a = (self.bones[elbow].head-origin).length
        b = (self.bones[wrist].head-self.bones[elbow].head).length
        vector = target-origin
        direction = vector.normalized()
        distance = min(a+b-.006, max(abs(a-b)+.006, vector.length))
        self.reach_clamp = max(self.reach_clamp, abs(distance-vector.length))
        along = (a*a-b*b+distance*distance)/(2*distance)
        pole = self.delta(side*.65, -.35, -.5)
        pole -= direction*pole.dot(direction)
        bend = origin+direction*along+pole.normalized()*math.sqrt(max(0, a*a-along*along))
        self.aim(upper, elbow, bend)
        self.aim(elbow, wrist, origin+direction*distance)
        matrix = self.hand_quats[side].to_matrix().to_4x4()
        matrix.translation = self.bones[wrist].head.copy()
        self.bones[wrist].matrix = matrix
        self.update()

    def hover(self, p, ready=False, travel=False, fast=False):
        wave = math.sin(math.tau*p)
        self.drift(lift=.020*wave, side=.009*math.sin(math.tau*p))
        # Only upper spine/head move relative to the root. The robe's lower
        # section translates as a single hovering silhouette, never steps.
        self.rotate('Bone_013', 'X', .018*wave+(.035 if travel else 0))
        self.rotate('Bone_017', 'Z', .025*math.sin(math.tau*p))
        for side in ARMS:
            self.arm(side, self.delta(-side*(.055 if ready else .025),
                                       -.020 if ready else .010,
                                       (.050 if ready else .010)+.012*math.sin(math.tau*p+side*.5)))

    def attack(self, p, heavy=False):
        wind = pulse(p, 0, .31, .57)
        strike = pulse(p, .29, .53, 1)
        # Both claws gather upward, then rake forward and down together.
        # Root displacement is transient and returns to the exact hover base.
        self.drift(lift=.035*wind-.018*strike, forward=-.035*wind+.105*strike)
        self.rotate('Bone_013', 'X', -.08*wind+.11*strike)
        for side in ARMS:
            self.arm(side, self.delta(-side*(.14*wind+.16*strike),
                                      .035*wind+(.14 if heavy else .10)*strike,
                                      (.32 if heavy else .28)*wind+.01*strike))

    def hit(self, p):
        recoil = math.sin(math.pi*smooth(p))
        self.drift(lift=-.025*recoil, forward=-.07*recoil)
        self.rotate('Bone_013', 'X', -.12*recoil)
        self.rotate('Bone_017', 'Z', .08*recoil)
        for side in ARMS:
            self.arm(side, self.delta(-side*.015*recoil, -.04*recoil, .035*recoil))

    def cast(self, p):
        wave = math.sin(math.tau*p)
        self.drift(lift=.015*wave)
        for side in ARMS:
            self.arm(side, self.delta(-side*.15, .060, .19+.010*wave))

    def death(self, p):
        fall = smooth((p-.08)/.70)
        self.drift(lift=-.28*fall, forward=.06*fall)
        self.rotate('Bone_000', 'Y', 1.42*fall)
        self.rotate('Bone_013', 'X', .08*fall)
        # Entire shroud lands without moving the artificial humanoid legs.
        evaluated = self.mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        floor = min((evaluated.matrix_world @ Vector(c)).z for c in evaluated.bound_box)
        target = -HOVER*SOURCE_HEIGHT/HEIGHT
        self.drift(lift=(target-floor)*fall)

    def bake(self, name, seconds, pose, loop=False):
        def checked_pose(p):
            pose(p)
            for bone_name in LOWER:
                basis = self.bones[bone_name].matrix_basis
                for row in range(4):
                    for col in range(4):
                        error = abs(basis[row][col]-(1 if row == col else 0))
                        self.lower_error = max(self.lower_error, error)
            if self.lower_error > 1e-5:
                raise RuntimeError(f'Lower shroud moved locally in {name}: {self.lower_error}')
        super().bake(name, seconds, checked_pose, loop)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH'
              and any(m.type == 'ARMATURE' for m in o.modifiers)]
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise RuntimeError('Supplied ghost changed: inspect the replacement before rebaking')
    if len(meshes) != 1 or len(rig.data.bones) != 68 or sum(p.loop_total-2 for p in meshes[0].data.polygons) != 103127:
        raise RuntimeError('Unexpected supplied ghost topology')
    rig.animation_data_create()
    bpy.context.scene.render.fps = 60
    author = GhostAuthor(rig, meshes[0])
    for name, seconds, pose, loop in [
        ('Ghost_Idle', 3.2, author.hover, True),
        ('Ghost_CombatIdle', 2.4, lambda p: author.hover(p, ready=True), True),
        ('Ghost_Move', 2.4, lambda p: author.hover(p, travel=True), True),
        ('Ghost_FastMove', 1.8, lambda p: author.hover(p, travel=True, fast=True), True),
        ('Ghost_Attack', 1.2, author.attack, False),
        ('Ghost_HeavyAttack', 1.45, lambda p: author.attack(p, True), False),
        ('Ghost_Cast', 2.0, author.cast, True),
        ('Ghost_Hit', .55, author.hit, False),
        ('Ghost_Death', 1.8, author.death, False),
    ]:
        author.bake(name, seconds, pose, loop)
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    meshes[0]['source_sha256'] = digest
    meshes[0]['source'] = 'Owner community ghost.glb, intact Meshy SmartRig, original topology, skin and PBR maps'
    meshes[0]['animation_authoring'] = 'Native upper-body arm IK and whole-shroud hover, no walking or foreign channels'
    meshes[0]['shadowCaster'] = False
    yaw = -math.atan2(author.right.y, author.right.x)
    # Object-only transform: no edits to mesh coordinates, bind weights or rest bones.
    rig.rotation_mode = 'XYZ'
    rig.rotation_euler.z = yaw
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    author.reset()
    export_glb(OUTPUT, rig, meshes)
    report = {'source_sha256': digest, 'bones': 68, 'triangles': 103127,
              'arm_chains': ARMS, 'lower_bones': LOWER,
              'source_height': SOURCE_HEIGHT, 'suggested_height': HEIGHT, 'suggested_hover': HOVER,
              'yaw_correction_radians': yaw, 'forward': 'glTF +Z after object correction',
              'lower_local_error': author.lower_error, 'clips': author.clip_reports}
    OUTPUT.with_suffix('.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
