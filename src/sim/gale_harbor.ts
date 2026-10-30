// The Wickharbor waterfront: stilt-pier decks running out over the bay, plus
// the boardwalk decking the bluff edge between their roots and the Beacon's
// own dock off the headland's foot. Each deck is a rotated rectangle whose
// surface height is anchored to the terrain at its shore root, so every pier
// leaves the land flush and stays LEVEL on its way out over the water.
// WALKABLE raised ground: world.ts groundHeight takes the max of terrain and
// galeDeckSurface (the docks idiom, an absolute surface, not a lift), and
// render/wickharbor_yards.ts draws the plank-and-stilt geometry from the same
// definitions, so the deck the player stands on is exactly the deck they
// see. Pure leaf: deterministic, no SimContext, terrain and water level are
// passed in. Tested directly by tests/gale_harbor.test.ts.

export interface GaleDeckDef {
  /** rectangle center */
  x: number;
  z: number;
  /** heading of the long axis (radians, atan2(dx, dz) convention) */
  rot: number;
  /** half-length along the heading, half-width across it */
  hl: number;
  hw: number;
  /** shore anchor: the deck's surface height samples the terrain here */
  ax: number;
  az: number;
  /**
   * Optional far anchor: the deck becomes a ramp, its surface running from
   * the ax anchor's height at along=-hl to this anchor's height at along=+hl
   * (joins two deck levels where the shore itself climbs).
   */
  ax2?: number;
  az2?: number;
  /** Shore landings meet terrain directly instead of adding a plank-height lip. */
  startFlush?: boolean;
  endFlush?: boolean;
}

/** Deck plank surface sits this far above the shore anchor's ground. */
export const GALE_DECK_LIFT = 0.34;
/** A deck never sits lower than this above the waterline (freeboard). */
export const GALE_DECK_FREEBOARD = 0.55;

// Bounding box for the cheap early-out (all decks live in the harbor corner).
const DECKS_X1 = 440;
const DECKS_X2 = 536;
const DECKS_Z1 = 312;
const DECKS_Z2 = 392;

export const GALE_HARBOR_AXIS = 1.3;
/** Local u points out to sea; v runs along the quay, perpendicular to u. */
export function galeHarborPoint(u: number, v: number): { x: number; z: number } {
  const s = Math.sin(GALE_HARBOR_AXIS),
    c = Math.cos(GALE_HARBOR_AXIS);
  return { x: 481.6 - s * 12 + s * u + c * v, z: 353.7 - c * 12 + c * u - s * v };
}
function pier(u0: number, u1: number, v: number, hw: number): GaleDeckDef {
  return {
    ...galeHarborPoint((u0 + u1) / 2, v),
    rot: GALE_HARBOR_AXIS,
    hl: (u1 - u0) / 2,
    hw,
    ax: 465,
    az: 354,
  };
}
function quay(u: number, v0: number, v1: number): GaleDeckDef {
  return {
    ...galeHarborPoint(u, (v0 + v1) / 2),
    rot: GALE_HARBOR_AXIS + Math.PI / 2,
    hl: (v1 - v0) / 2,
    hw: 1.7,
    ax: 465,
    az: 354,
  };
}
function stair(v: number, shoreU = -11.7): GaleDeckDef {
  const end = galeHarborPoint(shoreU, v);
  return {
    ...galeHarborPoint((-1.7 + shoreU) / 2, v),
    rot: GALE_HARBOR_AXIS + Math.PI,
    hl: (-1.7 - shoreU) / 2,
    hw: 1.3,
    ax: 465,
    az: 354,
    ax2: end.x,
    az2: end.z,
    endFlush: true,
  };
}
const beaconRoot = { x: 517.2 - Math.sin(0.785) * 13, z: 337.2 - Math.cos(0.785) * 13 };
const beaconShore = {
  x: beaconRoot.x - Math.sin(0.785) * 14,
  z: beaconRoot.z - Math.cos(0.785) * 14,
};

