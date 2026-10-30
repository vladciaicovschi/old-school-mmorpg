"""Offline native bind normalization and digitigrade support for animal bakers."""
import math

import bpy
from mathutils import Matrix, Vector

from native_quadruped_author import NativeQuadrupedAuthor


def probe_bake(author, name, seconds, pose, loop=False):
    """Fast authoring diagnostic; never used to produce shipping keyframes."""
    author.reach_clamp, author.fold_margin = 0, math.inf
    author.reach_leg, author.reach_phase = None, None
    for frame in range(61):
        author.reset()
        author.phase = frame/60
        pose(author.phase)
    author.clip_reports[name] = {'reach_clamp': author.reach_clamp,
                                 'reach_leg': author.reach_leg, 'reach_phase': author.reach_phase,
                                 'fold_margin': author.fold_margin if math.isfinite(author.fold_margin) else None}
    print(name, author.clip_reports[name], flush=True)


def commit_bind(rig, mesh, center_bone):
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    modifier = next(m for m in mesh.modifiers if m.type == 'ARMATURE')
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    mesh.select_set(False)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    modifier = mesh.modifiers.new('Normalized native skin', 'ARMATURE')
    modifier.object = rig
    bpy.context.view_layer.update()
    shift = Vector((-rig.pose.bones[center_bone].head.x, 0, -min(v.co.z for v in mesh.data.vertices)))
    for vertex in mesh.data.vertices:
        vertex.co += shift
    bpy.ops.object.mode_set(mode='EDIT')
    for bone in rig.data.edit_bones:
        bone.head += shift
        bone.tail += shift
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()


class NativeDigitigradeAuthor(NativeQuadrupedAuthor):
    def __init__(self, rig, mesh, legs, fetlocks):
        super().__init__(rig, mesh, legs)
        self.fetlocks = fetlocks

    def paw(self, leg, target, pitch=0, hock_offset=None):
        upper, knee, hock, foot = self.legs[leg]
        mid = self.fetlocks[leg]
        rotate = Matrix.Rotation(pitch*.5, 3, 'X')
        destination = target + rotate @ self.hocks[leg]
        start = self.bones[upper].head.copy()
        a = (self.bones[knee].head-start).length
        b = (self.bones[hock].head-self.bones[knee].head).length
        delta = destination-start
        direction = delta.normalized()
        distance = min(a+b-.003, max(abs(a-b)+.003, delta.length))
        if abs(distance-delta.length) > self.reach_clamp:
            self.reach_clamp = abs(distance-delta.length)
            self.reach_leg, self.reach_phase = leg, self.phase
        self.fold_margin = min(self.fold_margin, distance-abs(a-b))
        along = (a*a-b*b+distance*distance)/(2*distance)
        pole = Vector(((-1 if 'left' in leg else 1)*.08, -1, 0))
        pole -= direction*pole.dot(direction)
        bend = start+direction*along+pole.normalized()*math.sqrt(max(0, a*a-along*along))
        self.aim(upper, knee, bend)
        self.aim(knee, hock, start+direction*distance)
        self.aim(hock, mid, target+rotate @ (self.rest[mid].translation-self.feet[leg]))
        self.aim(mid, foot, target)
        matrix = self.rest[foot].copy()
        matrix.translation = self.bones[foot].head.copy()
        self.bones[foot].matrix = matrix
        self.update()
        self.rotate(foot, 'X', pitch)
