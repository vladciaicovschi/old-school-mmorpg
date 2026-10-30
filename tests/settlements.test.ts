import { afterEach, describe, expect, it } from 'vitest';
import { ARCHITECTURE_REFERENCE } from '../src/sim/architecture_scale';
import { isBlocked } from '../src/sim/colliders';
import { MAILBOXES } from '../src/sim/content/mailboxes';
import { NOTICEBOARDS } from '../src/sim/content/noticeboards';
import { BUILTIN_WORLD, setActiveWorldContent } from '../src/sim/data';
import { isExcludedDecoration } from '../src/sim/decoration_exclusions';
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
  it('walks through the Wolf Run gate and barracks, climbs and returns', () => {
    setActiveWorldContent(BUILTIN_WORLD);
    const fort = plans.find((p) => p.settlement.id === 'wolf-run-fort' && p.lot.id === 'barracks')!;
    const point = (x: number, z: number) =>
      localPoint(fort.lot, x * fort.scale, z * fort.scale + fort.placement.offsetZ);
    const door = point(0, 5),
      inside = point(0, 3.6),
      aisle = point(0.65, 3.3),
      stair = point(1.8, 2.1),
      upstairs = point(1.8, -2.7);
    const end = walk([{ x: 6, z: -5.5 }, { x: 10, z: -5.5 }, { x: 17, z: -5.5 }, { x: 18, z: -1 }, door, inside, aisle, stair, upstairs]);
    expect(end.y).toBeGreaterThan(fort.placement.grade + 3 * fort.scale - 0.5);
    walk([upstairs, stair, aisle, inside, door], end.y);
    expect(isBlocked(seed, 10, -16, 0.5)).toBe(true);
    expect(isExcludedDecoration(24, -8, 0, BUILTIN_WORLD.props.buildings)).toBe(true);
    expect(BUILTIN_WORLD.props.decorProps?.some((p) => p.key === 'hexBarracks' && p.x === 17.5)).toBe(false);
    expect(BUILTIN_WORLD.props.decorProps?.some((p) => p.key === 'hexWatchtower' && p.x === 27)).toBe(false);
  });
  it('replaces all four settlements and keeps Wickharbor lots and remote camps', () => {
    expect(plans).toHaveLength(38);
    expect(
      BUILTIN_WORLD.props.buildings.filter((b) => b.id?.startsWith('settlement:')),
    ).toHaveLength(38);
    expect(
      BUILTIN_WORLD.props.buildings.filter((b) => b.id?.startsWith('wickharbor:')),
    ).toHaveLength(21);
    expect(BUILTIN_WORLD.props.tents.some((p) => p.x === -12 && p.z === 1500)).toBe(true);
    for (const p of plans) expect(SETTLEMENT_MODELS[p.modelId].url).toMatch(/^\/models\//);
  });
  it('calibrates every native doorway against the 1.80 metre player stature', () => {
    const reference = ARCHITECTURE_REFERENCE;
    for (const plan of plans) {
      const height =
        plan.modelId === 'fort:tower'
          ? 2.127084732055664 - 0.0352252721786499
          : plan.modelId.includes('warehouse')
            ? reference.warehouseDoorSourceHeight
            : plan.modelId.startsWith('icemantle:') || plan.modelId === 'eastbrook:chapel'
              ? reference.roundDoorSourceHeight
              : reference.flatDoorSourceHeight;
      const doorMetres =
        ((height * plan.scale) / reference.personWorldHeight) * reference.personMetres;
      expect(doorMetres, plan.modelId).toBeGreaterThanOrEqual(2.2);
      expect(doorMetres, plan.modelId).toBeLessThanOrEqual(2.3);
      const nativeEntry = plan.nativeMetadata.entrance;
      if (nativeEntry)
        expect(plan.metadata.entrance!.width).toBeCloseTo(nativeEntry.width * plan.scale, 8);
    }
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
    for (const { placement: p, scale } of plans) {
      expect(p.rise).toBeLessThanOrEqual(0.18 * scale);
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
    const {
      lot,
      placement: p,
      scale,
    } = plans.find((p) => p.settlement.id === 'eastbrook' && p.lot.id === 'hearth-inn')!;
    const x = (p.landing.minX + p.landing.maxX) / 2,
      route = [
        p.approach.maxZ + 0.2,
        p.approach.maxZ,
        p.landing.maxZ,
        p.offsetZ + 3.5 * scale,
        p.offsetZ + 1.8 * scale,
        p.offsetZ,
      ].map((z) => localPoint(lot, x, z));
    const end = walk(route);
    walk([...route].reverse(), end.y);
  });
  it('walks from the square through Eastbrook chapel to its rear nave', () => {
    const {
      lot,
      placement: p,
      scale,
    } = plans.find((p) => p.settlement.id === 'eastbrook' && p.lot.id === 'chapel')!;
    const route = [
      p.approach.maxZ + 0.2,
      p.approach.maxZ,
      p.landing.maxZ,
      p.offsetZ + 5.5 * scale,
      p.offsetZ + 3 * scale,
      p.offsetZ,
      p.offsetZ - 4.5 * scale,
    ].map((z) => localPoint(lot, 0.04 * scale, z));
    const end = walk(route);
    walk([...route].reverse(), end.y);
  });
  it('keeps the native smithy crate beside the steps and leaves its approach walkable', () => {
    const {
      lot,
      placement: p,
      metadata,
      scale,
      modelId,
    } = plans.find((plan) => plan.settlement.id === 'eastbrook' && plan.lot.id === 'smith-house')!;
    const crate = p.terrainProps.find((prop) => prop.name === 'Crate_Wooden')!;
    expect(crate.placementOffset).toEqual([-2 * scale, 0]);
    const sourceCrate = SETTLEMENT_MODELS[modelId].metadata.terrainProps!.find(
      (prop) => prop.name === 'Crate_Wooden',
    )!;
    expect(sourceCrate.placementOffset).toBeUndefined();
    expect(crate.rect.maxX).toBeLessThan(p.landing.minX - PLAYER_BODY_RADIUS);
    expect(crate.contactGaps.max).toBeLessThanOrEqual(0.001);
    const route = [p.approach.maxZ + 0.2, p.approach.maxZ, p.landing.maxZ].map((z) =>
      localPoint(lot, metadata.entrance!.x, z),
    );
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
        scale,
      } = plans.find((p) => p.settlement.id === 'eastbrook' && p.lot.id === 'chapel')!,
      tower = m.bellTower!,
      local: [number, number][] = [
        [0.04 * scale, p.approach.maxZ + 0.2],
        [0.04 * scale, p.landing.maxZ],
        [0.04 * scale, p.offsetZ + 5.5 * scale],
        [0.04 * scale, p.offsetZ - 5.6 * scale],
        [0.04 * scale, p.offsetZ - 6.8 * scale],
        [-2.2 * scale, p.offsetZ - 6.8 * scale],
      ];
    for (const flight of tower.flights) {
      for (const step of flight.steps) local.push([step.x, p.offsetZ + step.z]);
      local.push([flight.to[0], p.offsetZ + flight.to[2]]);
    }
    local.push([1.6 * scale, p.offsetZ + tower.centerZ]);
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
