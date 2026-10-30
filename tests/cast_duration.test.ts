import { AnimationClip, AnimationMixer, LoopOnce, NumberKeyframeTrack, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { CastDurationMixer } from '../src/render/characters/cast_duration';

function setup() {
  const model = new Object3D();
  const mixer = new AnimationMixer(model);
  const action = mixer
    .clipAction(
      new AnimationClip('prepare', 12, [new NumberKeyframeTrack('.position[x]', [0, 12], [0, 12])]),
    )
    .play();
  return { model, mixer, action, driver: new CastDurationMixer() };
}
const fit = { tailSeconds: 0.76, tailPlaybackSeconds: 0.3, maxPreparationSpeed: 1.35 };
describe('duration-fitted preparation on the real THREE mixer', () => {
  it('samples the authoritative phase, interpolates and holds the final pose without repeating', () => {
    const { model, mixer, action, driver } = setup();
    const snapshot = { castTotal: 3, castRemaining: 1.5 };
    driver.update(mixer, action, 0.01, snapshot, fit);
    expect(model.position.x).toBeCloseTo(11.24 - (2.7 - 1.5) * 1.35);
    expect(action.timeScale).toBe(1.35);
    const previous = model.position.x;
    driver.update(mixer, action, 0.02, snapshot, fit);
    expect(model.position.x).toBeGreaterThan(previous);
    driver.update(mixer, action, 0.1, { castTotal: 3, castRemaining: 0 }, fit);
    expect(model.position.x).toBeCloseTo(12);
    driver.update(mixer, action, 0.1, { castTotal: 3, castRemaining: 0 }, fit);
    expect(action.time).toBe(12);
    expect(action.loop).toBe(LoopOnce);
    expect(action.paused).toBe(false);
  });
  it('leaves release one-shots and ordinary rigs on their native clock, and resets for a new cast', () => {
    const { mixer, action, driver } = setup();
    driver.update(mixer, action, 0.1);
    expect(action.time).toBeCloseTo(0.1);
    driver.update(mixer, action, 0.1, { castTotal: 3, castRemaining: 0 }, fit);
    driver.update(mixer, action, 0.1);
    action.reset().play();
    driver.update(mixer, action, 0.1, { castTotal: 3, castRemaining: 3 }, fit);
    expect(action.time).toBeCloseTo(11.24 - 2.7 * 1.35);
  });
  it('keeps the capped preparation rate while an interrupted cast fades into movement', () => {
    const { model, mixer, action, driver } = setup();
    driver.update(mixer, action, 0.01, { castTotal: 1.5, castRemaining: 1.5 }, fit);
    const previous = action.time;
    const walk = mixer
      .clipAction(
        new AnimationClip('walk', 1, [new NumberKeyframeTrack('.position[x]', [0, 1], [0, 0])]),
      )
      .play()
      .crossFadeFrom(action, 0.2, false);
    driver.update(mixer, walk, 0.1);
    expect(action.time - previous).toBeCloseTo(0.135);
    expect(Number.isFinite(model.position.x)).toBe(true);
  });
});
