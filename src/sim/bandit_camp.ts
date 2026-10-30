import raw from './bandit_camp_data.json';
import type { Settlement, SettlementModel } from './settlements_layout';
import type { ZonePropsDef } from './types';

export const BANDIT_CAMP = raw.settlement as unknown as Settlement;
export const BANDIT_CAMP_MODELS = raw.models as unknown as Record<string, SettlementModel>;
export const BANDIT_CAMP_SUPPLIES = raw.supplies;
export const BANDIT_CAMP_OLD_SUPPLIES = [
  { x: 58, z: -58 },
  { x: 73, z: -70 },
  { x: 86, z: -82 },
  { x: 95, z: -97 },
];
const oldTents = [
  { x: 58, z: 25, rot: 0.4, scale: 1 },
  { x: 68, z: 16, rot: 2.1, scale: 1 },
  { x: 113, z: 47, rot: 1.2, scale: 1.3 },
  { x: 119, z: 39, rot: -0.6, scale: 1 },
];
const oldCrates: [number, number][] = [
  [112, 44],
  [118, 40],
];
const at = (x: number, z: number, a: number, b: number) => x === a && z === b;
const clearanceItems = [
  ...raw.settlement.dressing,
  ...raw.supplies.map((p) => ({ ...p, modelId: `bandit:${p.model}` })),
];
export function banditCampFireAt(x: number, z: number) {
  if (at(x, z, 111, 40)) return { scale: 1.1, offset: 0.08 * 3.3 };
  if (at(x, z, 101, 37.6)) return { scale: 0.65, offset: 0.08 * (2.6 / 1.8) };
  return undefined;
}

/** Replace only the approved Gorrak props, preserving the other camps. */
export function applyBanditCampProps(props: ZonePropsDef): ZonePropsDef {
  return {
    ...props,
    tents: props.tents.filter((p) => !oldTents.some((q) => at(p.x, p.z, q.x, q.z))),
    crates: props.crates.filter(([x, z]) => !oldCrates.some(([a, b]) => at(x, z, a, b))),
    campfires: props.campfires.flatMap(([x, z]): [number, number][] =>
      at(x, z, 111, 46)
        ? [
            [111, 40],
            [101, 37.6],
          ]
        : [[x, z]],
    ),
  };
}

/** Keep already-minted calm anchors; the new rectangular grade owns the site. */
export function banditCampCalmProps(props: ZonePropsDef) {
  return {
    tents: [...props.tents, ...oldTents],
    crates: [...props.crates, ...oldCrates],
    campfires: props.campfires.flatMap(([x, z]): [number, number][] =>
      at(x, z, 101, 37.6) ? [] : at(x, z, 111, 40) ? [[111, 46]] : [[x, z]],
    ),
  };
}

/** The complete canvas, stakes and ropes stay clear of random vegetation. */
export function banditCampDecorationExcluded(x: number, z: number, margin: number) {
  if (x < 93 - margin || x > 130 + margin || z < 25 - margin || z > 76 + margin) return false;
  if (Math.hypot(x - 118.755, z - 44.832) < 5.5 + margin) return true;
  return clearanceItems.some((t) => {
    const b = raw.models[t.modelId as keyof typeof raw.models].bounds;
    const dx = x - t.x,
      dz = z - t.z,
      c = Math.cos(t.rot),
      s = Math.sin(t.rot);
    const lx = (dx * c - dz * s) / t.scale,
      lz = (dx * s + dz * c) / t.scale,
      localMargin = margin / t.scale;
    return (
      lx >= b.min[0] - localMargin &&
      lx <= b.max[0] + localMargin &&
      lz >= b.min[2] - localMargin &&
      lz <= b.max[2] + localMargin
    );
  });
}

/** Late, seed-specific grading. Anchor probes are explicitly UNPADDED here:
 * no recursive terrain query, and other late pads do not intersect this site. */
export function gradeBanditCamp(
  x: number,
  z: number,
  original: number,
  anchor: (x: number, z: number) => number,
): number {
  if (x < 88 || x > 134 || z < 37 || z > 81) return original;
  let weighted = 0,
    total = 0,
    strongest = 0;
  for (const t of raw.tents) {
    const b = raw.models[`bandit:${t.model}` as keyof typeof raw.models].bounds;
    const dx = x - t.x,
      dz = z - t.z,
      c = Math.cos(t.rot),
      s = Math.sin(t.rot);
    const lx = dx * c - dz * s,
      lz = dx * s + dz * c;
    const distance = Math.hypot(
      Math.max(0, Math.abs(lx) - Math.max(-b.min[0], b.max[0]) * t.scale - 0.4),
      Math.max(0, Math.abs(lz) - Math.max(-b.min[2], b.max[2]) * t.scale - 0.4),
    );
    if (distance >= 8) continue;
    const grade = anchor(t.x, t.z);
    if (distance === 0) return grade;
    const t0 = distance / 8,
      weight = 1 - t0 * t0 * (3 - 2 * t0),
      priority = weight / (1 - weight);
    weighted += grade * priority;
    total += priority;
    strongest = Math.max(strongest, weight);
  }
  return total ? original + (weighted / total - original) * strongest : original;
}
