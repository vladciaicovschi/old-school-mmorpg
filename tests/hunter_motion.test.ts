import assert from 'node:assert/strict';
import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createHumanoidWorldRetargeter } from '../scripts/anim/humanoid_world_retarget.mjs';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';
import { HUNTER_T1_MOTION_CLIPS } from '../src/render/characters/hunter_t1_motion';
import { weaponMotionClipNames } from '../src/render/characters/weapon_motion_core';

describe('shipped T1 Hunter ranged companion', () => {
  it('shares body motion for both loadouts and borrows only Rifle carry arms', async () => {
    const root = (
      await createGlbIO().read('public/models/chars/players/hunter_t1_motion_anims.glb')
    ).getRoot();
    const grip = samplePose(indexClip(root, 'HunterT1_Crossbow_Idle'), 0);
    let differentArmChannels = 0;
    for (const state of ['Idle', 'Walk', 'WalkBack', 'Run', 'Jump']) {
      const bow = indexClip(root, `HunterT1_Bow_${state}`);
      const crossbow = indexClip(root, `HunterT1_Crossbow_${state}`);
      for (const [key, channel] of bow) {
        const other = crossbow.get(key);
        assert(other);
        expect(other.times, `${state} ${key} timing`).toEqual(channel.times);
        if (/mixamorig:(Left|Right)(Shoulder|Arm|ForeArm|Hand)/.test(key)) {
          const anchor = grip.get(key);
          assert(anchor);
          if (!other.values.every((value, i) => Math.abs(value - channel.values[i]) < 1e-5))
            differentArmChannels++;
          for (let i = 0; i < other.values.length; i++)
            expect(other.values[i], `${state} ${key} grip`).toBeCloseTo(
              anchor[i % anchor.length],
              5,
            );
        } else expect(other.values, `${state} ${key} Longbow body`).toEqual(channel.values);
      }
    }
    expect(differentArmChannels, 'crossbow uses its own carry, not bow hands').toBeGreaterThan(10);
  });
  it('uses the approved Warrior/Warlock classic jump clock and full body, retaining weapon grips', async () => {
    const io = createGlbIO();
    const body = (await io.read('public/models/chars/players/t1_hunter.glb')).getRoot();
    const rig = createPoseRig(body);
    const donor = createPoseRig(
      (await io.read('public/models/chars/players/warlock_t1.glb')).getRoot(),
    );
    const approved = indexClip(
      (await io.read('public/models/chars/players/warlock_ability_anims.glb')).getRoot(),
      'WarlockT1_JumpClassic',
    );
    const retarget = createHumanoidWorldRetargeter(donor, rig, [
      ...indexClip(body, 'T1Hunter_Idle').keys(),
    ]);
    const shipped = (
      await io.read('public/models/chars/players/hunter_t1_motion_anims.glb')
    ).getRoot();
    for (const family of ['Bow', 'Crossbow']) {
      const clip = indexClip(shipped, `HunterT1_${family}_Jump`);
      const seconds = Math.max(...[...clip.values()].map((c) => c.times.at(-1) ?? 0));
      expect(seconds, `${family} classic jump clock`).toBeCloseTo(0.8333333, 5);
      for (let frame = 0; frame <= 25; frame++) {
        const time = (seconds * frame) / 25;
        const actual = samplePose(clip, time);
        const expected = retarget(samplePose(approved, time));
        for (const [key, value] of expected) {
          if (!/^mixamorig:(Hips|Spine.*|.*(?:Leg|Foot|Toe).*)\|/.test(key)) continue;
          const got = actual.get(key);
          assert(got);
          if (key.endsWith('|rotation'))
            expect(
              new Quaternion().fromArray(got).angleTo(new Quaternion().fromArray(value)),
              `${family} ${key}`,
            ).toBeLessThan(0.003);
          else
            expect(
              new Vector3().fromArray(got).distanceTo(new Vector3().fromArray(value)),
              `${family} ${key}`,
            ).toBeLessThan(0.001);
        }
      }
    }
  });
  it('keeps the real Longbow release hand path instead of adding its deltas onto carrying idle', async () => {
    const io = createGlbIO();
    const rig = createPoseRig(
      (await io.read('public/models/chars/players/t1_hunter.glb')).getRoot(),
    );
    const root = (
      await io.read('public/models/chars/players/hunter_t1_motion_anims.glb')
    ).getRoot();
    const shot = indexClip(root, 'HunterT1_Bow_Shot');
    // Measured from the owner-supplied Longbow Standing Aim Recoil, retargeted
    // onto this actual body. Literal palm/elbow landmarks catch a bad rebase.
    for (const [time, hand, elbow] of [
      [0, [-0.161, 1.441, 0.051], [-0.24, 1.452, -0.221]],
      [0.1, [-0.204, 1.444, -0.031], [-0.172, 1.451, -0.311]],
      [0.2, [-0.292, 1.54, -0.278], [-0.042, 1.431, -0.352]],
    ] as const) {
      rig.apply(samplePose(shot, time));
      for (const [name, expected] of [
        ['RightHand', hand],
        ['RightForeArm', elbow],
      ] as const) {
        const bone = rig.named.get(`mixamorig:${name}`);
        assert(bone);
        expect(
          bone.getWorldPosition(new Vector3()).distanceTo(new Vector3(...expected)),
          `${name} at ${time}`,
        ).toBeLessThan(0.004);
      }
    }
  });
  it('lifts and levels the crossbow toward the target below shoulder height, without a shoulder aim', async () => {
    const io = createGlbIO();
    const rig = createPoseRig(
      (await io.read('public/models/chars/players/t1_hunter.glb')).getRoot(),
    );
    const root = (
      await io.read('public/models/chars/players/hunter_t1_motion_anims.glb')
    ).getRoot();
    const hand = rig.named.get('mixamorig:RightHand');
    const shoulder = rig.named.get('mixamorig:RightArm');
    assert(hand && shoulder);
    const idle = samplePose(indexClip(root, 'HunterT1_Crossbow_Idle'), 0);
    rig.apply(idle);
    const restingHandY = hand.getWorldPosition(new Vector3()).y;
    const shot = samplePose(indexClip(root, 'HunterT1_Crossbow_Shot'), 0);
    rig.apply(shot);
    const handY = hand.getWorldPosition(new Vector3()).y;
    expect(handY).toBeGreaterThan(restingHandY + 0.04);
    expect(handY).toBeLessThan(shoulder.getWorldPosition(new Vector3()).y - 0.15);
    const fit = new Quaternion().setFromEuler(
      new Euler(
        ...([-6.0878, -11.5191, 13.0466].map(MathUtils.degToRad) as [number, number, number]),
      ),
    );
    const barrel = new Vector3(0, 1, 0)
      .applyQuaternion(fit)
      .applyQuaternion(hand.getWorldQuaternion(new Quaternion()));
    expect(barrel.z, 'muzzle points toward the target').toBeGreaterThan(0.98);
    expect(Math.abs(barrel.y), 'not into the ground').toBeLessThan(0.08);
    for (const [key, value] of idle)
      if (/mixamorig:(Hips|Spine.*|Head|Neck)\|/.test(key))
        expect(shot.get(key), `${key} no shoulder-aim body change`).toEqual(value);
    const left = rig.named.get('mixamorig:LeftHand');
    assert(left);
    const relativeGrip = () =>
      left
        .getWorldPosition(new Vector3())
        .sub(hand.getWorldPosition(new Vector3()))
        .applyQuaternion(hand.getWorldQuaternion(new Quaternion()).invert());
    const support = relativeGrip();
    for (const time of [0.03, 0.07, 0.12, 0.2, 0.32]) {
      rig.apply(samplePose(indexClip(root, 'HunterT1_Crossbow_Shot'), time));
      expect(
        relativeGrip().distanceTo(support),
        `support hand stays on stock during recoil ${time}`,
      ).toBeLessThan(0.002);
    }
  });
  it('binds real target bones, preserves native lengths and joins aim to release for both weapons', async () => {
    const io = createGlbIO();
    const base = (await io.read('public/models/chars/players/t1_hunter.glb')).getRoot();
    const root = (
      await io.read('public/models/chars/players/hunter_t1_motion_anims.glb')
    ).getRoot();
    expect(root.listMeshes()).toHaveLength(0);
    expect(root.listTextures()).toHaveLength(0);
    expect(root.listSkins()).toHaveLength(0);
    const rig = createPoseRig(base);
    const raise = indexClip(root, 'Spellcast_Raise');
    const raiseDuration = Math.max(...[...raise.values()].map((c) => c.times.at(-1) ?? 0));
    const hand = rig.named.get('mixamorig:RightHand');
    assert(hand);
    rig.apply(samplePose(indexClip(root, 'HunterT1_Bow_Idle'), 0));
    const restingHandY = hand.getWorldPosition(new Vector3()).y;
    let raisedHandY = restingHandY;
    for (let f = 0; f <= 30; f++) {
      rig.apply(samplePose(raise, (raiseDuration * f) / 30));
      raisedHandY = Math.max(raisedHandY, hand.getWorldPosition(new Vector3()).y);
    }
    expect(
      raisedHandY - restingHandY,
      'buff is a real raise gesture, not renamed idle',
    ).toBeGreaterThan(0.15);
    for (const name of weaponMotionClipNames(HUNTER_T1_MOTION_CLIPS.weaponMotions)) {
      const clip = indexClip(root, name);
      for (const [key, channel] of clip) {
        expect(rig.rest.has(key), key).toBe(true);
        expect([...channel.values].every(Number.isFinite), key).toBe(true);
        if (key.endsWith('|translation') && !key.startsWith('mixamorig:Hips|')) {
          const rest = rig.rest.get(key);
          assert(rest);
          for (let i = 0; i < channel.values.length; i++)
            expect(channel.values[i], key).toBeCloseTo(rest[i % rest.length], 5);
        }
      }
    }
    for (const family of ['Bow', 'Crossbow']) {
      const shot = indexClip(root, `HunterT1_${family}_Shot`);
      const atLaunch = samplePose(shot, 0);
      const afterLaunch = samplePose(shot, 0.1);
      let recoilChannels = 0;
      for (const [key, launchValue] of atLaunch) {
        const recoilValue = afterLaunch.get(key);
        assert(recoilValue);
        if (!key.endsWith('|rotation')) continue;
        const q = new Quaternion().fromArray(launchValue);
        if (q.angleTo(new Quaternion().fromArray(recoilValue)) > 0.01) recoilChannels++;
      }
      expect(recoilChannels, `${family} recoil already moves in first 100ms`).toBeGreaterThan(1);
      const aim = samplePose(indexClip(root, `HunterT1_${family}_Aim`), 0.6);
      const release = samplePose(indexClip(root, `HunterT1_${family}_Release`), 0);
      for (const [key, value] of aim) {
        const other = release.get(key);
        assert(other);
        if (key.endsWith('|rotation'))
          expect(
            new Quaternion().fromArray(value).angleTo(new Quaternion().fromArray(other)),
            key,
          ).toBeLessThan(0.002);
        else {
          for (let i = 0; i < value.length; i++) expect(other[i], key).toBeCloseTo(value[i], 5);
        }
      }
      const idle = indexClip(root, `HunterT1_${family}_Idle`);
      const first = samplePose(idle, 0);
      const last = samplePose(
        idle,
        Math.max(...[...idle.values()].map((c) => c.times.at(-1) ?? 0)),
      );
      expect(last).toEqual(first);
    }
  });
});
