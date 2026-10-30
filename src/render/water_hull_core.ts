import type { ZonePropsDef } from '../sim/types';

export interface WaterHullHole {
  x: number;
  z: number;
  cosine: number;
  sine: number;
  scale: number;
  draft: number;
}

// Measured in the shipping rowboat's extracted frame (+Z bow, minY=0).
// The opening widens as the water rises up the curved sides. Above each
// station's gunwale the broad opening remains dry rather than admitting crests.
export const ROWBOAT_HULL_STATIONS = [0, 0.5, 1, 1.25, 1.5, 1.75, 2, 2.15];
export const ROWBOAT_HULL_HEIGHTS = [
  0.1, 0.15, 0.16, 0.17, 0.18, 0.19, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 1.01,
];
export const ROWBOAT_HULL_WIDTHS = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0.5127, 0.4418, 0.2041, 0, 0, 0, 0, 0],
  [0.538, 0.4847, 0.2828, 0, 0, 0, 0, 0],
  [0.5623, 0.5075, 0.3032, 0.127, 0, 0, 0, 0],
  [0.5767, 0.531, 0.3225, 0.1993, 0, 0, 0, 0],
  [0.5911, 0.5494, 0.3399, 0.2159, 0.1056, 0, 0, 0],
  [0.6069, 0.5632, 0.3576, 0.2323, 0.1163, 0, 0, 0],
  [0.6688, 0.6263, 0.4606, 0.3176, 0.1751, 0, 0, 0],
  [0.717, 0.6728, 0.5455, 0.3935, 0.2433, 0.0663, 0, 0],
  [0.7334, 0.6969, 0.5959, 0.4835, 0.2996, 0.1085, 0, 0],
  [0.7514, 0.7114, 0.6082, 0.5137, 0.3768, 0.1504, 0, 0],
  [0.7587, 0.7253, 0.6209, 0.529, 0.4134, 0.1857, 0, 0],
  [0.7319, 0.7273, 0.6325, 0.5499, 0.4267, 0.2206, 0, 0],
  [0.7343, 0.7004, 0.6359, 0.559, 0.4394, 0.2508, 0, 0],
  [0.7615, 0.7273, 0.6061, 0.5591, 0.4533, 0.2697, 0, 0],
  [0.7615, 0.7273, 0.645, 0.5608, 0.4569, 0.3094, 0.0855, 0],
];

/** Only actual floating small boats cut water; hauled-out boats keep the beach. */
export function waterHullHoles(
  decor: readonly NonNullable<ZonePropsDef['decorProps']>[number][],
): WaterHullHole[] {
  return decor
    .filter((p) => p.key === 'wickRowboat' && p.float !== undefined && (p.scale ?? 1) > 0)
    .map((p) => ({
      x: p.x,
      z: p.z,
      cosine: Math.cos(p.rot ?? 0),
      sine: Math.sin(p.rot ?? 0),
      scale: p.scale ?? 1,
      draft: p.float ?? 0,
    }));
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function rowWidth(row: readonly number[], z: number) {
  if (z >= (ROWBOAT_HULL_STATIONS.at(-1) ?? 0)) return 0;
  for (let i = 1; i < ROWBOAT_HULL_STATIONS.length; i++)
    if (z <= ROWBOAT_HULL_STATIONS[i]) {
      const t =
        (z - ROWBOAT_HULL_STATIONS[i - 1]) /
        (ROWBOAT_HULL_STATIONS[i] - ROWBOAT_HULL_STATIONS[i - 1]);
      return mix(row[i - 1], row[i], t);
    }
  return 0;
}

export function rowboatHullWidth(y: number, z: number) {
  z = Math.abs(z);
  let width = rowWidth(ROWBOAT_HULL_WIDTHS[0], z);
  for (let i = 1; i < ROWBOAT_HULL_HEIGHTS.length; i++) {
    const t = Math.max(
      0,
      Math.min(
        1,
        (y - ROWBOAT_HULL_HEIGHTS[i - 1]) / (ROWBOAT_HULL_HEIGHTS[i] - ROWBOAT_HULL_HEIGHTS[i - 1]),
      ),
    );
    width = mix(width, rowWidth(ROWBOAT_HULL_WIDTHS[i], z), t);
  }
  // The measured rows already include wall padding, bounded by the outer planks.
  return width;
}

export function waterHullContains(
  hole: WaterHullHole,
  x: number,
  y: number,
  z: number,
  waterLevel: number,
) {
  const dx = x - hole.x,
    dz = z - hole.z;
  const lx = (dx * hole.cosine - dz * hole.sine) / hole.scale;
  const lz = (dx * hole.sine + dz * hole.cosine) / hole.scale;
  const ly = (y - waterLevel + hole.draft) / hole.scale;
  return Math.abs(lx) < rowboatHullWidth(ly, lz);
}
