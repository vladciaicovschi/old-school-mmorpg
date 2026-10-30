import { architectureLotOffset } from './architecture_placements';
import type { Collider } from './colliders';
import type { TerrainHeight, WickharborLot, WickharborMetadata } from './wickharbor_layout';

// Player assets normalize to 2.6 world units. Calibrate the architectural kit
// against a 1.80 m person instead of treating one source metre as one world unit.
export const ARCHITECTURE_REFERENCE = {
  personMetres: 1.8,
  personWorldHeight: 2.6,
  targetDoorMetres: 2.25,
  flatDoorSourceHeight: 2.10043466,
  roundDoorSourceHeight: 2.322758,
  warehouseDoorSourceHeight: 1.88267,
} as const;
const targetDoorWorldHeight =
  (ARCHITECTURE_REFERENCE.targetDoorMetres * ARCHITECTURE_REFERENCE.personWorldHeight) /
  ARCHITECTURE_REFERENCE.personMetres;
export const ARCHITECTURE_SCALE =
  targetDoorWorldHeight / ARCHITECTURE_REFERENCE.flatDoorSourceHeight;
// Bound long entrance runs while keeping every native riser at or below 0.18.
// Alternate-seed slopes need the full run at smaller architectural calibrations.
export const NATIVE_ENTRANCE_MAX_TREADS = 25;

export function architectureScaleFor(modelId: string): number {
  if (modelId === 'fort:tower') return 3.25 / (2.127084732055664 - 0.0352252721786499);
  if (modelId.includes('warehouse'))
    return targetDoorWorldHeight / ARCHITECTURE_REFERENCE.warehouseDoorSourceHeight;
  if (modelId.startsWith('icemantle:') || modelId === 'eastbrook:chapel')
    return targetDoorWorldHeight / ARCHITECTURE_REFERENCE.roundDoorSourceHeight;
  return ARCHITECTURE_SCALE;
}

const dimensionless = new Set([
  'count',
  'levels',
  'angleStep',
  'endAngle',
  'portalAngle',
  'rot',
  'tilt',
  'quaternion',
  'benchCount',
  'doorOpenRadians',
  'yaw',
  'rotation',
]);

/** Only call on geometric readouts, never on content tables or source provenance. */
export function scaleCoordinates<T>(value: T, scale: number, key = ''): T {
  if (dimensionless.has(key)) return value;
  if (typeof value === 'number') return (value * scale) as T;
  if (Array.isArray(value)) return value.map((v) => scaleCoordinates(v, scale)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, scaleCoordinates(v, scale, k)]),
    ) as T;
  }
  return value;
}

/** Preserve source/material records; convert only fields consumed as spatial data. */
export function scaleArchitectureMetadata<T extends WickharborMetadata>(
  source: T,
  scale: number,
): T {
  const result = { ...source, modelScale: scale } as unknown as Record<string, unknown>;
  for (const key of [
    'footprint',
    'entrance',
    'foundationPad',
    'foundationTop',
    'additionalFoundations',
    'terrainProps',
    'walkColliders',
    'interior',
    'bellTower',
    'staircase',
    'groundSupport',
    'deckHeight',
    'ladderOpening',
    'storeyHeight',
    'moduleGrid',
  ]) {
    if (key in source)
      result[key] = scaleCoordinates((source as unknown as Record<string, unknown>)[key], scale);
  }
  return result as unknown as T;
}

/** Grow back from the existing doorway, keeping service approaches in place. */
export function architectureFrame(
  source: WickharborLot,
  scale = architectureScaleFor(source.modelId),
) {
  const x = source.metadata.entrance?.x ?? 0,
    z = source.d / 2;
  const c = Math.cos(source.rot),
    s = Math.sin(source.rot);
  const [dx, dz] = architectureLotOffset(source.modelId, source.id);
  const pose = {
    x: source.x + (1 - scale) * (x * c + z * s) + dx,
    z: source.z + (1 - scale) * (-x * s + z * c) + dz,
  };
  const nativeLot = { ...source, ...pose };
  const lot = {
    ...nativeLot,
    w: source.w * scale,
    d: source.d * scale,
    metadata: scaleArchitectureMetadata(source.metadata, scale),
    modelScale: scale,
  };
  return { lot, nativeLot, scale };
}

/** Plan in source coordinates while sampling the enlarged footprint on real terrain. */
export function architectureNativeHeight(
  height: TerrainHeight,
  pose: { x: number; z: number },
  scale: number,
): TerrainHeight {
  return (x, z) => height(pose.x + (x - pose.x) * scale, pose.z + (z - pose.z) * scale) / scale;
}

/** Native collider dimensions and absolute heights share the model's affine transform. */
export function scaleColliderRange(
  colliders: Collider[],
  start: number,
  pose: { x: number; z: number },
  scale: number,
): void {
  for (const collider of colliders.slice(start)) {
    collider.x = pose.x + (collider.x - pose.x) * scale;
    collider.z = pose.z + (collider.z - pose.z) * scale;
    if (collider.type === 'circle') collider.r *= scale;
    else {
      collider.hw *= scale;
      collider.hd *= scale;
    }
    for (const key of ['cameraTopY', 'moveTopY', 'passUnderY'] as const) {
      const value = collider[key];
      if (value !== undefined) collider[key] = value * scale;
    }
  }
}
