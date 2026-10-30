import { describe, expect, it } from 'vitest';
import {
  type AnimState,
  desiredBaseState,
  locomotionTimeScale,
} from '../src/render/characters/anim_state';
import { VISUALS } from '../src/render/characters/manifest';
import { desiredModelBaseState } from '../src/render/characters/model_gait_core';
import { newLocoTrack, updateLocomotion } from '../src/render/locomotion';
import { DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const state = (patch: Partial<AnimState> = {}): AnimState => ({
  speed: 0,
  moving: false,
  running: false,
  backwards: false,
  airborne: false,
  dead: false,
  casting: false,
  swimming: false,
  submerged: false,
  swimPitch: 0,
  wading: false,
  sitting: false,
  ...patch,
});
const goat = { runEnter: 1.55, runExit: 1.3 };

describe('native model gait selection', () => {
  it('selects a matching goat gait from the actual displayed-motion track', () => {
    const def = VISUALS.npc_dev_smart_goat;
    for (const speed of [0.85, DEV_MODEL_LAB_MOBS.dev_smart_goat.moveSpeed]) {
      const track = newLocoTrack();
      let base: ReturnType<typeof desiredModelBaseState> = 'idle';
      let st = state();
      for (let frame = 0; frame < 180; frame++) {
        st = state(updateLocomotion(track, 0, speed / 60, 0, 1 / 60));
        base = desiredModelBaseState(st, false, false, true, goat, base);
      }
      expect(st.running).toBe(false);
      expect(base).toBe(speed > 1 ? 'run' : 'walk');
      const scale = locomotionTimeScale(base, st, def.walkRef, def.runRef);
      if (scale === null) throw new Error('Missing travel cadence');
      const reference = base === 'run' ? def.runRef : def.walkRef;
      if (!reference) throw new Error('Missing goat reference');
      expect(reference * scale).toBeCloseTo(speed, 4);
    }
  });

  it('holds the body-specific gait between thresholds without following noisy global flags', () => {
    const st = state({ speed: 1.4, moving: true, running: false });
    expect(desiredModelBaseState(st, false, false, false, goat, 'run')).toBe('run');
    expect(desiredModelBaseState({ ...st, running: true }, false, false, false, goat, 'walk')).toBe(
      'walk',
    );
    expect(desiredModelBaseState({ ...st, speed: 1.55 }, false, false, false, goat, 'walk')).toBe(
      'run',
    );
    expect(desiredModelBaseState({ ...st, speed: 1.3 }, false, false, false, goat, 'run')).toBe(
      'walk',
    );
  });

  it.each([
    state(),
    state({ combat: true }),
    state({ moving: true, speed: 3.4, running: false }),
    state({ moving: true, speed: 7, running: true }),
    state({ moving: true, swimming: true }),
  ])('preserves the existing rule for models without a gait override', (st) => {
    expect(desiredModelBaseState(st, true, true, true)).toBe(
      desiredBaseState(st, true, true, true),
    );
  });

  it.each([
    [state({ moving: true, speed: 3.4, swimming: true }), 'swimSurface'],
    [state({ moving: true, speed: 3.4, airborne: true }), 'jump'],
    [state({ moving: true, speed: 3.4, casting: true }), 'cast'],
    [state({ moving: true, speed: 3.4, wading: true }), 'wade'],
    [state({ moving: true, speed: 3.4, backwards: true }), 'walkBack'],
    [state({ speed: 3.4, combat: true }), 'combatIdle'],
  ] as const)('preserves non-travel priority', (st, expected) => {
    expect(desiredModelBaseState(st, true, true, true, goat, 'run')).toBe(expected);
  });
});
