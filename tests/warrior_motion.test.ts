import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig, retargetPose } from '../scripts/anim/rig_pose.mjs';
import { VISUALS } from '../src/render/characters/manifest';
import { weaponMotionClipNames } from '../src/render/characters/weapon_motion_core';

let rig: PoseRig;
let clips: Map<string, ClipIndex>;
let approvedJump: ClipIndex;
let approvedRig: PoseRig;
const duration = (clip: ClipIndex) => Math.max(...[...clip.values()].map((ch) => ch.times.at(-1)!));
beforeAll(async () => {
  const io = createGlbIO();
  rig = createPoseRig((await io.read('public/models/chars/players/t1_warrior.glb')).getRoot());
  const root = (await io.read('public/models/chars/players/warrior_t1_motion_anims.glb')).getRoot();
  expect(root.listMeshes()).toHaveLength(0);
  expect(root.listSkins()).toHaveLength(0);
  clips = new Map(root.listAnimations().map((a) => [a.getName(), indexClip(root, a.getName())]));
  approvedRig = createPoseRig(
    (await io.read('public/models/chars/players/warlock_t1.glb')).getRoot(),
  );
  approvedJump = indexClip(
    (await io.read('public/models/chars/players/warlock_ability_anims.glb')).getRoot(),
    'WarlockT1_JumpClassic',
  );
});

