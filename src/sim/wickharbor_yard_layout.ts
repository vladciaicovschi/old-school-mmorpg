import {
  type Lot,
  localPoint,
  type Placement,
  type Rect,
  WICKHARBOR_FIXED,
  WICKHARBOR_ROADS,
} from './wickharbor_layout';

// The shared bench pair sits between enlarged houses, outside their eaves.
export const WICKHARBOR_SHARED_BENCHES = [
  { x: 409.25, z: 394.75, rot: 0 },
  { x: 409.8, z: 392.4, rot: Math.PI / 2 },
] as const;

export interface Point {
  x: number;
  z: number;
}
export interface Yard {
  fences: { a: Point; b: Point }[];
  beds: Rect[];
  logs: Point[];
}
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    length2 = dx * dx + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
export function isClearDressing(point: Point, lots: readonly Lot[], clearance = 0.2): boolean {
  for (const road of WICKHARBOR_ROADS)
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i];
      if (
        segmentDistance(point, { x: a[0], z: a[1] }, { x: b[0], z: b[1] }) <
        road.width / 2 + clearance
      )
        return false;
    }
  for (const lot of lots) {
    const dx = point.x - lot.x,
      dz = point.z - lot.z,
      c = Math.cos(lot.rot),
      s = Math.sin(lot.rot);
    if (
      Math.abs(dx * c - dz * s) < lot.w / 2 + clearance &&
      Math.abs(dx * s + dz * c) < lot.d / 2 + clearance
    )
      return false;
  }
  for (const fixed of WICKHARBOR_FIXED.filter((f) => f.type !== 'space')) {
    if (Math.hypot(point.x - fixed.x, point.z - fixed.z) < fixed.r + clearance) return false;
  }
  return true;
}
export function yardLayout(lot: Lot, placement: Placement, lots: readonly Lot[]): Yard {
  if (lot.kind !== 'home' || lot.yard === 'shared') return { fences: [], beds: [], logs: [] };
  const front = lot.yard === 'front',
    start = front ? lot.d / 2 : -lot.d / 2;
  const end = start + (front ? 2 : -2.5),
    w = lot.w / 2 + 1;
  const entryX = (placement.landing.minX + placement.landing.maxX) / 2;
  const raw = [
    { a: [-w, start], b: [-w, end] },
    { a: [w, start], b: [w, end] },
  ];
  const gate = front ? entryX : 0,
    halfGate = front ? 1.1 : 0.75;
  if (gate - halfGate > -w + 0.1) raw.push({ a: [-w, end], b: [gate - halfGate, end] });
  if (gate + halfGate < w - 0.1) raw.push({ a: [gate + halfGate, end], b: [w, end] });
  const fences: Yard['fences'] = [];
  for (const segment of raw) {
    const length = Math.hypot(segment.b[0] - segment.a[0], segment.b[1] - segment.a[1]),
      count = Math.ceil(length / 1.9);
    for (let i = 0; i < count; i++) {
      const point = (t: number) =>
        localPoint(
          lot,
          segment.a[0] + (segment.b[0] - segment.a[0]) * t,
          segment.a[1] + (segment.b[1] - segment.a[1]) * t,
        );
      const a = point(i / count),
        b = point((i + 1) / count),
        n = Math.ceil(length / count / 0.2);
      if (
        Array.from({ length: n + 1 }, (_, j) => ({
          x: a.x + ((b.x - a.x) * j) / n,
          z: a.z + ((b.z - a.z) * j) / n,
        })).every((p) => isClearDressing(p, lots, 0.18))
      )
        fences.push({ a, b });
    }
  }
  const beds = front
    ? [{ minX: 1.1, maxX: 2.2, minZ: start + 0.95, maxZ: start + 1.75 }]
    : [
        { minX: -1.8, maxX: -0.65, minZ: end + 0.35, maxZ: start - 0.35 },
        { minX: 0.65, maxX: 1.8, minZ: end + 0.35, maxZ: start - 0.35 },
      ];
  const clearBeds = beds.filter((rect) =>
    [rect.minX, rect.maxX].every((x) =>
      [rect.minZ, rect.maxZ].every((z) => isClearDressing(localPoint(lot, x, z), lots, 0.1)),
    ),
  );
  const logs = front
    ? []
    : [localPoint(lot, -2.45, (start + end) / 2), localPoint(lot, -2.1, (start + end) / 2)].filter(
        (p) => isClearDressing(p, lots, 0.25),
      );
  return { fences, beds: clearBeds, logs };
}
export function approachPath(lot: Lot, placement: Placement) {
  const start = localPoint(
    lot,
    (placement.approach.minX + placement.approach.maxX) / 2,
    placement.approach.maxZ,
  );
  return {
    start,
    end: lot.front,
    width:
      lot.kind === 'home'
        ? 1.15
        : lot.kind === 'inn'
          ? 1.5
          : Math.min(2, placement.landing.maxX - placement.landing.minX),
  };
}
export interface SeatedDeck {
  x: number;
  z: number;
  rot: number;
  hw: number;
  hl: number;
  yStart: number;
  yEnd: number;
}
export function deckLayout(deck: SeatedDeck) {
  const start = deck.yStart,
    end = deck.yEnd,
    delta = end - start,
    stepped = Math.abs(delta) / (deck.hl * 2) > 0.2;
  const count = stepped ? Math.ceil(Math.abs(delta) / 0.18) : Math.ceil((deck.hl * 2) / 1.8),
    length = (deck.hl * 2) / count;
  return {
    stepped,
    riser: Math.abs(delta) / count,
    tiles: Array.from({ length: count }, (_, i) => ({
      along: -deck.hl + length * (i + 0.5),
      length,
      y: stepped
        ? start + delta * ((delta > 0 ? i + 1 : i) / count)
        : start + (delta * (i + 0.5)) / count,
      slope: stepped ? 0 : delta / (deck.hl * 2),
    })),
  };
}
