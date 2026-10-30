import { describe, expect, it } from 'vitest';
import { cutawayBlocksView } from '../src/render/building_cutaway/visibility_core';

describe('selective building cutaway segment', () => {
  const wall = { minX: -3, maxX: 3, minY: 0, maxY: 4, minZ: 2.9, maxZ: 3.1 };
  it('cuts the near wall and keeps the opposite wall for an indoor player', () => {
    expect(cutawayBlocksView(wall, false, 0, 1.7, 0, 0, 3, 8)).toBe(true);
    expect(cutawayBlocksView({ ...wall, minZ: -3.1, maxZ: -2.9 }, false, 0, 1.7, 0, 0, 3, 8)).toBe(
      false,
    );
    expect(cutawayBlocksView(wall, false, 0, 1.7, 0, 0, 1.7, 1)).toBe(false);
  });
  it('keeps a supporting floor and cuts a ceiling only when crossed', () => {
    const floor = { minX: -3, maxX: 3, minY: -0.02, maxY: 0.02, minZ: -3, maxZ: 3 };
    expect(cutawayBlocksView(floor, true, 0, 1.7, 0, 0, 8, 6)).toBe(false);
    const ceiling = { ...floor, minY: 2.99, maxY: 3.03 };
    expect(cutawayBlocksView(ceiling, true, 0, 1.7, 0, 0, 8, 6)).toBe(true);
    expect(cutawayBlocksView(ceiling, true, 0, 4.7, 0, 0, 8, 6)).toBe(false);
    expect(cutawayBlocksView(ceiling, true, 0, 1.7, 0, 0, 2, 6)).toBe(false);
  });
  it('does not cut structures beyond either endpoint or an elevated roof above both', () => {
    expect(cutawayBlocksView(wall, false, 0, 1.7, 5, 0, 3, 8)).toBe(false);
    expect(cutawayBlocksView(wall, false, 0, 1.7, -8, 0, 3, -5)).toBe(false);
    expect(cutawayBlocksView({ ...wall, minY: 9, maxY: 11 }, false, 0, 1.7, 0, 0, 3, 8)).toBe(
      false,
    );
  });
  it('uses a wider release margin to avoid flickering at a wall edge', () => {
    expect(cutawayBlocksView(wall, false, 3.3, 1.7, 0, 3.3, 3, 8, false)).toBe(false);
    expect(cutawayBlocksView(wall, false, 3.3, 1.7, 0, 3.3, 3, 8, true)).toBe(true);
    expect(cutawayBlocksView(wall, false, 3.4, 1.7, 0, 3.4, 3, 8, true)).toBe(false);
  });
});
