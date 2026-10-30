import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ShotLocomotionLayer } from '../src/render/characters/shot_locomotion';

function fixture(names = ['shot']) {
  const root = new THREE.Group();
  const hip = new THREE.Object3D();
  hip.name = 'mixamorigHips';
  const spine = new THREE.Object3D();
  spine.name = 'mixamorigSpine';
  root.add(hip);
  hip.add(spine);
  const mixer = new THREE.AnimationMixer(root);
  const clip = (name: string, hipX: number, spineY: number) =>
    new THREE.AnimationClip(name, 1, [
      new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [hipX, 0, 0, hipX + 1, 0, 0]),
      new THREE.VectorKeyframeTrack(
        'mixamorigSpine.position',
        [0, 1],
        [0, spineY, 0, 0, spineY + 1, 0],
      ),
    ]);
  const shotClip = clip('shot', 10, 20);
  const shot = mixer.clipAction(shotClip).setLoop(THREE.LoopOnce, 1);
  shot.clampWhenFinished = true;
  const walk = mixer.clipAction(clip('walk', 0, 0));
  const layer = new ShotLocomotionLayer(mixer, names);
  return { root, hip, spine, mixer, shot, walk, shotClip, layer };
}

describe('disjoint shot locomotion on one mixer', () => {
  it('keeps standing and non-opted-in actions unchanged', () => {
    const f = fixture();
    expect(f.layer.sync(f.shot, true, f.walk, 'idle', null, true)).toBe(f.shot);
    expect(f.layer.sync(f.walk, true, f.walk, 'run', 1, true)).toBe(f.walk);
    expect(f.layer.sync(f.shot, false, f.walk, 'run', 1, true)).toBe(f.shot);
    const optOut = fixture([]);
    expect(optOut.layer.sync(optOut.shot, true, optOut.walk, 'run', 1, true)).toBe(optOut.shot);
  });
  it('keeps the shot clock/speed, samples hips from gait, and never mutates shared tracks', () => {
    const f = fixture();
    const tracks = [...f.shotClip.tracks];
    f.shot.time = 0.3;
    f.shot.timeScale = 1.3;
    f.walk.time = 0.2;
    const upper = f.layer.sync(f.shot, true, f.walk, 'walk', 1.4, true);
    expect(upper).not.toBe(f.shot);
    expect(upper?.time).toBeCloseTo(0.3);
    expect(upper?.timeScale).toBe(1.3);
    expect(upper?.getClip().tracks.map((track) => track.name)).toEqual(['mixamorigSpine.position']);
    f.mixer.update(0.1);
    expect(f.hip.position.x).toBeCloseTo(0.34);
    expect(f.spine.position.y).toBeCloseTo(20.43);
    expect(f.shotClip.tracks).toEqual(tracks);
    expect(f.layer.sync(upper, true, f.walk, 'walk', 1.4, true)).toBe(upper);
  });
  it('returns to a full standing shot at the existing clock rather than restarting', () => {
    const f = fixture();
    f.shot.time = 0.3;
    const upper = f.layer.sync(f.shot, true, f.walk, 'walk', 1, true);
    f.mixer.update(0.1);
    const full = f.layer.sync(upper, true, f.walk, 'idle', null, true);
    expect(full).toBe(f.shot);
    expect(full?.time).toBeCloseTo(0.4);
    f.mixer.update(0.2);
    expect(f.hip.position.x).toBeCloseTo(10.6);
  });
  it('hands back the end-of-frame gait phase even when the shot finishes before the lower action updates', () => {
    const f = fixture();
    f.shot.time = 0.9;
    f.walk.time = 0.4;
    const upper = f.layer.sync(f.shot, true, f.walk, 'run', 1.5, true);
    f.mixer.addEventListener('finished', (event) => {
      if (event.action !== upper) return;
      f.walk.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      f.layer.handoff(f.walk, upper);
    });
    f.mixer.update(0.2);
    f.layer.afterUpdate();
    expect(f.walk.time).toBeCloseTo(0.7);
    expect(f.walk.paused).toBe(false);
  });
  it('stops owned layers for previews/death without leaving a hidden gait active', () => {
    const f = fixture();
    const upper = f.layer.sync(f.shot, true, f.walk, 'run', 1, true);
    f.mixer.update(0.1);
    f.layer.stop();
    expect(upper?.isScheduled()).toBe(false);
    f.shot.reset().setEffectiveWeight(1).play();
    f.mixer.update(0.1);
    expect(f.hip.position.x).toBeCloseTo(10.1);
  });
});
