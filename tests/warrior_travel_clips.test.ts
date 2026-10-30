import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  addWarriorTravelClips,
  WARRIOR_TRAVEL_CLIPS,
  WARRIOR_WEAPON_GESTURE_DURATION,
  WARRIOR_WEAPON_GESTURE_SWAP_NORMALIZED,
} from '../src/render/characters/warrior_travel_clips';
import { WARRIOR_HIP_CARRY_CLIPS } from '../src/render/characters/warrior_travel_names';

const SOURCES = { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack' };

function fixture() {
  const model = new THREE.Group();
  const chest = new THREE.Bone();
  chest.name = 'mixamorigSpine2';
  chest.position.y = 1.4;
  model.add(chest);
  const tracks: THREE.KeyframeTrack[] = [];
  for (const side of ['Left', 'Right']) {
    let parent: THREE.Object3D = chest;
    for (const part of ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'HandIndex1']) {
      const bone = new THREE.Bone();
      bone.name = `mixamorig${side}${part}`;
      bone.position.y = part === 'ForeArm' ? 0.2 : part === 'Hand' ? 0.28 : 0.08;
      if (part === 'Shoulder') bone.position.x = side === 'Left' ? 0.08 : -0.08;
      if (part === 'Arm') {
        bone.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(side === 'Left' ? 0.7 : -0.7, -0.7, 0).normalize(),
        );
      }
      parent.add(bone);
      parent = bone;
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${bone.name}.quaternion`,
          [0, 1],
          [0.3, 0, 0, Math.sqrt(0.91), 0.3, 0, 0, Math.sqrt(0.91)],
        ),
      );
      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${bone.name}.position`,
          [0, 1],
          [...bone.position.toArray(), ...bone.position.toArray()],
        ),
      );
    }
  }
  tracks.push(
    new THREE.VectorKeyframeTrack(
      'mixamorigHips.position',
      [0, 0.5, 1],
      [0, 1, 0, 0, 1.04, 0, 0, 1, 0],
    ),
  );
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      'mixamorigLeftUpLeg.quaternion',
      [0, 0.5, 1],
      [0, 0, 0, 1, 0.3, 0, 0, Math.sqrt(0.91), 0, 0, 0, 1],
    ),
  );
  const clips = new Map<string, THREE.AnimationClip>();
  for (const name of Object.values(SOURCES)) {
    clips.set(
      name,
      new THREE.AnimationClip(
        name,
        1,
        tracks.map((track) => track.clone()),
      ),
    );
  }
  return { model, clips };
}

function quaternion(clip: THREE.AnimationClip, name: string, time: number) {
  const track = clip.tracks.find((candidate) => candidate.name === `${name}.quaternion`);
  if (!track) throw new Error(`missing ${name}`);
  return new THREE.Quaternion().fromArray(track.createInterpolant().evaluate(time));
}

