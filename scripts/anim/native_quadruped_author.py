"""Offline native-rig primitives for new digitigrade and hoofed animals.

All targets are armature-space; fixed bend planes and reach diagnostics prevent
the folding and extension failures found while authoring the wolf. The output
is a normal baked GLB, with no runtime solver or changes to skin weights.
"""
from __future__ import annotations

import math

import bpy
from mathutils import Matrix, Vector

from blender_bake_meshy_titan import action_fcurves


class NativeQuadrupedAuthor:
    def __init__(self, rig, mesh, legs):
        self.rig, self.mesh, self.legs = rig, mesh, legs
        self.bones = rig.pose.bones
        self.rest = {bone.name: bone.matrix.copy() for bone in self.bones}
        self.feet = {leg: self.rest[names[3]].translation.copy() for leg, names in legs.items()}
        self.hocks = {leg: self.rest[names[2]].translation-self.feet[leg] for leg, names in legs.items()}
        self.clip_reports = {}
        self.reach_clamp = 0.0
        self.fold_margin = math.inf
        self.reach_leg, self.reach_phase = None, None

    def update(self):
        bpy.context.view_layer.update()

    def reset(self):
        for bone in self.bones:
            bone.matrix_basis = Matrix.Identity(4)
        self.update()

    def rotate(self, name, axis, angle):
        bone = self.bones[name]
        origin = bone.head.copy()
        bone.matrix = Matrix.Translation(origin) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-origin) @ bone.matrix
        self.update()

    def body(self, lift=0.0, forward=0.0, side=0.0):
        bone = self.bones["Bone_000"]
        matrix = bone.matrix.copy()
        matrix.translation += Vector((side, -forward, lift))
        bone.matrix = matrix
        self.update()

    def aim(self, name, child, target):
        bone = self.bones[name]
        origin = bone.head.copy()
        q = (self.bones[child].head-origin).rotation_difference(target-origin)
        bone.matrix = Matrix.Translation(origin) @ q.to_matrix().to_4x4() @ Matrix.Translation(-origin) @ bone.matrix
        self.update()

    def paw(self, leg, target, pitch=0.0, hock_offset=None):
        upper, knee, hock, foot = self.legs[leg]
        # An authored support vector can reorient a posed fetlock. Callers keep
        # its native segment length; None retains the original source posture.
        offset = self.hocks[leg] if hock_offset is None else hock_offset
        destination = target + Matrix.Rotation(pitch*0.5, 3, "X") @ offset
        start = self.bones[upper].head.copy()
        a = (self.bones[knee].head-start).length
        b = (self.bones[hock].head-self.bones[knee].head).length
        delta = destination-start
        direction = delta.normalized()
        distance = min(a+b-0.003, max(abs(a-b)+0.003, delta.length))
        if abs(distance-delta.length) > self.reach_clamp:
            self.reach_clamp = abs(distance-delta.length)
            self.reach_leg, self.reach_phase = leg, self.phase
        self.fold_margin = min(self.fold_margin, distance-abs(a-b))
        along = (a*a-b*b+distance*distance)/(2*distance)
        side = -1 if "left" in leg else 1
        pole = Vector((side*0.08, 1 if "front" in leg else -1, 0))
        pole -= direction*pole.dot(direction)
        if pole.length < 0.001:
            raise RuntimeError(f"Degenerate anatomical bend plane: {leg}")
        bend = start+direction*along+pole.normalized()*math.sqrt(max(0, a*a-along*along))
        self.aim(upper, knee, bend)
        self.aim(knee, hock, start+direction*distance)
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

    def settle_floor(self):
        evaluated = self.mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        floor = min((evaluated.matrix_world @ Vector(corner)).z for corner in evaluated.bound_box)
        if floor < 0:
            self.body(lift=-floor+0.002)

    def bake(self, name, seconds, pose, loop=False, fps=60):
        self.reach_clamp, self.fold_margin = 0.0, math.inf
        self.reach_leg, self.reach_phase = None, None
        action = bpy.data.actions.new(name)
        self.rig.animation_data.action = action
        count = round(seconds*fps)
        previous = {}
        for frame in range(count+1):
            bpy.context.scene.frame_set(frame)
            self.reset()
            self.phase = 0 if loop and frame == count else frame/count
            pose(self.phase)
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
            for key in curve.keyframe_points:
                key.interpolation = "LINEAR"
        self.rig.animation_data.action = None
        track = self.rig.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, action)
        strip.name, track.mute = name, True
        self.clip_reports[name] = {"reach_clamp": self.reach_clamp,
                                   "reach_leg": self.reach_leg, "reach_phase": self.reach_phase,
                                   "fold_margin": self.fold_margin if math.isfinite(self.fold_margin) else None}
        print(f"Baked {name}: {count+1} frames; {self.clip_reports[name]}", flush=True)
