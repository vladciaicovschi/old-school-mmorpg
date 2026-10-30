import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';

describe('quadruped flank collapse', () => {
  it.each([
    { animal: 'wolf', upper: ['Bone_025', 'Bone_002'], lower: ['Bone_031', 'Bone_007'] },
    { animal: 'bear', upper: ['Bone_023', 'Bone_003'], lower: ['Bone_029', 'Bone_009'] },
  ])('$animal lets its upper paws settle instead of holding its standing stance', async (spec) => {
    const root = (
      await createGlbIO().read(`public/models/creatures/smart_${spec.animal}.glb`)
    ).getRoot();
    const rig = createPoseRig(root);
    const clip = indexClip(root, `${spec.animal === 'wolf' ? 'Wolf' : 'Bear'}_Death`);
    const duration = Math.max(...[...clip.values()].map((ch) => ch.times.at(-1) ?? 0));
    const point = (name: string) => {
      const bone = rig.named.get(name);
      if (!bone) throw new Error(`Missing ${spec.animal} joint ${name}`);
      return bone.getWorldPosition(new Vector3());
    };
    rig.apply(samplePose(clip, duration));
    const rootHeight = point('Bone_000').y;
    for (const [i, paw] of spec.upper.entries()) {
      expect(point(paw).y - point(spec.lower[i]).y, `${paw}: resting height`).toBeLessThan(0.25);
      expect(rootHeight - point(paw).y, `${paw}: gravity release`).toBeGreaterThan(0.3);
    }
    let previous: Vector3[] | undefined;
    const joints = root
      .listSkins()[0]
      .listJoints()
      .map((bone) => bone.getName());
    for (let frame = 0; frame <= 120; frame++) {
      rig.apply(samplePose(clip, (duration * frame) / 120));
      const current = joints.map(point);
      if (previous)
        for (const [i, position] of current.entries())
          expect(position.distanceTo(previous[i]), `${joints[i]}: collapse snap`).toBeLessThan(
            0.075,
          );
      previous = current;
    }
  });
});