describe('warrior travel and carry clips', () => {
  it('preserves already authored native travel while still generating carry gestures', () => {
    const { clips, model } = fixture();
    const native = new THREE.AnimationClip(WARRIOR_TRAVEL_CLIPS.walk, 2, []);
    clips.set(native.name, native);
    addWarriorTravelClips(clips, model, SOURCES);
    expect(clips.get(native.name)).toBe(native);
    expect(clips.has(WARRIOR_HIP_CARRY_CLIPS.draw)).toBe(true);
    expect(clips.has(WARRIOR_TRAVEL_CLIPS.stow)).toBe(true);
  });

  it('reaches down for a belt weapon while keeping the shield shoulder reach', () => {
    const { clips, model } = fixture();
    addWarriorTravelClips(clips, model, SOURCES);
    const hip = clips.get(WARRIOR_HIP_CARRY_CLIPS.draw)!;
    const dual = clips.get(WARRIOR_HIP_CARRY_CLIPS.dualDraw)!;
    const shoulder = clips.get(WARRIOR_TRAVEL_CLIPS.draw)!;
    const swap = 0.4;
    expect(hip.duration).toBe(0.8);
    expect(
      new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion(hip, 'mixamorigRightArm', swap)).y,
    ).toBeLessThan(-0.8);
    expect(
      quaternion(hip, 'mixamorigLeftArm', swap).angleTo(
        quaternion(shoulder, 'mixamorigLeftArm', swap),
      ),
    ).toBeLessThan(0.001);
    expect(
      new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion(dual, 'mixamorigLeftArm', swap)).y,
    ).toBeLessThan(-0.8);
    const stow = clips.get(WARRIOR_HIP_CARRY_CLIPS.stow)!;
    expect(
      quaternion(hip, 'mixamorigRightArm', 0).angleTo(quaternion(stow, 'mixamorigRightArm', 0.8)),
    ).toBeLessThan(0.001);
  });
  it('preserves the original clips, lower-body gait and every translation', () => {
    const { clips, model } = fixture();
    const source = clips.get('walk')!;
    const before = source.toJSON();
    const bind = model.getObjectByName('mixamorigLeftArm')!.quaternion.clone();
    expect(addWarriorTravelClips(clips, model, SOURCES)).toBe(true);
    expect(source.toJSON()).toEqual(before);
    expect(model.getObjectByName('mixamorigLeftArm')!.quaternion.equals(bind)).toBe(true);
    const travel = clips.get(WARRIOR_TRAVEL_CLIPS.walk)!;
    expect(travel.duration).toBe(source.duration);
    for (const track of source.tracks) {
      if (track.name.endsWith('.position') || track.name.includes('UpLeg')) {
        const changed = travel.tracks.find((candidate) => candidate.name === track.name)!;
        expect(THREE.KeyframeTrack.toJSON(changed)).toEqual(THREE.KeyframeTrack.toJSON(track));
        expect(changed).not.toBe(track);
      }
    }
  });

  it('lowers the arms, adds gait swing and closes normalized quaternion loops', () => {
    const { clips, model } = fixture();
    addWarriorTravelClips(clips, model, SOURCES);
    for (const name of [
      WARRIOR_TRAVEL_CLIPS.idle,
      WARRIOR_TRAVEL_CLIPS.walk,
      WARRIOR_TRAVEL_CLIPS.run,
    ]) {
      const clip = clips.get(name)!;
      for (const track of clip.tracks.filter((track) => track.name.includes('Arm.quaternion'))) {
        const first = quaternion(clip, track.name.slice(0, -'.quaternion'.length), 0);
        const last = quaternion(clip, track.name.slice(0, -'.quaternion'.length), clip.duration);
        expect(first.angleTo(last)).toBeLessThan(0.001);
        for (let key = 0; key < track.values.length; key += 4) {
          expect(new THREE.Quaternion().fromArray(track.values, key).length()).toBeCloseTo(1, 5);
        }
      }
    }
    const walk = clips.get(WARRIOR_TRAVEL_CLIPS.walk)!;
    const arm = quaternion(walk, 'mixamorigLeftArm', 0);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(arm).y).toBeLessThan(-0.9);
    expect(
      quaternion(walk, 'mixamorigLeftArm', 0.25).angleTo(
        quaternion(walk, 'mixamorigLeftArm', 0.75),
      ),
    ).toBeGreaterThan(0.35);
  });

  it('reaches both shoulders at the prop swap and reverses draw/stow endpoints', () => {
    const { clips, model } = fixture();
    addWarriorTravelClips(clips, model, SOURCES);
    const draw = clips.get(WARRIOR_TRAVEL_CLIPS.draw)!;
    const stow = clips.get(WARRIOR_TRAVEL_CLIPS.stow)!;
    const swap = WARRIOR_WEAPON_GESTURE_DURATION * WARRIOR_WEAPON_GESTURE_SWAP_NORMALIZED;
    for (const side of ['Left', 'Right']) {
      const arm = `mixamorig${side}Arm`;
      expect(quaternion(draw, arm, swap).angleTo(quaternion(stow, arm, swap))).toBeLessThan(0.001);
      expect(quaternion(draw, arm, 0).angleTo(quaternion(stow, arm, stow.duration))).toBeLessThan(
        0.001,
      );
      expect(quaternion(draw, arm, draw.duration).angleTo(quaternion(stow, arm, 0))).toBeLessThan(
        0.001,
      );
      expect(
        new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion(draw, arm, swap)).y,
      ).toBeGreaterThan(0.3);
    }
    expect(draw.duration).toBe(WARRIOR_WEAPON_GESTURE_DURATION);
  });

  it('fails without registering partial clips when a gait or arm chain is absent', () => {
    const { clips, model } = fixture();
    clips.delete('run');
    expect(addWarriorTravelClips(clips, model, SOURCES)).toBe(false);
    expect(clips.has(WARRIOR_TRAVEL_CLIPS.idle)).toBe(false);
    expect(addWarriorTravelClips(fixture().clips, new THREE.Group(), SOURCES)).toBe(false);
  });
});
