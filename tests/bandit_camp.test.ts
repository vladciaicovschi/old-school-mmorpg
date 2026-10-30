import { describe, expect, it } from 'vitest';
import {
  BANDIT_CAMP,
  BANDIT_CAMP_MODELS,
  BANDIT_CAMP_SUPPLIES,
  gradeBanditCamp,
} from '../src/sim/bandit_camp';
import { isBlocked, resolveMovement } from '../src/sim/colliders';
import { BUILTIN_WORLD, CAMPS, QUESTS } from '../src/sim/data';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { floorHeightAt, MAX_STEP_HEIGHT, moveCharacter } from '../src/sim/physics';
import { SETTLEMENTS } from '../src/sim/settlements_layout';
import { Sim } from '../src/sim/sim';
import { groundHeight, terrainHeight } from '../src/sim/world';

function walkWithCharacterPhysics(seed: number, route: { x: number; z: number }[]) {
  let p = { ...route[0], y: groundHeight(route[0].x, route[0].z, seed) };
  const out = { ...p, blocked: false, stepped: 0 };
  const params = {
    seed,
    radius: PLAYER_BODY_RADIUS,
    stepHeight: MAX_STEP_HEIGHT,
    maxSlope: PLAYER_MAX_CLIMB_SLOPE,
    grounded: true,
    swimming: false,
    ignoreFences: false,
  };
  for (const target of route.slice(1)) {
    for (let tick = 0; tick < 650 && Math.hypot(target.x - p.x, target.z - p.z) > 0.03; tick++) {
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
    }
    expect(Math.hypot(target.x - p.x, target.z - p.z), JSON.stringify({ p, target })).toBeLessThan(
      0.04,
    );
  }
}

