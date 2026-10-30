import { Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { VISUALS } from '../src/render/characters/manifest';

describe('warlock authored motion on the actual shipped rig', () => {
  let rig: PoseRig;
  let clips: Map<string, ClipIndex>;
  let sources: Map<string, string>;
  beforeAll(async () => {
    const io = createGlbIO();
    rig = createPoseRig((await io.read('public/models/chars/players/warlock_t1.glb')).getRoot());
    const root = (await io.read('public/models/chars/players/warlock_ability_anims.glb')).getRoot();
    clips = new Map(root.listAnimations().map((a) => [a.getName(), indexClip(root, a.getName())]));
    sources = new Map(
      root.listAnimations().map((a) => [a.getName(), String(a.getExtras().motionSource)]),
    );
  });
  const position = (name: string) =>
    rig.named.get(`mixamorig:${name}`)!.getWorldPosition(new Vector3());
  const length = (clip: ClipIndex) => Math.max(...[...clip.values()].map((ch) => ch.times.at(-1)!));
  it('ships a looped native Axe Pack staff idle without replacing approved calm or combat idles', () => {
    const clip = clips.get('WarlockT1_StaffIdle');
    expect(clip).toBeDefined();
    if (!clip) throw new Error('Staff idle missing');
    expect(sources.get('WarlockT1_StaffIdle')).toBe('Druid Pro Melee Axe Pack/standing idle.fbx');
    expect(length(clip)).toBeGreaterThan(1);
    const start = samplePose(clip, 0);
    const end = samplePose(clip, length(clip));
    for (const [key, value] of start) sameValue(key, end.get(key)!, value);
    const map = VISUALS.player_warlock.clips;
    expect(map.idle).toBe('WarlockT1_TravelIdle');
    expect(map.combatIdle).toBe('WarlockT1_ReadyIdle');
    // The native held pose must differ from the approved free-hand silhouette.
    rig.apply(start);
    const staffHand = position('RightHand');
    rig.apply(samplePose(clips.get(map.idle)!, 0));
    expect(staffHand.distanceTo(position('RightHand'))).toBeGreaterThan(0.1);
  });
  function sameValue(key: string, actual: number[], expected: number[]) {
    if (key.endsWith('|rotation')) {
      expect(
        Math.abs(new Quaternion().fromArray(actual).dot(new Quaternion().fromArray(expected))),
        key,
      ).toBeCloseTo(1, 5);
    } else
      for (const [i, value] of expected.entries()) expect(actual[i], key).toBeCloseTo(value, 5);
  }

  it('uses the new unarmed Locomotion pack without overriding its shoulder and elbow motion', () => {
    for (const name of ['TravelWalk', 'TravelRun']) {
      expect(sources.get(`WarlockT1_${name}`)).toContain('Druid Locomotion/');
    }
    for (const name of ['TravelWalk', 'TravelRun']) {
      const clip = clips.get(`WarlockT1_${name}`)!;
      const elbow = clip.get('mixamorig:RightForeArm|rotation')!;
      const start = new Quaternion().fromArray(elbow.values.slice(0, 4));
      let change = 0;
      for (let i = 4; i < elbow.values.length; i += 4) {
        change = Math.max(
          change,
          start.angleTo(new Quaternion().fromArray(elbow.values.slice(i, i + 4))),
        );
      }
      expect(change, `${name}: frozen elbow`).toBeGreaterThan(0.2);
      const root = clip.get('mixamorig:Hips|translation')!;
      for (let i = 0; i < root.values.length; i += 3) {
        expect(root.values[i]).toBeCloseTo(root.values[0], 5);
        expect(root.values[i + 2]).toBeCloseTo(root.values[2], 5);
      }
    }
  });

  it('exports finite unit rotations, rather than encoded int16 quaternion magnitudes', () => {
    for (const [name, clip] of clips) {
      for (const [key, ch] of clip) {
        expect(rig.rest.has(key), `${name}: unknown bone ${key}`).toBe(true);
        expect([...ch.values].every(Number.isFinite), `${name}: ${key}`).toBe(true);
        if (ch.path !== 'rotation') continue;
        for (let i = 0; i < ch.values.length; i += 4) {
          expect(Math.hypot(...ch.values.slice(i, i + 4)), `${name}: ${key}`).toBeCloseTo(1, 4);
        }
      }
    }
  });

  it('keeps hands below shoulders throughout relaxed idle, walk and run', () => {
    const map = VISUALS.player_warlock.clips;
    for (const name of [map.idle, map.combatIdle!, map.walk, map.run]) {
      const clip = clips.get(name)!;
      expect(clip, name).toBeDefined();
      for (let frame = 0; frame <= 30; frame++) {
        rig.apply(samplePose(clip, (length(clip) * frame) / 30));
        for (const side of ['Left', 'Right']) {
          expect(position(`${side}Hand`).y, `${name}: ${side}`).toBeLessThan(
            position(`${side}Arm`).y - 0.16,
          );
        }
      }
    }
  });

  it('keeps the whole native preparation, including its body and hand choreography', () => {
    for (const [name, clip] of clips) {
      if (!name.endsWith('_Loop')) continue;
      const nativeLength = length(clip) - VISUALS.player_warlock.clips.castDurationFit!.tailSeconds;
      expect(nativeLength).toBeCloseTo(11.266666, 4);
      const start = samplePose(clip, 0);
      rig.apply(start);
      const hand = position('RightHand');
      expect(hand.distanceTo(new Vector3(-0.524, 1.231, -0.087))).toBeLessThan(0.004);
      let handMotion = 0;
      for (let frame = 1; frame <= 30; frame++) {
        rig.apply(samplePose(clip, (nativeLength * frame) / 30));
        handMotion = Math.max(handMotion, position('RightHand').distanceTo(hand));
      }
      expect(handMotion, `${name}: lost native gesture`).toBeGreaterThan(0.3);
      rig.apply(samplePose(clip, nativeLength / 2));
      expect(position('LeftHand').distanceTo(new Vector3(-0.281, 1.068, 0.385))).toBeLessThan(0.01);
    }
  });

  it('uses the upward 03 finish for self/ally, the forward 01 finish for hostile, and recovers to idle', () => {
    const outputs = ['Self', 'Ally', 'Shadow'].map((kind) => {
      const clip = clips.get(`WarlockT1_Cast${kind}_Release`)!;
      rig.apply(samplePose(clip, 0.14));
      const hands = ['LeftHand', 'RightHand'].map(position);
      const end = samplePose(clip, length(clip));
      const idle = samplePose(clips.get('WarlockT1_TravelIdle')!, 0);
      for (const [key, value] of idle) {
        sameValue(key, end.get(key)!, value);
      }
      return hands;
    });
    for (const [index, kind] of ['Self', 'Ally'].entries()) {
      expect(sources.get(`WarlockT1_Cast${kind}_Release`)).toContain('Standing 1H Magic Attack 03');
      expect(outputs[index][1].y).toBeGreaterThan(1.7);
      expect(outputs[index][1].y).toBeGreaterThan(outputs[2][1].y + 0.3);
    }
    expect(outputs[0][1].distanceTo(outputs[1][1])).toBeLessThan(0.00001);
    expect(sources.get('WarlockT1_CastShadow_Release')).toContain('Standing 1H Magic Attack 01');
  });

  it('joins preparation to release on the exact same pose instead of restarting the attack', () => {
    for (const kind of ['Shadow', 'Fire', 'Drain', 'Self', 'Ally']) {
      const clip = clips.get(`WarlockT1_Cast${kind}_Loop`)!;
      const end = samplePose(clip, length(clip));
      const release = clips.get(`WarlockT1_Cast${kind}_Release`)!;
      const first = samplePose(release, 0);
      for (const [key, value] of end) sameValue(key, first.get(key)!, value);
      if (kind === 'Self' || kind === 'Ally') continue;
      expect(sources.get(`WarlockT1_Cast${kind}_Loop`)).toContain('Standing Idle 03');
      expect(sources.get(`WarlockT1_Cast${kind}_Release`)).toContain('Standing 1H Magic Attack 01');
      rig.apply(samplePose(release, 0.2));
      expect(position('RightHand').z, kind).toBeGreaterThan(0.6);
    }
  });

  it('uses the supplied Arm Space idle without adding an IK elbow bend', () => {
    for (const name of ['TravelIdle', 'ReadyIdle']) {
      const clip = clips.get(`WarlockT1_${name}`)!;
      expect(sources.get(`WarlockT1_${name}`)).toBe('Druid Idle.fbx/Character Arm Space');
      expect(length(clip)).toBeCloseTo(8.333333, 4);
      for (let i = 0; i <= 20; i++) {
        rig.apply(samplePose(clip, (length(clip) * i) / 20));
        expect(position('LeftHand').x, name).toBeGreaterThan(name === 'ReadyIdle' ? 0.265 : 0.18);
        expect(position('RightHand').x, name).toBeLessThan(name === 'ReadyIdle' ? -0.265 : -0.18);
        for (const side of ['Left', 'Right']) {
          const upper = position(`${side}Arm`).sub(position(`${side}ForeArm`));
          const lower = position(`${side}Hand`).sub(position(`${side}ForeArm`));
          expect(upper.angleTo(lower), `${name}: excessive ${side} elbow bend`).toBeGreaterThan(
            Math.PI - (name === 'ReadyIdle' ? 0.27 : 0.65),
          );
        }
      }
    }
  });

  it('follows the front/side arm guides while preserving combat idle and the feet', () => {
    const calm = clips.get('WarlockT1_TravelIdle')!;
    const ready = clips.get('WarlockT1_ReadyIdle')!;
    for (let i = 0; i <= 20; i++) {
      const time = (length(calm) * i) / 20;
      rig.apply(samplePose(ready, time));
      const before = ['Left', 'Right'].map((side) => ({
        foot: position(`${side}Foot`),
      }));
      rig.apply(samplePose(calm, time));
      for (const [index, side] of ['Left', 'Right'].entries()) {
        const shoulder = position(`${side}Arm`);
        const elbow = position(`${side}ForeArm`);
        const wrist = position(`${side}Hand`);
        const lower = wrist.clone().sub(elbow);
        // Front guide: elbows retain clearance, wrists hang beneath them.
        expect(Math.abs(elbow.x) - Math.abs(shoulder.x)).toBeGreaterThan(0.06);
        expect(Math.abs(lower.x)).toBeLessThan(0.012);
        expect(lower.y).toBeLessThan(-0.2);
        // Side guide: wrists are forward, not hyperextended behind elbows.
        // Anatomical forward is +Z, independently checked from foot/toe bones.
        expect(position('LeftToeBase').z).toBeGreaterThan(position('LeftFoot').z);
        expect(lower.z).toBeGreaterThan(0.04);
        expect(lower.z).toBeLessThan(0.1);
        expect(position(`${side}Foot`).distanceTo(before[index].foot)).toBeLessThan(0.00001);
      }
    }
    const start = samplePose(calm, 0);
    const end = samplePose(calm, length(calm));
    for (const [key, value] of start) sameValue(key, end.get(key)!, value);
  });

  it('moves the shoulders slightly backward from the approved arm-guide pose', () => {
    rig.apply(samplePose(clips.get('WarlockT1_TravelIdle')!, 0));
    // Recorded first-frame landmarks from the user-approved arm-guide pose.
    // Forward is +Z: this pins backward movement, not just a rotation sign.
    for (const [bone, previousZ] of [
      ['LeftArm', 0.0742],
      ['RightArm', 0.0509],
      ['Head', 0.0489],
    ] as const) {
      const backward = previousZ - position(bone).z;
      expect(backward, bone).toBeGreaterThan(0.004);
      expect(backward, bone).toBeLessThan(0.009);
    }
  });
});
