import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';
import { VISUALS } from '../src/render/characters/manifest';
import { weaponMotionAttackIndex } from '../src/render/characters/weapon_motion_core';

describe('rare upright two-hand spins', () => {
  it.each(['warrior', 'paladin'] as const)(
    '%s selects the upper sweep exactly five percent of visual rolls',
    (cls) => {
      const profile = VISUALS[`player_${cls}`].clips.weaponMotions?.twohand;
      assert(profile);
      expect(profile.attack.at(-1)).toBe(
        `${cls === 'warrior' ? 'Warrior' : 'Paladin'}T1_TwoHand_AttackSpin`,
      );
      expect(profile.attackWeights).toEqual([0.6, 0.175, 0.175, 0.05]);
      const counts = [0, 0, 0, 0];
      for (let i = 0; i < 10000; i++)
        counts[weaponMotionAttackIndex(4, profile.attackWeights, (i + 0.5) / 10000, 0)]++;
      expect(counts).toEqual([6000, 1750, 1750, 500]);
    },
  );
  it.each([
    ['t1_warrior', 'warrior_t1_motion_anims', 'Warrior'],
    ['t1_paladin', 'paladin_twohand_motion_anims', 'Paladin'],
  ])(
    '%s keeps its upper spin upright, grounded and joined to idle',
    async (body, donor, prefix) => {
      const io = createGlbIO();
      const rig = createPoseRig(
        (await io.read(`public/models/chars/players/${body}.glb`)).getRoot(),
      );
      const root = (await io.read(`public/models/chars/players/${donor}.glb`)).getRoot();
      const clip = indexClip(root, `${prefix}T1_TwoHand_AttackSpin`);
      const idle = samplePose(indexClip(root, `${prefix}T1_TwoHand_Idle`), 0);
      const duration = Math.max(...[...clip.values()].map((ch) => ch.times.at(-1) ?? 0));
      expect(duration).toBeCloseTo(1.42, 5);
      const position = (name: string) => {
        const node = rig.named.get(`mixamorig:${name}`);
        assert(node);
        return node.getWorldPosition(new Vector3());
      };
      rig.apply(idle);
      const idleHips = position('Hips').y;
      const contacts: number[] = [];
      const turns: number[] = [];
      for (let i = 0; i <= 100; i++) {
        const time = (duration * i) / 100;
        rig.apply(samplePose(clip, time));
        expect(position('Hips').y).toBeGreaterThan(idleHips * 0.93);
        contacts.push(Math.min(position('LeftFoot').y, position('RightFoot').y));
        if (time >= 0.18 && time <= 1.14)
          expect(position('RightHand').y).toBeGreaterThan(position('Hips').y - 0.06);
        const hips = rig.named.get('mixamorig:Hips');
        assert(hips);
        const forward = new Vector3(0, 0, 1).applyQuaternion(
          hips.getWorldQuaternion(new Quaternion()),
        );
        const raw = Math.atan2(forward.x, forward.z);
        const previous = turns.at(-1) ?? raw;
        let delta = raw - previous;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        turns.push(previous + delta);
      }
      expect(Math.max(...contacts) - Math.min(...contacts)).toBeLessThan(0.08);
      expect(Math.max(...turns) - Math.min(...turns)).toBeGreaterThan(5.5);
      for (const time of [0, duration]) {
        const pose = samplePose(clip, time);
        for (const [key, value] of idle) {
          const actual = pose.get(key);
          assert(actual);
          if (key.endsWith('|rotation'))
            expect(
              Math.abs(new Quaternion().fromArray(actual).dot(new Quaternion().fromArray(value))),
            ).toBeCloseTo(1, 5);
          else
            for (const [i, component] of value.entries())
              expect(actual[i]).toBeCloseTo(component, 5);
        }
      }
    },
  );
});
