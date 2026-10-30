import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';

describe('native animal contact silhouettes', () => {
  it.each(['Wolf_BiteLeft', 'Wolf_BiteRight', 'Wolf_Lunge'])(
    '%s reaches the muzzle beyond the upper neck while closing the jaw',
    async (name) => {
      const root = (await createGlbIO().read('public/models/creatures/smart_wolf.glb')).getRoot();
      const rig = createPoseRig(root);
      const clip = indexClip(root, name);
      const seconds = Math.max(...[...clip.values()].map((ch) => ch.times.at(-1) ?? 0));
      for (const phase of [0.53, 0.6, 0.67]) {
        rig.apply(samplePose(clip, seconds * phase));
        const muzzle = rig.named.get('Bone_037');
        const neck = rig.named.get('Bone_023');
        if (!muzzle || !neck) throw new Error('Missing wolf facial joints');
        expect(
          muzzle.getWorldPosition(new Vector3()).z - neck.getWorldPosition(new Vector3()).z,
          `${name} at ${phase}: head retracts into neck`,
        ).toBeGreaterThan(0.15);
      }
    },
  );

  it.each(['Goat_HeadbuttLeft', 'Goat_HeadbuttRight', 'Goat_Ram'])(
    '%s keeps the crown ahead of the nose throughout contact',
    async (name) => {
      const root = (await createGlbIO().read('public/models/creatures/smart_goat.glb')).getRoot();
      const rig = createPoseRig(root);
      const clip = indexClip(root, name);
      const seconds = Math.max(...[...clip.values()].map((ch) => ch.times.at(-1) ?? 0));
      for (const phase of [0.5, 0.57, 0.64]) {
        rig.apply(samplePose(clip, seconds * phase));
        const muzzle = rig.named.get('Bone_042');
        const head = rig.named.get('Bone_019');
        if (!muzzle || !head) throw new Error('Missing goat facial joints');
        const direction = muzzle
          .getWorldPosition(new Vector3())
          .sub(head.getWorldPosition(new Vector3()));
        expect(direction.z, `${name} at ${phase}: nose leads the crown`).toBeLessThan(0.04);
        expect(direction.y, `${name} at ${phase}: head is not bowed`).toBeLessThan(-0.4);
      }
    },
  );
});