const point = (t: { x: number; z: number; rot?: number; scale?: number | number[] }, x: number, z: number) => ({
  x: t.x + (x * Math.cos(t.rot ?? 0) + z * Math.sin(t.rot ?? 0)) * (typeof t.scale === 'number' ? t.scale : 1),
  z: t.z + (-x * Math.sin(t.rot ?? 0) + z * Math.cos(t.rot ?? 0)) * (typeof t.scale === 'number' ? t.scale : 1),
});
describe('approved Gorrak camp in the built-in game', () => {
  it('removes the old bandit tents without removing the fishermen tent', () => {
    expect(SETTLEMENTS.find((s) => s.id === BANDIT_CAMP.id)).toBeDefined();
    expect(BUILTIN_WORLD.props.tents.some((t) => t.x === 113 && t.z === 47)).toBe(false);
    for (const [x, z] of [[58, 25], [68, 16], [119, 39]])
      expect(BUILTIN_WORLD.props.tents.some((t) => t.x === x && t.z === z)).toBe(false);
    expect(BUILTIN_WORLD.props.tents.some((t) => t.x === -90.5 && t.z === -78.5)).toBe(true);
    expect(BUILTIN_WORLD.props.tents.length).toBeGreaterThan(0);
    expect(BANDIT_CAMP.dressing.filter((p) => p.kind === 'tent')).toHaveLength(3);
    for (const tent of BANDIT_CAMP.dressing.filter((p) => p.kind === 'tent'))
      expect(tent.scale).toBe(tent.id === 'leader' ? 0.8 : 0.68);
    expect(BANDIT_CAMP.roads).toEqual([]);
    expect(BANDIT_CAMP.dressing.some((p) => p.id.startsWith('supply-'))).toBe(false);
  });
  for (const seed of [20061, 42]) {
    it(`keeps actors, quest IDs and six real supply pickups, seed ${seed}`, () => {
      const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true });
      expect([...sim.entities.values()].filter((e) => e.templateId === 'vale_bandit')).toHaveLength(
        11,
      );
      expect([...sim.entities.values()].filter((e) => e.templateId === 'gorrak')).toHaveLength(1);
      const boxes = [...sim.entities.values()].filter(
        (e) => e.kind === 'object' && e.objectItemId === 'supply_crate',
      );
      expect(boxes).toHaveLength(6);
      expect(boxes.slice(0, 4).map((e) => [e.pos.x, e.pos.z])).toEqual(
        BANDIT_CAMP_SUPPLIES.map((p) => [p.x, p.z]),
      );
      expect(CAMPS.filter((c) => c.mobId === 'vale_bandit').map((c) => c.count)).toEqual([6, 5]);
      expect(QUESTS.q_supplies).toBeDefined();
    });
    for (const tent of BANDIT_CAMP.dressing.filter((p) => p.id === 'leader')) {
      it(`walks through ${tent.id}'s actual offset entrance and back, seed ${seed}`, () => {
        const emerald = tent.modelId.endsWith('emerald');
        const x = emerald ? 0.9 : 0,
          front = emerald ? 5.9 : 7.3,
          inside = emerald ? 1.4 : 3.0;
        const a = point(tent, x, front),
          b = point(tent, x, inside);
        const result = resolveMovement(seed, a.x, a.z, b.x, b.z, 0.5);
        expect(Math.hypot(result.x - b.x, result.z - b.z)).toBeLessThan(0.06);
        const back = resolveMovement(seed, b.x, b.z, a.x, a.z, 0.5);
        expect(Math.hypot(back.x - a.x, back.z - a.z)).toBeLessThan(0.06);
        const model = BANDIT_CAMP_MODELS[tent.modelId];
        expect(model.metadata.campShell?.length).toBeGreaterThan(4);
        const grade = terrainHeight(tent.x, tent.z, seed);
        for (const [dx, dz] of [
          [-4, -4],
          [4, 4],
          [-4, 4],
          [4, -4],
        ]) {
          const p = point(tent, dx, dz);
          expect(terrainHeight(p.x, p.z, seed)).toBeCloseTo(grade, 8);
        }
      });
    }
    it(`keeps the boss floor and approach clear, seed ${seed}`, () => {
      expect(isBlocked(seed, 118.755, 44.832, 0.5)).toBe(false);
      const route = [
        [98, 25],
        [104, 31],
        [115, 37],
        [118.755, 44.832],
        [125.4, 46],
        [127, 49],
        [127, 59],
        [130, 68],
      ];
      for (let i = 1; i < route.length; i++) {
        const [a, b] = [route[i - 1], route[i]];
        const result = resolveMovement(seed, a[0], a[1], b[0], b[1], 0.5);
        expect(Math.hypot(result.x - b[0], result.z - b[1])).toBeLessThan(0.06);
      }
    });
  }
  it('does not probe or alter terrain outside the camp', () => {
    expect(
      gradeBanditCamp(58, -58, 123, () => {
        throw new Error('outside probe');
      }),
    ).toBe(123);
  });
  it('keeps the smaller sleeping tents closed to full-height movement', () => {
    for (const tent of BANDIT_CAMP.dressing.filter((p) => p.kind === 'tent' && p.id !== 'leader')) {
      const a = point(tent, 0.9, 5.9), b = point(tent, 0.9, 1.4);
      const moved = resolveMovement(20061, a.x, a.z, b.x, b.z, 0.5);
      expect(Math.hypot(moved.x - b.x, moved.z - b.z)).toBeGreaterThan(0.5);
    }
  });
  it('walks across the graded approach and all entrances with the real step/slope kernel', () => {
    const seed = 20061;
    walkWithCharacterPhysics(
      seed,
      [
        [98, 25],
        [104, 31],
        [115, 37],
        [118.755, 44.832],
        [125.4, 46],
        [127, 49],
        [127, 59],
        [130, 68],
      ].map(([x, z]) => ({ x, z })),
    );
    for (const tent of BANDIT_CAMP.dressing.filter((p) => p.id === 'leader')) {
      const emerald = tent.modelId.endsWith('emerald'),
        x = emerald ? 0.9 : 0;
      const a = point(tent, x, emerald ? 5.9 : 7.3),
        b = point(tent, x, emerald ? 1.4 : 3);
      walkWithCharacterPhysics(seed, [a, b, a]);
    }
  });
});