// Rectangles meet edge to edge. Shared orthogonal axes avoid triangular gaps,
// overlapping plank faces and changing widths at T junctions. The shore quay
// has a square dogleg to follow the bay while all three finger piers stay parallel.
export const GALE_HARBOR_DECKS: GaleDeckDef[] = [
  pier(1.7, 30, 0, 1.8),
  pier(1.7, 26, -10, 2),
  pier(-8.3, 14, -28, 2),
  quay(0, -15.7, 2),
  pier(-11.7, -1.7, -14, 1.7),
  stair(-9),
  // Land in the existing clear approach south of the port office.
  stair(-4.5, -9),
  // The separate cape berth has its own straight axis and aligned shore stair.
  { x: 517.2, z: 337.2, rot: 0.785, hl: 13, hw: 2.2, ax: 507, az: 327 },
  {
    x: (beaconRoot.x + beaconShore.x) / 2,
    z: (beaconRoot.z + beaconShore.z) / 2,
    rot: 0.785,
    hl: 7,
    hw: 1.4,
    ax: beaconShore.x,
    az: beaconShore.z,
    ax2: 507,
    az2: 327,
    startFlush: true,
  },
  quay(-10, -30, -15.7),
];

/** Centerlines of every intentional deck-to-deck junction, for traversal/geometry QA. */
export const GALE_HARBOR_JUNCTIONS = [
  { a: 0, b: 3, ...galeHarborPoint(1.7, 0) },
  { a: 1, b: 3, ...galeHarborPoint(1.7, -10) },
  { a: 2, b: 9, ...galeHarborPoint(-8.3, -28) },
  { a: 3, b: 4, ...galeHarborPoint(-1.7, -14) },
  { a: 4, b: 9, ...galeHarborPoint(-10, -15.7) },
  { a: 5, b: 3, ...galeHarborPoint(-1.7, -9) },
  { a: 6, b: 3, ...galeHarborPoint(-1.7, -4.5) },
  { a: 7, b: 8, ...beaconRoot },
];

/**
 * The plank surface height of one deck at a point `along` its long axis
 * (terrain-anchored, freeboard-clamped; ramps lerp between their anchors).
 */
export function galeDeckSurfaceAt(
  deck: GaleDeckDef,
  along: number,
  terrainAt: (x: number, z: number) => number,
  waterLevel: number,
): number {
  const floor = waterLevel + GALE_DECK_FREEBOARD;
  const y0 = Math.max(terrainAt(deck.ax, deck.az), floor) + (deck.startFlush ? 0 : GALE_DECK_LIFT);
  if (deck.ax2 === undefined || deck.az2 === undefined) return y0;
  const y1 = Math.max(terrainAt(deck.ax2, deck.az2), floor) + (deck.endFlush ? 0 : GALE_DECK_LIFT);
  const t = Math.min(1, Math.max(0, (along + deck.hl) / (2 * deck.hl)));
  return y0 + (y1 - y0) * t;
}

/**
 * The harbor deck surface at (x, z): the highest plank plane underfoot, or
 * -Infinity outside every deck footprint.
 */
export function galeDeckSurface(
  x: number,
  z: number,
  terrainAt: (x: number, z: number) => number,
  waterLevel: number,
): number {
  if (x < DECKS_X1 || x > DECKS_X2 || z < DECKS_Z1 || z > DECKS_Z2) return -Infinity;
  let surface = -Infinity;
  for (const deck of GALE_HARBOR_DECKS) {
    const dx = x - deck.x;
    const dz = z - deck.z;
    const dirx = Math.sin(deck.rot);
    const dirz = Math.cos(deck.rot);
    const along = dx * dirx + dz * dirz;
    if (along < -deck.hl - 1e-7 || along > deck.hl + 1e-7) continue;
    const across = dx * dirz - dz * dirx;
    if (across < -deck.hw - 1e-7 || across > deck.hw + 1e-7) continue;
    surface = Math.max(surface, galeDeckSurfaceAt(deck, along, terrainAt, waterLevel));
  }
  return surface;
}
