import { describe, expect, it } from 'vitest';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { floorHeightAt, MAX_STEP_HEIGHT, moveCharacter } from '../src/sim/physics';
import { settlementPlans } from '../src/sim/settlements_layout';
import {
  groundRange,
  localPoint,
  seatTerrainProp,
  wickharborPlans,
} from '../src/sim/wickharbor_layout';
import { groundHeight, terrainHeight } from '../src/sim/world';

describe('native entrances on alternate world terrain', () => {
  it.each([1, 42, 20061])(
    'fits all settlement entrances without buried steps for seed %s',
    (seed) => {
      const height = (x: number, z: number) => terrainHeight(x, z, seed);
      const plans = [...settlementPlans(height), ...wickharborPlans(height)];
      expect(plans).toHaveLength(56);
      for (const { lot, placement, scale } of plans) {
        if (placement.openAir) continue;
        expect(placement.rise, lot.id).toBeGreaterThanOrEqual(-0.001 * scale);
        expect(placement.rise, lot.id).toBeLessThanOrEqual(0.18 * scale);
        for (const step of placement.steps)
          expect(groundRange(lot, step, height).max, lot.id).toBeLessThan(step.top);
      }
    },
  );
  it('walks the actual steep seed 1 sanctuary stairs to the landing and back', () => {
    const seed = 1;
    const height = (x: number, z: number) => terrainHeight(x, z, seed);
    const plan = settlementPlans(height).find((p) => p.lot.id === 'stone-sanctuary')!;
    const { lot, placement: p, metadata } = plan;
    expect(p.steps).toHaveLength(23);
    const route = [
      p.approach.maxZ + 0.2,
      p.approach.maxZ,
      ...p.steps.map((step) => (step.minZ + step.maxZ) / 2).reverse(),
      p.landing.maxZ,
    ].map((z) => localPoint(lot, metadata.entrance!.x, z));
    let pos = { ...route[0], y: groundHeight(route[0].x, route[0].z, seed) };
    const out = { ...pos, blocked: false, stepped: 0 };
    const params = {
      seed,
      radius: PLAYER_BODY_RADIUS,
      stepHeight: MAX_STEP_HEIGHT,
      maxSlope: PLAYER_MAX_CLIMB_SLOPE,
      grounded: true,
      swimming: false,
      ignoreFences: false,
    };
    for (const target of [...route.slice(1), ...route.slice(0, -1).reverse()]) {
      let ticks = 0;
      while (Math.hypot(target.x - pos.x, target.z - pos.z) > 0.025 && ticks++ < 600) {
        const dx = target.x - pos.x,
          dz = target.z - pos.z,
          d = Math.hypot(dx, dz),
          step = Math.min(d, 0.04);
        moveCharacter(params, pos.x, pos.y, pos.z, (dx / d) * step, (dz / d) * step, out);
        pos = {
          x: out.x,
          z: out.z,
          y: floorHeightAt(seed, out.x, out.z, params.radius, out.y + 0.001),
        };
      }
      expect(Math.hypot(target.x - pos.x, target.z - pos.z)).toBeLessThan(0.04);
    }
  });

  it('leaves every entrance foot free for a full character body after widening lots', () => {
    const seed = 20061;
    const height = (x: number, z: number) => terrainHeight(x, z, seed);
    for (const plan of [...settlementPlans(height), ...wickharborPlans(height)]) {
      if (plan.placement.openAir) continue;
      const p = plan.placement;
      const foot = localPoint(
        plan.lot,
        (p.landing.minX + p.landing.maxX) / 2,
        p.approach.maxZ + 0.8,
      );
      const y = floorHeightAt(
        seed,
        foot.x,
        foot.z,
        PLAYER_BODY_RADIUS,
        height(foot.x, foot.z) + MAX_STEP_HEIGHT,
      );
      const out = { ...foot, y, blocked: false, stepped: 0 };
      moveCharacter(
        {
          seed,
          radius: PLAYER_BODY_RADIUS,
          stepHeight: MAX_STEP_HEIGHT,
          maxSlope: PLAYER_MAX_CLIMB_SLOPE,
          grounded: true,
          swimming: false,
          ignoreFences: false,
        },
        foot.x,
        y,
        foot.z,
        0,
        0,
        out,
      );
      expect
        .soft(Math.hypot(out.x - foot.x, out.z - foot.z), `${plan.lot.modelId}:${plan.lot.id}`)
        .toBeLessThan(0.001);
    }
  });

  it('grounds native entrance clutter at the displaced renderer and collider anchor', () => {
    const prop = {
      min: [-1, 0, -0.5],
      max: [1, 1, 0.5],
      supportPoints: [
        [-1, 0, -0.5],
        [1, 0, -0.5],
        [-1, 0, 0.5],
        [1, 0, 0.5],
      ],
    };
    for (const [name, x] of [
      ['Bench', -0.3],
      ['FarmCrate_Apple', 0.3],
    ] as const) {
      const placement = seatTerrainProp(
        { x: 0, z: 0, rot: 0 },
        { ...prop, name },
        0,
        0,
        (x, z) => x * 0.05 + z * 0.02,
      );
      expect(placement.placementOffset).toEqual([x, 0]);
      expect(placement.rect.minX).toBeCloseTo(prop.min[0] + x - 0.04, 8);
      expect(placement.pivot).toEqual([0, 0, 0]);
      expect(placement.contactGaps.max).toBeLessThan(0);
    }
    const placement = seatTerrainProp(
      { x: 0, z: 0, rot: 0 },
      { ...prop, name: 'Bench', placementOffset: [-2, 0.5] },
      0,
      0,
      () => 0,
    );
    expect(placement.placementOffset).toEqual([-2.3, 0.5]);
  });
});
