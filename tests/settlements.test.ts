import { afterEach, describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { MAILBOXES } from '../src/sim/content/mailboxes';
import { NOTICEBOARDS } from '../src/sim/content/noticeboards';
import { BUILTIN_WORLD, setActiveWorldContent } from '../src/sim/data';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import {
  type CharacterMoveResult,
  floorHeightAt,
  MAX_STEP_HEIGHT,
  moveCharacter,
} from '../src/sim/physics';
import { buildSettlementColliders } from '../src/sim/settlements_colliders';
import {
  SETTLEMENT_MODELS,
  SETTLEMENTS,
  settlementItemPlacement,
  settlementPlans,
  settlementService,
} from '../src/sim/settlements_layout';
import { emptyZoneProps } from '../src/sim/types';
import { localPoint } from '../src/sim/wickharbor_layout';
import { groundHeight, terrainHeight } from '../src/sim/world';

const seed = 20061,
  height = (x: number, z: number) => terrainHeight(x, z, seed),
  plans = settlementPlans(height);
afterEach(() => setActiveWorldContent(null));
function walk(route: { x: number; z: number }[], initialY?: number) {
  let p = { ...route[0], y: initialY ?? groundHeight(route[0].x, route[0].z, seed) };
  const out: CharacterMoveResult = { ...p, blocked: false, stepped: 0 },
    params = {
      seed,
      radius: PLAYER_BODY_RADIUS,
      stepHeight: MAX_STEP_HEIGHT,
      maxSlope: PLAYER_MAX_CLIMB_SLOPE,
      grounded: true,
      swimming: false,
      ignoreFences: false,
    };
  for (const target of route.slice(1)) {
    let ticks = 0;
    while (Math.hypot(target.x - p.x, target.z - p.z) > 0.03 && ticks++ < 600) {
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
    expect(
      Math.hypot(target.x - p.x, target.z - p.z),
      `blocked ${JSON.stringify(p)} toward ${JSON.stringify(target)}`,
    ).toBeLessThan(0.04);
  }
  return p;
}
describe('approved settlement integration', () => {
  it('replaces all four settlements and keeps Wickharbor lots and remote camps', () => {
    expect(plans).toHaveLength(35);
    expect(
      BUILTIN_WORLD.props.buildings.filter((b) => b.id?.startsWith('settlement:')),
    ).toHaveLength(35);
    expect(
      BUILTIN_WORLD.props.buildings.filter((b) => b.id?.startsWith('wickharbor:')),
    ).toHaveLength(21);
    expect(BUILTIN_WORLD.props.tents.some((p) => p.x === -12 && p.z === 1500)).toBe(true);
    for (const p of plans) expect(SETTLEMENT_MODELS[p.modelId].url).toMatch(/^\/models\//);
  });
  it('uses actual mailbox and board entities at the approved facade poses', () => {
    for (const id of ['eastbrook', 'icemantle', 'gullhaven', 'gibbetmere']) {
      const m = settlementService(id, 'mailbox')!,
        b = settlementService(id, 'noticeboard')!;
      expect(MAILBOXES.some((p) => p.x === m.x && p.z === m.z && p.facing === (m.rot ?? 0))).toBe(
        true,
      );
      const board = NOTICEBOARDS.find(
        (p) => p.id === (id === 'gibbetmere' ? 'gallowmere_noticeboard' : `${id}_noticeboard`),
      )!;
      expect(board).toMatchObject({ x: b.x, z: b.z, rotation: b.rot ?? 0 });
      expect(board.frontStandingPoint.x).toBeCloseTo(b.x + Math.sin(b.rot ?? 0) * 1.5, 7);
    }
  });
  it('keeps generic building collision for copied settlement ids in custom worlds', () => {
    setActiveWorldContent({
      ...BUILTIN_WORLD,
      props: {
        ...emptyZoneProps(),
        buildings: [
          {
            id: 'settlement:custom:copied-house',
            kind: 'house',
            x: 0,
            z: 40,
            w: 4,
            d: 4,
            rot: 0,
          },
        ],
      },
      services: undefined,
    });
    expect(isBlocked(seed, 0, 40, 0.5)).toBe(true);
  });
  it('has deterministic native entrance stairs and grounded independent props', () => {
    for (const { placement: p } of plans) {
      expect(p.rise).toBeLessThanOrEqual(0.18);
      for (const prop of p.terrainProps) expect(prop.contactGaps.max).toBeLessThanOrEqual(0.001);
    }
    for (const s of SETTLEMENTS)
      for (const item of s.dressing)
        expect(settlementItemPlacement(item, height).seating.contactGaps.max).toBeLessThanOrEqual(
          0.001,
        );
    expect(buildSettlementColliders(height)).toEqual(buildSettlementColliders(height));
  });
  it('walks into Eastbrook tavern and back along the centre aisle', () => {
    const { lot, placement: p } = plans.find(
      (p) => p.settlement.id === 'eastbrook' && p.lot.id === 'hearth-inn',
    )!;
    const x = (p.landing.minX + p.landing.maxX) / 2,
      route = [
        p.approach.maxZ + 0.2,
        p.approach.maxZ,
        p.landing.maxZ,
        p.offsetZ + 3.5,
        p.offsetZ + 1.8,
        p.offsetZ,
      ].map((z) => localPoint(lot, x, z));
    const end = walk(route);
    walk([...route].reverse(), end.y);
  });
  it('walks from the square through Eastbrook chapel to its rear nave', () => {
    const { lot, placement: p } = plans.find(
      (p) => p.settlement.id === 'eastbrook' && p.lot.id === 'chapel',
    )!;
    const route = [
      p.approach.maxZ + 0.2,
      p.approach.maxZ,
      p.landing.maxZ,
      p.offsetZ + 5.5,
      p.offsetZ + 3,
      p.offsetZ,
      p.offsetZ - 4.5,
    ].map((z) => localPoint(lot, 0.04, z));
    const end = walk(route);
    walk([...route].reverse(), end.y);
  });
  it('retains the clear Gullhaven gate passage', () => {
    const gate = SETTLEMENTS.find((s) => s.id === 'gullhaven')!.fortifications.find(
      (p) => p.type === 'gate',
    )!;
    const route = [-2, -0.5, 0.5, 2].map((z) => localPoint({ ...gate, rot: gate.rot ?? 0 }, 0, z));
    walk(route);
  });
  it('climbs the Eastbrook bell tower through its nave and returns', () => {
    const {
        lot,
        placement: p,
        metadata: m,
      } = plans.find((p) => p.settlement.id === 'eastbrook' && p.lot.id === 'chapel')!,
      tower = m.bellTower!,
      local: [number, number][] = [
        [0.04, p.approach.maxZ + 0.2],
        [0.04, p.landing.maxZ],
        [0.04, p.offsetZ + 5.5],
        [0.04, p.offsetZ - 5.6],
        [0.04, p.offsetZ - 6.8],
        [-2.2, p.offsetZ - 6.8],
      ];
    for (const flight of tower.flights) {
      for (const step of flight.steps) local.push([step.x, p.offsetZ + step.z]);
      local.push([flight.to[0], p.offsetZ + flight.to[2]]);
    }
    local.push([1.6, p.offsetZ + tower.centerZ]);
    const route = local.map(([x, z]) => localPoint(lot, x, z)),
      end = walk(route);
    expect(end.y).toBeCloseTo(p.grade + tower.platformY, 3);
    walk([...route].reverse(), end.y);
  });
  it('guards the belfry stairwell against walking through its inner railing', () => {
    const {
        lot,
        placement: p,
        metadata: m,
      } = plans.find((p) => p.settlement.id === 'eastbrook' && p.lot.id === 'chapel')!,
      tower = m.bellTower!,
      guard = tower.stairwell[1],
      start = localPoint(lot, guard.maxX + 0.8, p.offsetZ + tower.centerZ - 0.5),
      target = localPoint(lot, guard.maxX - 0.5, p.offsetZ + tower.centerZ - 0.5),
      y = p.grade + tower.platformY,
      out: CharacterMoveResult = { ...start, y, blocked: false, stepped: 0 };
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
      start.x,
      y,
      start.z,
      target.x - start.x,
      target.z - start.z,
      out,
    );
    expect(Math.hypot(out.x - target.x, out.z - target.z)).toBeGreaterThan(0.6);
    expect(floorHeightAt(seed, out.x, out.z, PLAYER_BODY_RADIUS, y + 0.001)).toBeCloseTo(y, 3);
  });
});
