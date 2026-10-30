import { describe, expect, it } from 'vitest';
import { supportHeightAt } from '../src/sim/colliders';
import { WICKHARBOR_LIGHTHOUSE } from '../src/sim/wickharbor_layout';
import { groundHeight, terrainHeight } from '../src/sim/world';

describe('the Old Beacon interior spiral', () => {
  it('keeps several turns above the same ground without a heightfield plug', () => {
    const { x, z, metadata } = WICKHARBOR_LIGHTHOUSE,
      seed = 20061;
    const s = metadata.staircase!,
      base = terrainHeight(x, z, seed),
      a = s.angleStep * 8.5;
    const px = x + Math.sin(a) * s.walkRadius,
      pz = z + Math.cos(a) * s.walkRadius;
    expect(groundHeight(px, pz, seed)).toBeCloseTo(terrainHeight(px, pz, seed), 8);
    const lower = supportHeightAt(seed, px, pz, 0.5, base + 2);
    const upper = supportHeightAt(seed, px, pz, 0.5, base + 9);
    expect(lower).toBeGreaterThan(base + 1);
    expect(upper - lower).toBeGreaterThan(6);
    expect(s.angleStep * s.count).toBeGreaterThan(Math.PI * 4);
  });
  it('removes the old exterior flights and their invisible lawn walls', () => {
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI * 2) / 32,
        x = 498 + Math.sin(a) * 5.5,
        z = 308 + Math.cos(a) * 5.5;
      expect(groundHeight(x, z, 20061)).toBeCloseTo(terrainHeight(x, z, 20061), 8);
    }
  });
});
