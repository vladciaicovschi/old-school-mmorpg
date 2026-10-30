import { describe, expect, it } from 'vitest';
import { lineOfSightClear } from '../src/sim/colliders';
import { MAILBOXES } from '../src/sim/content/mailboxes';
import { BUILTIN_WORLD } from '../src/sim/data';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import {
  type CharacterMoveResult,
  floorHeightAt,
  MAX_STEP_HEIGHT,
  moveCharacter,
} from '../src/sim/physics';
import { buildWickharborColliders } from '../src/sim/wickharbor_colliders';
import { localPoint, WICKHARBOR_LIGHTHOUSE, wickharborPlans } from '../src/sim/wickharbor_layout';
import { groundHeight, terrainHeight } from '../src/sim/world';

const seed = 20061,
  height = (x: number, z: number) => terrainHeight(x, z, seed);
const plans = wickharborPlans(height);
const params = {
  seed,
  radius: PLAYER_BODY_RADIUS,
  stepHeight: MAX_STEP_HEIGHT,
  maxSlope: PLAYER_MAX_CLIMB_SLOPE,
  grounded: true,
  swimming: false,
  ignoreFences: false,
};
type Point = { x: number; z: number };
function walk(route: Point[], initialY?: number) {
  let p = { ...route[0], y: initialY ?? groundHeight(route[0].x, route[0].z, seed) };
  const out: CharacterMoveResult = { ...p, blocked: false, stepped: 0 };
  for (const target of route.slice(1)) {
    let ticks = 0;
    while (Math.hypot(target.x - p.x, target.z - p.z) > 0.025 && ticks++ < 2000) {
      const dx = target.x - p.x,
        dz = target.z - p.z,
        d = Math.hypot(dx, dz),
        step = Math.min(d, 0.04);
      moveCharacter(params, p.x, p.y, p.z, (dx / d) * step, (dz / d) * step, out);
      p = {
        x: out.x,
        z: out.z,
        y: floorHeightAt(seed, out.x, out.z, params.radius, out.y + 0.001),
      };
      if (ticks > 5 && Math.hypot(out.x - target.x, out.z - target.z) > d + 0.2)
        throw new Error(
          `Pushed off route near ${JSON.stringify(p)} toward ${JSON.stringify(target)}`,
        );
    }
    expect(
      Math.hypot(p.x - target.x, p.z - target.z),
      `Blocked near ${JSON.stringify(p)} toward ${JSON.stringify(target)}`,
    ).toBeLessThan(0.04);
  }
  return p;
}

describe('Wickharbor coastal rebuild', () => {
  it('keeps sight clear below overhead decks and between adjacent spiral treads', () => {
    expect(lineOfSightClear(seed, { x: 497.7, z: 308 }, { x: 498.3, z: 308 })).toBe(true);
    const s = WICKHARBOR_LIGHTHOUSE.metadata.staircase!,
      base = height(498, 308);
    const at = (i: number) => ({
      x: 498 + Math.sin((i + 0.5) * s.angleStep) * s.walkRadius,
      z: 308 + Math.cos((i + 0.5) * s.angleStep) * s.walkRadius,
    });
    const feet = (i: number) => base + s.baseY + ((i + 1) * (s.topY - s.baseY)) / s.count;
    expect(
      lineOfSightClear(seed, at(47), at(48), 0.05, undefined, 0, { from: feet(47), to: feet(48) }),
    ).toBe(true);
    expect(
      lineOfSightClear(
        seed,
        { x: 498, z: 308 },
        { x: 498 + 4 * WICKHARBOR_LIGHTHOUSE.scale, z: 308 },
      ),
    ).toBe(false);
  });
  it('has all approved lots, preserved services and no legacy harbor buildings', () => {
    expect(plans).toHaveLength(21);
    const buildings = BUILTIN_WORLD.props.buildings.filter((b) => b.id?.startsWith('wickharbor:'));
    expect(buildings).toHaveLength(21);
    expect(BUILTIN_WORLD.props.decorProps?.some((p) => p.key === 'hexbStables' && p.z > 500)).toBe(
      true,
    );
    expect(MAILBOXES.some((m) => m.x === 420 && m.z === 352)).toBe(true);
    expect(groundHeight(498, 308, seed)).toBeCloseTo(height(498, 308), 8);
  });
  it('seats entrances and props on current terrain, with deterministic collision', () => {
    for (const { placement, scale } of plans) {
      expect(placement.rise).toBeLessThanOrEqual(0.18 * scale);
      for (const prop of placement.terrainProps)
        expect(prop.contactGaps.max).toBeLessThanOrEqual(0.001);
    }
    expect(buildWickharborColliders(height)).toEqual(buildWickharborColliders(height));
  });
  it('walks through the tavern entrance to the aisle and back out', () => {
    const { lot, placement: p, scale, metadata } = plans.find((p) => p.lot.id === 'inn')!;
    const route = [
      p.approach.maxZ + 0.2,
      p.approach.maxZ,
      p.landing.maxZ,
      4.5 * scale,
      3.5 * scale,
      2 * scale,
      0,
    ].map((z) => localPoint(lot, 0.055 * scale, z));
    const end = walk(route);
    expect(end.y).toBeCloseTo(p.grade + metadata.interior!.floorY, 3);
    walk([...route].reverse(), end.y);
  });
  it('climbs the square bell tower through the chapel and descends', () => {
    const { lot, placement: p, metadata: m, scale } = plans.find((p) => p.lot.id === 'chapel')!;
    const tower = m.bellTower!;
    const local: [number, number][] = [
      [0.055 * scale, p.approach.maxZ + 0.2],
      [0.055 * scale, p.landing.maxZ],
      [0.055 * scale, p.offsetZ + 4.6 * scale],
      [0.055 * scale, p.offsetZ - 4.4 * scale],
      [0.055 * scale, p.offsetZ - 5.8 * scale],
      [-1.45 * scale, p.offsetZ - 5.8 * scale],
    ];
    for (const flight of tower.flights) {
      for (const step of flight.steps) local.push([step.x, p.offsetZ + step.z]);
      local.push([flight.to[0], p.offsetZ + flight.to[2]]);
    }
    local.push([1.45 * scale, p.offsetZ - 7.25 * scale]);
    const route = local.map(([x, z]) => localPoint(lot, x, z));
    const end = walk(route);
    expect(end.y).toBeCloseTo(p.grade + tower.platformY, 3);
    walk([...route].reverse(), end.y);
  });
  it('climbs every lighthouse turn and reaches the outer gallery', () => {
    const s = WICKHARBOR_LIGHTHOUSE.metadata.staircase!,
      base = height(498, 308);
    const at = (r: number, a: number) => ({ x: 498 + Math.sin(a) * r, z: 308 + Math.cos(a) * r });
    const route = [at(3.45 * WICKHARBOR_LIGHTHOUSE.scale, 0), at(s.walkRadius, 0)];
    for (let i = 0; i < s.count * 3; i++) route.push(at(s.walkRadius, ((i + 1) / 3) * s.angleStep));
    for (let i = 1; i <= 12; i++)
      route.push(at(s.walkRadius, s.endAngle + ((s.portalAngle - s.endAngle) * i) / 12));
    route.push(
      at(2.4 * WICKHARBOR_LIGHTHOUSE.scale, s.portalAngle),
      at(2.95 * WICKHARBOR_LIGHTHOUSE.scale, s.portalAngle),
    );
    const end = walk(route);
    expect(end.y).toBeCloseTo(base + s.topY, 3);
    walk([...route].reverse(), end.y);
  });
});
