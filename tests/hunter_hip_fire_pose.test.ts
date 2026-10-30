import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createHunterHipFirePose } from '../scripts/anim/hunter_hip_fire_pose.mjs';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';

describe('offline Hunter hip-fire correction', () => {
  it('lifts a rigid two-palm grip, retaining native lengths and the carry body without mutating input poses', async () => {
    const io = createGlbIO();
    const body = (await io.read('public/models/chars/players/t1_hunter.glb')).getRoot();
    const rig = createPoseRig(body);
    const root = (
      await io.read('public/models/chars/players/hunter_t1_motion_anims.glb')
    ).getRoot();
    const carry = samplePose(indexClip(root, 'HunterT1_Crossbow_Idle'), 0);
    const aim = samplePose(indexClip(root, 'HunterT1_Crossbow_Aim'), 0.6);
    const before = JSON.stringify([[...carry], [...aim]]);
    const right = rig.named.get('mixamorig:RightHand');
    const left = rig.named.get('mixamorig:LeftHand');
    assert(right && left);
    const relativeGrip = () =>
      left
        .getWorldPosition(new Vector3())
        .sub(right.getWorldPosition(new Vector3()))
        .applyQuaternion(right.getWorldQuaternion(new Quaternion()).invert());
    rig.apply(carry);
    const relative = relativeGrip();
    const restingY = right.getWorldPosition(new Vector3()).y;
    rig.apply(aim);
    const aimedWrist = right.getWorldQuaternion(new Quaternion());
    const pose = createHunterHipFirePose(
      rig,
      [...indexClip(body, 'T1Hunter_Idle').keys()],
      carry,
      aim,
    );
    rig.apply(pose);
    expect(right.getWorldPosition(new Vector3()).y - restingY).toBeCloseTo(0.07, 5);
    expect(relativeGrip().distanceTo(relative)).toBeLessThan(0.001);
    expect(right.getWorldQuaternion(new Quaternion()).angleTo(aimedWrist)).toBeLessThan(0.001);
    for (const [key, value] of carry) {
      if (!/^mixamorig:(Left|Right)(Arm|ForeArm|Hand).*\|rotation$/.test(key))
        expect(pose.get(key), key).toEqual(value);
      if (key.endsWith('|translation') || key.endsWith('|scale'))
        expect(pose.get(key), `${key} bind lengths`).toEqual(value);
    }
    expect(JSON.stringify([[...carry], [...aim]])).toBe(before);
  });
});
