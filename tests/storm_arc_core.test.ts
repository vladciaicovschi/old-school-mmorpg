import { describe, expect, it } from 'vitest';
import {
  ARC_FLOATS_PER_LINK,
  ARC_MAIN_FLOATS_PER_LINK,
  writeStormArcs,
} from '../src/render/characters/storm_arc_core';

describe('storm ribbon solver', () => {
  it('holds bolt shapes during a flash, provides silent gaps and stable reduced motion', () => {
    const ends = new Float32Array([0, 0, 0, 0, 1, 0]);
    const a = new Float32Array(ARC_FLOATS_PER_LINK),
      b = new Float32Array(a.length);
    const gain = new Float32Array(a.length / 3);
    writeStormArcs(a, ends, 0, gain);
    writeStormArcs(b, ends, 0.00001, gain);
    expect(a).toEqual(b);
    let flashes = 0,
      gaps = 0;
    for (let t = 0; t < 5; t += 0.02) {
      writeStormArcs(b, ends, t, gain);
      if (gain[0] > 0.05) flashes++;
      else gaps++;
    }
    expect(flashes).toBeGreaterThan(0);
    expect(gaps).toBeGreaterThan(flashes * 3);
    writeStormArcs(a, ends, 0, gain, true);
    expect(gain[0]).toBeGreaterThan(0);
    writeStormArcs(b, ends, 100, gain, true);
    expect(a).toEqual(b);
  });
  it('keeps both ribbon endpoints centered on their anchors for every phase', () => {
    const ends = new Float32Array([1, 2, 3, 4, 6, 7]);
    const out = new Float32Array(ARC_FLOATS_PER_LINK);
    for (const phase of [0, 0.3, 3, 10]) {
      writeStormArcs(out, ends, phase);
      for (let c = 0; c < 3; c++) {
        expect((out[c] + out[3 + c]) / 2).toBeCloseTo(ends[c], 5);
        expect(
          (out[ARC_MAIN_FLOATS_PER_LINK - 3 + c] + out[ARC_MAIN_FLOATS_PER_LINK - 6 + c]) / 2,
        ).toBeCloseTo(ends[3 + c], 5);
      }
      expect([...out].every(Number.isFinite)).toBe(true);
    }
  });
  it('is deterministic, animated, and finite for vertical or coincident anchors', () => {
    const a = new Float32Array(ARC_FLOATS_PER_LINK * 2),
      b = new Float32Array(a.length);
    const ends = new Float32Array([0, 0, 0, 0, 1, 0, 2, 2, 2, 2, 2, 2]);
    writeStormArcs(a, ends, 0);
    writeStormArcs(b, ends, 0);
    expect(a).toEqual(b);
    writeStormArcs(b, ends, 10);
    expect(a).not.toEqual(b);
    expect([...b].every(Number.isFinite)).toBe(true);
    expect([...b.subarray(ARC_FLOATS_PER_LINK)].every((v) => v === 2)).toBe(true);
  });
});
