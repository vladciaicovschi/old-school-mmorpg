import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { architectureFootprints, architectureGap } from '../src/sim/settlement_space';
import {
  localPoint,
  seatTerrainProp,
  WICKHARBOR_LOTS,
  wickharborPlans,
} from '../src/sim/wickharbor_layout';
import { WICKHARBOR_SHARED_BENCHES, yardLayout } from '../src/sim/wickharbor_yard_layout';
import { terrainHeight } from '../src/sim/world';

const height = (x: number, z: number) => terrainHeight(x, z, 20061);
const roofs = WICKHARBOR_LOTS.flatMap((lot) => architectureFootprints(lot));

describe('Wickharbor household decor after scaling', () => {
  it('keeps the actual shared benches clear of enlarged houses and one another', () => {
    const bytes = readFileSync(
      new URL('../public/models/wickharbor/yard_bench.glb', import.meta.url),
    );
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const support = gltf.scenes[0].extras.groundSupport;
    const footprints = WICKHARBOR_SHARED_BENCHES.map((bench) => ({
      ...bench,
      id: 'shared-bench',
      rect: {
        minX: support.min[0],
        maxX: support.max[0],
        minZ: support.min[2],
        maxZ: support.max[2],
      },
    }));
    for (let i = 0; i < footprints.length; i++) {
      const fixture = footprints[i];
      for (const roof of roofs)
        expect(architectureGap(fixture, roof), roof.id).toBeGreaterThanOrEqual(0.4);
      const seat = seatTerrainProp(
        fixture,
        { ...support, name: 'yard-bench' },
        0,
        height(fixture.x, fixture.z),
        height,
      );
      expect(seat.contactGaps.max).toBeLessThanOrEqual(0.001);
    }
    expect(architectureGap(footprints[0], footprints[1])).toBeGreaterThan(0.6);
  });

  it('moves the front garden with its house frontage instead of leaving it under the wall', () => {
    const plan = wickharborPlans(height).find((p) => p.lot.id === 'h07')!;
    const yard = yardLayout(plan.lot, plan.placement, WICKHARBOR_LOTS);
    expect(yard.beds).toHaveLength(1);
    for (const bed of yard.beds) {
      expect(bed.minZ).toBeGreaterThan(plan.lot.d / 2);
      const fixture = { id: 'garden', x: plan.lot.x, z: plan.lot.z, rot: plan.lot.rot, rect: bed };
      for (const roof of roofs) expect(architectureGap(fixture, roof), roof.id).toBeGreaterThan(0);
      const world = localPoint(plan.lot, bed.minX, bed.minZ);
      expect(Number.isFinite(height(world.x, world.z))).toBe(true);
    }
  });
});
