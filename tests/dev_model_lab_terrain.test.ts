import { describe, expect, it } from 'vitest';
import {
  DEV_MODEL_LAB_FLAT_PAD,
  devModelLabFlatHeight,
  devModelLabPadLandness,
} from '../src/sim/dev_model_lab_terrain';

describe('developer-island flat floor', () => {
  it('makes the interior level regardless of original elevation', () => {
    for (const original of [-30, -4, 0, 10, 80]) {
      expect(devModelLabFlatHeight(original, 1, -4.3)).toBeCloseTo(1.7, 9);
    }
  });

  it('leaves the sea unchanged and grades the coast continuously', () => {
    for (const land of [-1, 0, 0.02]) expect(devModelLabFlatHeight(-8, land, -4.3)).toBe(-8);
    let previous = -8;
    for (let step = 0; step <= 100; step++) {
      const next = devModelLabFlatHeight(-8, 0.02 + step / 1000, -4.3);
      expect(next).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(next - previous).toBeLessThan(0.15);
      previous = next;
    }
    expect(previous).toBeCloseTo(1.7, 9);
  });

  it('bounds the pad and rounds its outer corners', () => {
    const pad = DEV_MODEL_LAB_FLAT_PAD;
    expect(devModelLabPadLandness(pad.xMin, pad.zMin)).toBe(1);
    expect(devModelLabPadLandness(pad.xMax, pad.zMax)).toBe(1);
    expect(devModelLabPadLandness(pad.xMax + pad.skirt, 0)).toBe(-1);
    expect(devModelLabPadLandness(0, 0)).toBe(-1);
    expect(devModelLabPadLandness(pad.xMax + 15, pad.zMax + 15)).toBe(-1);
  });
});
