import { type Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';

describe('animal motion flow', () => {
  it.each([
    ['Bear_SwipeLeft', 'Bone_025', 0.62],
    ['Bear_SwipeRight', 'Bone_031', 0.62],
    ['Bear_DoubleSlam', 'Bone_025', 0.68],
  ] as const)('%s carries paw momentum into follow-through', async (name, bone, join) => {
    const root = (await createGlbIO().read('public/models/creatures/smart_bear.glb')).getRoot();
    const rig = createPoseRig(root);
    const clip = indexClip(root, name);
    const duration = Math.max(...[...clip.values()].map((ch) => ch.times.at(-1) ?? 0));
    const point = (phase: number) => {
      rig.apply(samplePose(clip, phase * duration));
      const node = rig.named.get(bone);
      if (!node) throw new Error(`Missing ${bone}`);
      return node.getWorldPosition(new Vector3());
    };
    const delta = 0.008;
    const at = point(join);
    const incoming = at
      .clone()
      .sub(point(join - delta))
      .divideScalar(delta * duration);
    const outgoing = point(join + delta)
      .sub(at)
      .divideScalar(delta * duration);
    expect(Math.min(incoming.length(), outgoing.length()), 'unintended full stop').toBeGreaterThan(
      0.65,
    );
    expect(
      incoming.normalize().dot(outgoing.normalize()),
      'broken follow-through tangent',
    ).toBeGreaterThan(0.85);
  });

  it('wolf walk articulates both scapulae and uses a visible stride', async () => {
    const root = (await createGlbIO().read('public/models/creatures/smart_wolf.glb')).getRoot();
    const rig = createPoseRig(root);
    const clip = indexClip(root, 'Wolf_Walk');
    const duration = Math.max(...[...clip.values()].map((ch) => ch.times.at(-1) ?? 0));
    const rotations = ['Bone_030', 'Bone_036'].map(() => [] as Quaternion[]);
    const fore = [] as number[];
    for (let frame = 0; frame <= 120; frame++) {
      rig.apply(samplePose(clip, (duration * frame) / 120));
      for (const [i, name] of ['Bone_030', 'Bone_036'].entries()) {
        const node = rig.named.get(name);
        if (!node) throw new Error(`Missing ${name}`);
        rotations[i].push(node.quaternion.clone());
      }
      const paw = rig.named.get('Bone_026');
      if (!paw) throw new Error('Missing forepaw');
      fore.push(paw.getWorldPosition(new Vector3()).z);
    }
    for (const samples of rotations)
      expect(Math.max(...samples.map((q) => q.angleTo(samples[0])))).toBeGreaterThan(0.08);
    expect(Math.max(...fore) - Math.min(...fore)).toBeGreaterThan(0.72);
  });

  it('wolf gallop keeps both hind hocks away from the fully folded singularity', async () => {
    const root = (await createGlbIO().read('public/models/creatures/smart_wolf.glb')).getRoot();
    const rig = createPoseRig(root);
    const clip = indexClip(root, 'Wolf_Run');
    const duration = Math.max(...[...clip.values()].map((ch) => ch.times.at(-1) ?? 0));
    const position = (name: string) => {
      const node = rig.named.get(name);
      if (!node) throw new Error(`Missing ${name}`);
      return node.getWorldPosition(new Vector3());
    };
    for (let frame = 0; frame <= 240; frame++) {
      rig.apply(samplePose(clip, (duration * frame) / 240));
      for (const [hip, knee, hock] of [
        ['Bone_006', 'Bone_005', 'Bone_004'],
        ['Bone_011', 'Bone_010', 'Bone_009'],
      ]) {
        const a = position(hip).distanceTo(position(knee));
        const b = position(knee).distanceTo(position(hock));
        const folded = Math.abs(a - b);
        expect(
          position(hip).distanceTo(position(hock)) - folded,
          `${hip}: folded hock margin`,
        ).toBeGreaterThan(0.05);
      }
    }
  });
});
