import { describe, expect, it } from 'vitest';
import {
  createCastDurationClock,
  fittedCastTime,
} from '../src/render/characters/cast_duration_core';

const fit = { tailSeconds: 0.76, tailPlaybackSeconds: 0.3, maxPreparationSpeed: 1.35 };
const length = 11.266666 + 0.76;
describe('end-aligned preparation fitted to authoritative cast duration', () => {
  it.each([0.5, 1.5, 3, 6, 12])(
    'takes the longest natural-speed ending and reaches release at %s seconds',
    (total) => {
      const clock = createCastDurationClock();
      const tailTime = Math.min(0.3, total * 0.25);
      const preparationTime = total - tailTime;
      const expectedStart = Math.max(0, length - fit.tailSeconds - preparationTime * 1.35);
      expect(
        fittedCastTime(clock, { castTotal: total, castRemaining: total }, length, 0, fit),
      ).toBeCloseTo(expectedStart);
      expect(clock.playbackRate).toBeLessThanOrEqual(1.35);
      const midpoint = fittedCastTime(
        clock,
        { castTotal: total, castRemaining: total - preparationTime / 2 },
        length,
        0,
        fit,
      )!;
      expect(midpoint).toBeCloseTo((expectedStart + length - fit.tailSeconds) / 2);
      expect(
        fittedCastTime(clock, { castTotal: total, castRemaining: tailTime }, length, 0, fit),
      ).toBeCloseTo(length - 0.76);
      expect(
        fittedCastTime(clock, { castTotal: total, castRemaining: 0 }, length, 0, fit),
      ).toBeCloseTo(length);
    },
  );
  it('interpolates unchanged snapshots, seeks a late join, and follows pushback', () => {
    const clock = createCastDurationClock();
    const snapshot = { castTotal: 3, castRemaining: 2 };
    const first = fittedCastTime(clock, snapshot, length, 0.016, fit)!;
    const next = fittedCastTime(clock, snapshot, length, 0.016, fit)!;
    expect(next).toBeGreaterThan(first);
    const pushed = fittedCastTime(clock, { ...snapshot, castRemaining: 2.5 }, length, 0.016, fit)!;
    expect(pushed).toBeLessThan(first);
    expect(fittedCastTime(clock, { ...snapshot, castRemaining: 3 }, length, 0.016, fit, true)).toBe(
      length - fit.tailSeconds - 2.7 * 1.35,
    );
    for (let i = 0; i < 100; i++) fittedCastTime(clock, snapshot, length, 0.1, fit);
    expect(fittedCastTime(clock, snapshot, length, 0.1, fit)).toBe(length);
  });
  it('preserves old full-clip behavior when no speed cap is opted in', () => {
    const clock = createCastDurationClock();
    const uncapped = { tailSeconds: 0.76, tailPlaybackSeconds: 0.3 };
    expect(
      fittedCastTime(clock, { castTotal: 3, castRemaining: 3 }, length, 0, uncapped),
    ).toBeCloseTo(0);
    expect(clock.playbackRate).toBeGreaterThan(1.35);
    for (const maxPreparationSpeed of [0, -1, NaN, Infinity]) {
      expect(
        fittedCastTime(
          clock,
          { castTotal: 3, castRemaining: 3 },
          length,
          0,
          { ...fit, maxPreparationSpeed },
          true,
        ),
      ).toBeCloseTo(0);
    }
  });
  it('runs continuously across the shared preparation-to-attack boundary', () => {
    for (const total of [0.5, 1.5, 3, 6, 12]) {
      const clock = createCastDurationClock();
      const tailTime = Math.min(0.3, total * 0.25);
      const before = fittedCastTime(
        clock,
        { castTotal: total, castRemaining: tailTime + 0.00001 },
        length,
        0,
        fit,
      )!;
      const after = fittedCastTime(
        clock,
        { castTotal: total, castRemaining: tailTime - 0.00001 },
        length,
        0,
        fit,
      )!;
      expect(before).toBeLessThan(length - fit.tailSeconds);
      expect(after).toBeGreaterThan(length - fit.tailSeconds);
      expect(after - before).toBeLessThan(0.0001);
    }
  });
  it('rejects absent/nonfinite timing and falls back to linear fitting for an invalid tail', () => {
    const clock = createCastDurationClock();
    for (const castTotal of [undefined, 0, -1, NaN, Infinity])
      expect(fittedCastTime(clock, { castTotal, castRemaining: 1 }, length, 0.1, fit)).toBeNull();
    for (const castRemaining of [undefined, NaN, Infinity])
      expect(fittedCastTime(clock, { castTotal: 3, castRemaining }, length, 0.1, fit)).toBeNull();
    expect(
      fittedCastTime(clock, { castTotal: 3, castRemaining: 1.5 }, 12, 0, {
        tailSeconds: 0,
        tailPlaybackSeconds: 0.3,
      }),
    ).toBe(6);
  });
});