describe('native motion exported onto the actual T1 Warrior', () => {
  it('closes idle and gait loops on the same target pose without root drift', () => {
    for (const [name, clip] of clips) {
      if (!/(Idle|Walk|Run)$/.test(name)) continue;
      const first = samplePose(clip, 0);
      const last = samplePose(clip, duration(clip));
      for (const [key, value] of first) {
        if (key.endsWith('|rotation')) {
          expect(
            Math.abs(
              new Quaternion().fromArray(value).dot(new Quaternion().fromArray(last.get(key)!)),
            ),
          ).toBeCloseTo(1, 5);
        } else
          for (const [i, component] of value.entries()) {
            expect(last.get(key)![i]).toBeCloseTo(component, 5);
          }
      }
    }
  });

  it('ships every equipment-specific action with finite normalized target-bone keys', () => {
    for (const name of weaponMotionClipNames(VISUALS.player_warrior.clips.weaponMotions)) {
      expect(clips.has(name), name).toBe(true);
    }
    for (const [name, clip] of clips)
      for (const [key, channel] of clip) {
        expect(rig.rest.has(key), `${name}:${key}`).toBe(true);
        expect([...channel.values].every(Number.isFinite)).toBe(true);
        if (channel.path === 'rotation')
          for (let i = 0; i < channel.values.length; i += 4) {
            expect(Math.hypot(...channel.values.slice(i, i + 4))).toBeCloseTo(1, 4);
          }
      }
  });

  it('keeps native unarmed gait articulation rather than replacing arms procedurally', () => {
    for (const name of ['Warrior_TravelWalk', 'Warrior_TravelRun']) {
      const clip = clips.get(name)!;
      const forearm = clip.get('mixamorig:RightForeArm|rotation')!;
      const first = new Quaternion().fromArray(forearm.values.slice(0, 4));
      let change = 0;
      for (let i = 4; i < forearm.values.length; i += 4) {
        change = Math.max(
          change,
          first.angleTo(new Quaternion().fromArray(forearm.values.slice(i, i + 4))),
        );
      }
      expect(change).toBeGreaterThan(0.2);
      const hips = clip.get('mixamorig:Hips|translation')!;
      for (let i = 0; i < hips.values.length; i += 3) {
        expect(hips.values[i]).toBeCloseTo(hips.values[0], 5);
        expect(hips.values[i + 2]).toBeCloseTo(hips.values[2], 5);
      }
    }
  });

  it('keeps the approved natural calm silhouette and distinct armed poses', () => {
    const pose = (name: string) => {
      rig.apply(samplePose(clips.get(name)!, 0));
      return rig.named.get('mixamorig:LeftHand')!.getWorldPosition(new Vector3());
    };
    const calm = pose('Warrior_TravelIdle');
    const shield = pose('WarriorT1_Shield_Idle');
    const twohand = pose('WarriorT1_TwoHand_Idle');
    expect(calm.distanceTo(shield)).toBeGreaterThan(0.15);
    expect(shield.distanceTo(twohand)).toBeGreaterThan(0.15);
    rig.apply(samplePose(clips.get('Warrior_TravelIdle')!, 0));
    for (const side of ['Left', 'Right']) {
      const hand = rig.named.get(`mixamorig:${side}Hand`)!.getWorldPosition(new Vector3());
      const elbow = rig.named.get(`mixamorig:${side}ForeArm`)!.getWorldPosition(new Vector3());
      expect(Math.abs(hand.x - elbow.x)).toBeLessThan(0.035);
      expect(hand.z).toBeGreaterThan(elbow.z);
    }
  });

  it.each(['Unarmed', 'Shield', 'TwoHand', 'OneHand'])(
    'transfers the approved classic jump timing and lower body to %s',
    (family) => {
      const clip = clips.get(`WarriorT1_${family}_Jump`)!;
      expect(duration(clip)).toBeCloseTo(duration(approvedJump), 5);
      for (let frame = 0; frame <= 25; frame++) {
        const time = (duration(approvedJump) * frame) / 25;
        const expected = retargetPose(samplePose(approvedJump, time), approvedRig.rest, rig.rest);
        const actual = samplePose(clip, time);
        for (const [key, value] of expected) {
          if (!/^mixamorig:(Hips|Spine.*|.*(?:Leg|Foot|Toe).*)\|/.test(key)) continue;
          if (key.endsWith('|rotation')) {
            expect(
              new Quaternion()
                .fromArray(actual.get(key)!)
                .angleTo(new Quaternion().fromArray(value)),
            ).toBeLessThan(0.003);
          } else {
            expect(
              new Vector3().fromArray(actual.get(key)!).distanceTo(new Vector3().fromArray(value)),
            ).toBeLessThan(0.001);
          }
        }
      }
    },
  );

  it('keeps ordinary attack rotations grounded and below a half-turn', () => {
    const names = new Set(
      Object.values(VISUALS.player_warrior.clips.weaponMotions ?? {}).flatMap(
        (profile) => profile.attack,
      ),
    );
    for (const name of names) {
      if (name.endsWith('_AttackSpin')) continue; // separately pinned upright full turn below
      const clip = clips.get(name)!;
      const idle = clips.get(name.replace(/_Attack[A-C]$/, '_Idle'));
      assert(idle, `${name}: family idle must exist`);
      rig.apply(samplePose(idle, 0));
      const worldY = (boneName: string) => {
        const bone = rig.named.get(boneName);
        assert(bone, `${boneName}: required grounded-attack bone`);
        return bone.getWorldPosition(new Vector3()).y;
      };
      const clearance = () =>
        worldY('mixamorig:Hips') -
        ['Left', 'Right'].reduce((sum, side) => sum + worldY(`mixamorig:${side}Foot`), 0) / 2;
      const idleClearance = clearance();
      const clearances: number[] = [];
      const feet: number[] = [];
      const heights: number[] = [];
      const turns: number[] = [];
      for (let frame = 0; frame <= 80; frame++) {
        rig.apply(samplePose(clip, (duration(clip) * frame) / 80));
        const hips = rig.named.get('mixamorig:Hips')!;
        clearances.push(clearance());
        heights.push(hips.getWorldPosition(new Vector3()).y);
        feet.push(
          Math.min(
            ...['Left', 'Right'].map(
              (side) => rig.named.get(`mixamorig:${side}Foot`)!.getWorldPosition(new Vector3()).y,
            ),
          ),
        );
        const direction = new Vector3(0, 0, 1).applyQuaternion(
          hips.getWorldQuaternion(new Quaternion()),
        );
        const raw = Math.atan2(direction.x, direction.z);
        const previous = turns.at(-1) ?? raw;
        let delta = raw - previous;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        turns.push(previous + delta);
      }
      expect(Math.max(...turns) - Math.min(...turns), name).toBeLessThan(Math.PI);
      expect(Math.max(...feet) - Math.min(...feet), name).toBeLessThan(0.1);
      expect(Math.max(...heights) - Math.min(...heights), name).toBeLessThan(0.25);
      // Small excursion alone admits a permanently crouched attack.
      expect(Math.min(...clearances), `${name}: upright stance`).toBeGreaterThan(
        idleClearance * 0.65,
      );
    }
  });

  it('holds each armed family grip while the classic jump drives the body', () => {
    for (const family of ['Shield', 'TwoHand', 'OneHand']) {
      const idle = samplePose(clips.get(`WarriorT1_${family}_Idle`)!, 0);
      const jump = clips.get(`WarriorT1_${family}_Jump`)!;
      for (let frame = 0; frame <= 20; frame++) {
        const pose = samplePose(jump, (duration(jump) * frame) / 20);
        for (const [key, value] of idle) {
          if (!/^mixamorig:(Left|Right)(Shoulder|Arm|ForeArm|Hand.*)\|rotation$/.test(key))
            continue;
          expect(
            new Quaternion().fromArray(pose.get(key)!).angleTo(new Quaternion().fromArray(value)),
          ).toBeLessThan(0.003);
        }
      }
    }
  });

  it('preserves acrobatic pack takes without routing them into normal strike cycles', () => {
    const names = [
      'WarriorT1_Shield_SpecialSpin',
      'WarriorT1_Shield_SpecialJumpAttack',
      'WarriorT1_TwoHand_SpecialSpin',
      'WarriorT1_OneHand_SpecialBackhand',
      'WarriorT1_Shield_AttackE',
      'WarriorT1_TwoHand_AttackE',
    ];
    const routed = weaponMotionClipNames(VISUALS.player_warrior.clips.weaponMotions);
    for (const name of names) {
      expect(clips.has(name), name).toBe(true);
      expect(routed, name).not.toContain(name);
    }
  });
});
