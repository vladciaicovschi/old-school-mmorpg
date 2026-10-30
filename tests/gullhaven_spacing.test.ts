import { describe, expect, it } from 'vitest';
import { resolvePosition } from '../src/sim/colliders';
import { findPath, PLAYER_MAX_CLIMB_SLOPE, PLAYER_SWIM_DEPTH } from '../src/sim/pathfind';
import { floorHeightAt, MAX_STEP_HEIGHT, moveCharacter } from '../src/sim/physics';
import { SETTLEMENTS, settlementPlans } from '../src/sim/settlements_layout';
import { localPoint } from '../src/sim/wickharbor_layout';
import { groundHeight, terrainHeight, waterLevelAt } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const seed = WORLD_SEED;
const height = (x: number, z: number) => terrainHeight(x, z, seed);
const town = SETTLEMENTS.find((value) => value.id === 'gullhaven')!;

describe('Gullhaven wider residential passages', () => {
  it('keeps the canonical town services and NPC standing spots clear', () => {
    for (const point of town.fixed.filter((p) => p.type === 'npc'))
      expect(resolvePosition(seed, point.x, point.z, 0.6), point.id).toEqual({
        x: point.x,
        z: point.z,
      });
  });

  it.each([0.5, 0.7])(
    'walks from the square to both house approaches and back with radius %s',
    (radius) => {
      const square = { x: 310, z: 66 };
      for (const plan of settlementPlans(height).filter(
        (p) => p.settlement.id === 'gullhaven' && ['family-home', 'fisher-home'].includes(p.lot.id),
      )) {
        const p = plan.placement;
        const foot = localPoint(
          plan.lot,
          (p.landing.minX + p.landing.maxX) / 2,
          p.approach.maxZ + 0.8,
        );
        for (const [from, to] of [
          [square, foot],
          [foot, square],
        ]) {
          const path = findPath(from, to, {
            seed,
            minGround: (x, z) => waterLevelAt(x, z, seed) - PLAYER_SWIM_DEPTH,
            bodyRadius: radius,
            maxClimbSlope: PLAYER_MAX_CLIMB_SLOPE,
            maxSpan: 100,
          });
          expect(path.length, plan.lot.id).toBeGreaterThan(0);
          let position = { ...from, y: groundHeight(from.x, from.z, seed) };
          const out = { ...position, blocked: false, stepped: 0 };
          const params = {
            seed,
            radius,
            stepHeight: MAX_STEP_HEIGHT,
            maxSlope: PLAYER_MAX_CLIMB_SLOPE,
            grounded: true,
            swimming: false,
            ignoreFences: false,
          };
          for (const waypoint of [...path, to]) {
            let ticks = 0;
            while (
              Math.hypot(waypoint.x - position.x, waypoint.z - position.z) > 0.05 &&
              ticks++ < 1000
            ) {
              const dx = waypoint.x - position.x,
                dz = waypoint.z - position.z;
              const d = Math.hypot(dx, dz),
                stride = Math.min(d, 0.1);
              moveCharacter(
                params,
                position.x,
                position.y,
                position.z,
                (dx / d) * stride,
                (dz / d) * stride,
                out,
              );
              position = {
                x: out.x,
                z: out.z,
                y: floorHeightAt(seed, out.x, out.z, radius, out.y + 0.001),
              };
            }
            expect(
              Math.hypot(waypoint.x - position.x, waypoint.z - position.z),
              `${plan.lot.id}: ${JSON.stringify(position)} toward ${JSON.stringify(waypoint)}`,
            ).toBeLessThan(0.06);
          }
        }
      }
    },
    60000,
  );
});
