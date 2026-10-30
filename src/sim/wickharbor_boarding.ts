import type { Collider } from './colliders';
import { GALE_HARBOR_DECKS, galeDeckSurfaceAt } from './gale_harbor';
import type { ZonePropsDef } from './types';
import { WICKHARBOR_SAILSHIP_KEYS, WICKHARBOR_VESSELS } from './wickharbor_vessels';

type Decor = NonNullable<ZonePropsDef['decorProps']>[number];
export const isWickharborShip = (key: string): boolean =>
  WICKHARBOR_SAILSHIP_KEYS.some((ship) => ship === key);

/** Measured in the prop extractor's centered, bow +Z frame. */
export const SHIP_MAIN_DECK_Y = 3.321;
export const SHIP_BOARDING_Z = -2;
export const WICKHARBOR_BERTHS = [
  { vessel: 0, deck: 0, side: 1 },
  { vessel: 1, deck: 1, side: -1 },
  { vessel: 2, deck: 2, side: 1 },
  { vessel: 3, deck: 2, side: -1 },
  { vessel: 5, deck: 7, side: 1 },
  { vessel: 6, deck: 7, side: -1 },
] as const;

export function shipPoint(ship: Decor, x: number, z: number) {
  const c = Math.cos(ship.rot ?? 0),
    s = Math.sin(ship.rot ?? 0),
    scale = ship.scale ?? 1;
  return { x: ship.x + (x * c + z * s) * scale, z: ship.z + (-x * s + z * c) * scale };
}

export interface BoardingRun {
  vessel: number;
  deck: number;
  side: number;
  start: { x: number; z: number };
  end: { x: number; z: number };
  yStart: number;
  yEnd: number;
  width: number;
}

/** Only alongside berths get a gangway; the roadstead ship stays offshore. */
export function wickharborBoardingRuns(
  terrain: (x: number, z: number) => number,
  water: number,
): BoardingRun[] {
  return BOARDING_PLANS.map((plan) => seatBoardingRun(plan, terrain, water));
}

const BOARDING_PLANS = WICKHARBOR_BERTHS.map(({ vessel, deck: index, side }) => {
  const ship = WICKHARBOR_VESSELS[vessel],
    deck = GALE_HARBOR_DECKS[index];
  const end = shipPoint(ship, -side * 1.65, SHIP_BOARDING_Z);
  const along = (end.x - deck.x) * Math.sin(deck.rot) + (end.z - deck.z) * Math.cos(deck.rot);
  if (Math.abs(along) > deck.hl - 0.8)
    throw new Error(`Berth ${vessel} needs pier overlap for perpendicular boarding`);
  const across = side * (deck.hw - 0.45);
  return {
    vessel,
    deck: index,
    side,
    end,
    width: 1.1,
    start: {
      x: deck.x + Math.sin(deck.rot) * along + Math.cos(deck.rot) * across,
      z: deck.z + Math.cos(deck.rot) * along - Math.sin(deck.rot) * across,
    },
    along,
  };
});

function seatBoardingRun(
  plan: (typeof BOARDING_PLANS)[number],
  terrain: (x: number, z: number) => number,
  water: number,
): BoardingRun {
  const ship = WICKHARBOR_VESSELS[plan.vessel];
  return {
    ...plan,
    yStart: galeDeckSurfaceAt(GALE_HARBOR_DECKS[plan.deck], plan.along, terrain, water),
    yEnd: water - (ship.float ?? 0) + SHIP_MAIN_DECK_Y * ship.scale,
  };
}

export function boardingCoordinates(run: BoardingRun, x: number, z: number) {
  const dx = run.end.x - run.start.x,
    dz = run.end.z - run.start.z,
    length = Math.hypot(dx, dz);
  return {
    t: ((x - run.start.x) * dx + (z - run.start.z) * dz) / (length * length),
    across: ((x - run.start.x) * dz - (z - run.start.z) * dx) / length,
  };
}

/** A small crest clears the solid gunwale before descending onto the deck. */
export function boardingHeight(run: BoardingRun, t: number): number {
  const crest = Math.max(run.yStart, run.yEnd) + 0.3;
  return t < 0.4
    ? run.yStart + ((crest - run.yStart) * Math.max(0, t)) / 0.4
    : t < 0.83
      ? crest
      : crest + (run.yEnd - crest) * Math.min(1, (t - 0.83) / 0.17);
}

export function wickharborBoardingSurface(
  x: number,
  z: number,
  terrain: (x: number, z: number) => number,
  water: number,
): number {
  if (x < 440 || x > 536 || z < 312 || z > 405) return -Infinity;
  let top = -Infinity;
  for (const ship of WICKHARBOR_VESSELS) {
    if (!isWickharborShip(ship.key)) continue;
    const dx = x - ship.x,
      dz = z - ship.z,
      c = Math.cos(ship.rot ?? 0),
      s = Math.sin(ship.rot ?? 0);
    const lx = (dx * c - dz * s) / ship.scale,
      lz = (dx * s + dz * c) / ship.scale;
    // Central working deck, stopping before the cabins and bow narrowing.
    if (Math.abs(lx) <= 2.45 && lz >= -5.2 && lz <= 1)
      top = Math.max(top, water - (ship.float ?? 0) + SHIP_MAIN_DECK_Y * ship.scale);
  }
  for (const plan of BOARDING_PLANS) {
    const dx = plan.end.x - plan.start.x,
      dz = plan.end.z - plan.start.z,
      length = Math.hypot(dx, dz),
      t = ((x - plan.start.x) * dx + (z - plan.start.z) * dz) / (length * length),
      across = ((x - plan.start.x) * dz - (z - plan.start.z) * dx) / length;
    if (t >= 0 && t <= 1 && Math.abs(across) <= plan.width / 2)
      top = Math.max(top, boardingHeight(seatBoardingRun(plan, terrain, water), t));
  }
  return top;
}

/** The low hull blocks swimmers but no longer walls off the raised gangway. */
export function wickharborShipCollider(ship: Decor, water: number): Collider {
  return {
    type: 'obb',
    x: ship.x,
    z: ship.z,
    hw: ship.hw ?? 2.5,
    hd: ship.hd ?? 10,
    rot: ship.rot ?? 0,
    moveTopY: water - (ship.float ?? 0) + SHIP_MAIN_DECK_Y * (ship.scale ?? 1),
    cameraTopY: water + 18 * (ship.scale ?? 1),
  };
}
