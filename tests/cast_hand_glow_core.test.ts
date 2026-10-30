import { describe, expect, it } from 'vitest';
import { castHandGlowPlanInto, usesHandCastPreparation } from '../src/render/cast_hand_glow_core';

describe('cast hand glow envelope', () => {
  it('requires the matching actor kind and template for preparation opt-in', () => {
    expect(usesHandCastPreparation('player', 'warlock')).toBe(true);
    for (const cls of [
      'mage',
      'priest',
      'druid',
      'shaman',
      'paladin',
      'hunter',
      'warrior',
      'rogue',
    ])
      expect(usesHandCastPreparation('player', cls)).toBe(true);
    expect(usesHandCastPreparation('mob', 'dev_skeleton_cultist')).toBe(true);
    for (const [kind, template] of [
      ['mob', 'warlock'],
      ['player', 'dev_skeleton_cultist'],
      ['mob', 'dev_skeleton_rogue_v3'],
      ['player', 'unknown_class'],
      [undefined, 'dev_skeleton_cultist'],
      ['mob', undefined],
    ])
      expect(usesHandCastPreparation(kind, template)).toBe(false);
  });
  it('grows gently with the actual cast progress, without a separate release flash', () => {
    const plan = { size: 0, coreSize: 0, alpha: 0, coreAlpha: 0 };
    castHandGlowPlanInto(plan, 0, 1);
    const start = { ...plan };
    castHandGlowPlanInto(plan, 1, 1);
    expect(plan.size).toBeGreaterThan(start.size);
    expect(plan.size).toBeCloseTo(0.27 * 1.2 * 1.08);
    expect(plan.alpha).toBeGreaterThan(start.alpha);
    expect(plan.coreSize).toBeLessThan(plan.size);
    const end = { ...plan };
    castHandGlowPlanInto(plan, 20, 1);
    expect(plan).toEqual(end);
  });

  it('clamps invalid clocks and keeps the glow readable at minimum quality', () => {
    const plan = { size: 0, coreSize: 0, alpha: 0, coreAlpha: 0 };
    for (const progress of [NaN, Infinity, -1, 0, 1]) {
      castHandGlowPlanInto(plan, progress, NaN);
      expect(Object.values(plan).every(Number.isFinite)).toBe(true);
      expect(plan.size).toBeGreaterThan(0.14);
      expect(plan.alpha).toBeGreaterThan(0.3);
    }
  });
});
