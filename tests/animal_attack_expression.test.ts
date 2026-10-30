import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';

const quadrupeds = [
  ['wolf_v2', 'Wolf', ['BiteLeft', 'BiteRight', 'Lunge'], ['Bone_020', 'Bone_014']],
  ['goat', 'Goat', ['HeadbuttLeft', 'HeadbuttRight', 'Ram'], ['Bone_010', 'Bone_015']],
  ['bufalo', 'Buffalo', ['HornLeft', 'HornRight', 'Charge'], ['Bone_014', 'Bone_019']],
  ['deer', 'Deer', ['AntlerLeft', 'AntlerRight', 'Charge'], ['Bone_015', 'Bone_010']],
] as const;

describe('expressive native animal attacks', () => {
  it.each(quadrupeds)(
    '%s pushes off and replants both hind feet without sliding or snapping',
    async (file, prefix, attacks, feet) => {
      const root = (
        await createGlbIO().read(`public/models/creatures/smart_${file}.glb`)
      ).getRoot();
      const rig = createPoseRig(root);
      const point = (name: string) => {
        const bone = rig.named.get(name);
        if (!bone) throw new Error(`Missing ${name}`);
        return bone.getWorldPosition(new Vector3());
      };
      for (const suffix of attacks) {
        const name = `${prefix}_${suffix}`;
        const clip = indexClip(root, name);
        const seconds = Math.max(...[...clip.values()].map((channel) => channel.times.at(-1) ?? 0));
        const samples = feet.map(() => [] as Vector3[]);
        for (let frame = 0; frame <= 120; frame++) {
          rig.apply(samplePose(clip, (seconds * frame) / 120));
          for (const [i, foot] of feet.entries()) samples[i].push(point(foot));
        }
        for (const [i, track] of samples.entries()) {
          expect(
            Math.max(...track.map((p) => p.y)) - track[0].y,
            `${name}: ${feet[i]} never leaves ground`,
          ).toBeGreaterThan(0.055);
          expect(
            Math.max(...track.map((p) => p.z)) - Math.min(...track.map((p) => p.z)),
            `${name}: hind foot never follows body`,
          ).toBeGreaterThan(0.075);
          expect(
            track.at(-1)?.distanceTo(track[0]),
            `${name}: stance does not recover`,
          ).toBeLessThan(0.012);
          for (let frame = 1; frame < track.length; frame++) {
            expect(track[frame].distanceTo(track[frame - 1]), `${name}: foot snaps`).toBeLessThan(
              0.12,
            );
            // A planted contact holds its world-space point; displacement is
            // permitted only when the hoof/paw is visibly lifted.
            if (track[frame].y < track[0].y + 0.008 && track[frame - 1].y < track[0].y + 0.008) {
              expect(
                track[frame].distanceTo(track[frame - 1]),
                `${name}: grounded foot slides`,
              ).toBeLessThan(0.009);
            }
          }
        }
      }
    },
  );

  it('lets the new wolf tail fall to the floor and hold its final death pose', async () => {
    const root = (await createGlbIO().read('public/models/creatures/smart_wolf_v2.glb')).getRoot();
    const rig = createPoseRig(root);
    const clip = indexClip(root, 'Wolf_Death');
    const seconds = Math.max(...[...clip.values()].map((channel) => channel.times.at(-1) ?? 0));
    const tip = rig.named.get('Bone_004');
    if (!tip) throw new Error('Missing native tail tip');
    rig.apply(samplePose(clip, seconds));
    const end = tip.getWorldPosition(new Vector3());
    // The fur contacts the floor below the centreline (verified on skinned
    // vertices in smart_wolf_v2_asset); the tail itself has finite thickness.
    expect(end.y, 'tail remains standing above the corpse').toBeLessThan(0.25);
    expect(end.y).toBeGreaterThan(-0.01);
    rig.apply(samplePose(clip, seconds * 0.9));
    expect(tip.getWorldPosition(new Vector3()).distanceTo(end)).toBeLessThan(0.003);
  });

  it('gives the raptor a real airborne hind-claw kick and a separate tail whip', async () => {
    const root = (await createGlbIO().read('public/models/creatures/smart_raptor.glb')).getRoot();
    const rig = createPoseRig(root);
    const sample = (name: string, bones: string[]) => {
      const clip = indexClip(root, name);
      const seconds = Math.max(...[...clip.values()].map((channel) => channel.times.at(-1) ?? 0));
      return Array.from({ length: 121 }, (_, frame) => {
        rig.apply(samplePose(clip, (seconds * frame) / 120));
        return bones.map((name) => {
          const bone = rig.named.get(name);
          if (!bone) throw new Error(`Missing ${name}`);
          return bone.getWorldPosition(new Vector3());
        });
      });
    };
    const kick = sample('Raptor_Pounce', ['Bone_012', 'Bone_006', 'Bone_000']);
    expect(
      Math.max(...kick.map((frame) => frame[2].y)) - kick[0][2].y,
      'pelvis must jump with the raised claws',
    ).toBeGreaterThan(0.25);
    expect(
      kick.some((frame) => frame.slice(0, 2).every((p, i) => p.y > kick[0][i].y + 0.28)),
      'both hind claws must be airborne together',
    ).toBe(true);
    for (const i of [0, 1]) {
      const relative = kick.map((frame) => frame[i].z - frame[2].z);
      expect(
        Math.max(...relative) - relative[0],
        'hind claws must kick ahead of the pelvis',
      ).toBeGreaterThan(0.28);
      expect(Math.max(...kick.map((frame) => frame[i].z)) - kick[0][i].z).toBeGreaterThan(0.28);
      expect(kick.at(-1)?.[i].distanceTo(kick[0][i])).toBeLessThan(0.012);
    }
    const whip = sample('Raptor_TailWhip', ['Bone_017', 'Bone_000']);
    const lateral = whip.map(([tip, pelvis]) => tip.x - pelvis.x);
    expect(
      Math.max(...lateral) - Math.min(...lateral),
      'tail lacks a striking sweep',
    ).toBeGreaterThan(0.65);
    expect(whip.at(-1)?.[0].distanceTo(whip[0][0])).toBeLessThan(0.012);
    for (let frame = 1; frame < whip.length; frame++) {
      expect(whip[frame][0].distanceTo(whip[frame - 1][0]), 'tail snaps').toBeLessThan(0.15);
    }
  });
});
