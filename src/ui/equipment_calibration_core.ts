// Pure state and export format for the character-creator equipment fitting
// panel. The live Three.js adapter stays in CharacterPreview, while this file
// keeps persistence, normalization and the dev-save payload browser-free.

export const EQUIPMENT_CALIBRATION_TARGETS = [
  'mainhand',
  'offhand',
  'Armor_valor_Head',
  'Armor_valor_Chest',
  'Armor_valor_Waist',
  'Armor_valor_ShoulderL',
  'Armor_valor_ShoulderR',
  'Armor_valor_BracerL',
  'Armor_valor_BracerR',
  'Armor_valor_GloveL',
  'Armor_valor_GloveR',
  'Armor_valor_LegL',
  'Armor_valor_LegR',
  'Armor_valor_FootL',
  'Armor_valor_FootR',
  'mainhand_hip',
  'offhand_hip',
  'mainhand_back',
  'offhand_back',
] as const;

export const EQUIPMENT_CALIBRATION_ARMOR_TARGETS = EQUIPMENT_CALIBRATION_TARGETS.filter(
  (target): target is Extract<EquipmentCalibrationTarget, `Armor_${string}`> =>
    target.startsWith('Armor_'),
);
export const WEAPON_CALIBRATION_TARGETS = ['mainhand', 'offhand'] as const;
export const EQUIPMENT_CALIBRATION_CARRY_TARGETS = [
  'mainhand_hip',
  'offhand_hip',
  'mainhand_back',
  'offhand_back',
] as const;

export type EquipmentCalibrationTarget = (typeof EQUIPMENT_CALIBRATION_TARGETS)[number];
export type EquipmentCalibrationLocation = 'hand' | 'hip' | 'back';
export type EquipmentCalibrationWeaponSlot = (typeof WEAPON_CALIBRATION_TARGETS)[number];
type EquipmentCalibrationCarryTarget = (typeof EQUIPMENT_CALIBRATION_CARRY_TARGETS)[number];
/** Compatibility alias for the original two-hand editor API. */
export type EquipmentCalibrationSlot = EquipmentCalibrationTarget;
export type EquipmentCalibrationMode = 'position' | 'rotation' | 'scale';
export type EquipmentCalibrationAxis = 0 | 1 | 2;
export type EquipmentCalibrationVector = [number, number, number];
export type EquipmentCalibrationQuaternion = [number, number, number, number];

export interface EquipmentCalibrationTransform {
  position: EquipmentCalibrationVector;
  rotationDeg: EquipmentCalibrationVector;
  scale: number;
}

export type EquipmentCalibrationState = Record<
  EquipmentCalibrationTarget,
  EquipmentCalibrationTransform
>;
/** Old saved defaults contain only hands and armor. New locations are filled on read. */
export type EquipmentCalibrationDefaults = Omit<
  EquipmentCalibrationState,
  EquipmentCalibrationCarryTarget
> &
  Partial<Pick<EquipmentCalibrationState, EquipmentCalibrationCarryTarget>>;

export function equipmentCalibrationTarget(
  slot: EquipmentCalibrationWeaponSlot,
  location: EquipmentCalibrationLocation,
): EquipmentCalibrationTarget {
  return location === 'hand' ? slot : `${slot}_${location}`;
}

function defaultTransform(
  state: EquipmentCalibrationDefaults,
  target: EquipmentCalibrationTarget,
): EquipmentCalibrationTransform {
  return state[target] ?? state[target.startsWith('mainhand_') ? 'mainhand' : 'offhand'];
}

export interface EquipmentCalibrationExportTransform extends EquipmentCalibrationTransform {
  quaternion: EquipmentCalibrationQuaternion;
  space: 'hand-bone-local' | 'pelvis-bone-local' | 'chest-bone-local' | 'skinned-node-local';
}

export interface EquipmentCalibrationExport {
  version: 2;
  visualKey: string;
  transforms: Record<EquipmentCalibrationTarget, EquipmentCalibrationExportTransform>;
}

export const EQUIPMENT_CALIBRATION_STORAGE_KEY = 'woc.equipmentCalibration.meshyTitan.v2';
export function equipmentCalibrationStorageKey(visualKey: string): string {
  return visualKey === 'player_meshy_titan'
    ? EQUIPMENT_CALIBRATION_STORAGE_KEY
    : `woc.equipmentCalibration.${visualKey}.v2`;
}
export const EQUIPMENT_CALIBRATION_SLOTS = EQUIPMENT_CALIBRATION_TARGETS;

const POSITION_LIMIT = 5;
const ROTATION_LIMIT = 360;
const SCALE_MIN = 0.01;
const SCALE_MAX = 10;
const OUTPUT_PRECISION = 6;

function finite(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rounded(value: number, digits = OUTPUT_PRECISION): number {
  const factor = 10 ** digits;
  const result = Math.round(value * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function vector(
  value: unknown,
  fallback: EquipmentCalibrationVector,
  limit: number,
): EquipmentCalibrationVector {
  if (!Array.isArray(value)) return [...fallback];
  return [0, 1, 2].map((axis) =>
    rounded(clamp(finite(value[axis], fallback[axis]), -limit, limit)),
  ) as EquipmentCalibrationVector;
}

export function cloneEquipmentCalibrationTransform(
  transform: EquipmentCalibrationTransform,
): EquipmentCalibrationTransform {
  return {
    position: [...transform.position],
    rotationDeg: [...transform.rotationDeg],
    scale: transform.scale,
  };
}

export function cloneEquipmentCalibrationState(
  state: EquipmentCalibrationDefaults,
): EquipmentCalibrationState {
  return Object.fromEntries(
    EQUIPMENT_CALIBRATION_TARGETS.map((target) => [
      target,
      cloneEquipmentCalibrationTransform(defaultTransform(state, target)),
    ]),
  ) as EquipmentCalibrationState;
}

export function normalizeEquipmentCalibrationTransform(
  value: Partial<EquipmentCalibrationTransform> | null | undefined,
  fallback: EquipmentCalibrationTransform,
): EquipmentCalibrationTransform {
  return {
    position: vector(value?.position, fallback.position, POSITION_LIMIT),
    rotationDeg: vector(value?.rotationDeg, fallback.rotationDeg, ROTATION_LIMIT),
    scale: rounded(clamp(finite(value?.scale, fallback.scale), SCALE_MIN, SCALE_MAX)),
  };
}

export function normalizeEquipmentCalibrationState(
  value: Partial<Record<EquipmentCalibrationTarget, Partial<EquipmentCalibrationTransform>>> | null,
  fallback: EquipmentCalibrationDefaults,
): EquipmentCalibrationState {
  return Object.fromEntries(
    EQUIPMENT_CALIBRATION_TARGETS.map((target) => [
      target,
      normalizeEquipmentCalibrationTransform(value?.[target], defaultTransform(fallback, target)),
    ]),
  ) as EquipmentCalibrationState;
}

export function parseEquipmentCalibrationState(
  raw: string | null,
  fallback: EquipmentCalibrationDefaults,
): EquipmentCalibrationState {
  if (!raw) return cloneEquipmentCalibrationState(fallback);
  try {
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      transforms?: Partial<
        Record<EquipmentCalibrationTarget, Partial<EquipmentCalibrationTransform>>
      >;
    };
    if (parsed.version !== 2 || !parsed.transforms) {
      return cloneEquipmentCalibrationState(fallback);
    }
    return normalizeEquipmentCalibrationState(parsed.transforms, fallback);
  } catch {
    return cloneEquipmentCalibrationState(fallback);
  }
}

export function withEquipmentCalibrationAxis(
  transform: EquipmentCalibrationTransform,
  mode: Exclude<EquipmentCalibrationMode, 'scale'>,
  axis: EquipmentCalibrationAxis,
  value: number,
): EquipmentCalibrationTransform {
  const next = cloneEquipmentCalibrationTransform(transform);
  const target = mode === 'position' ? next.position : next.rotationDeg;
  const limit = mode === 'position' ? POSITION_LIMIT : ROTATION_LIMIT;
  target[axis] = rounded(clamp(finite(value, target[axis]), -limit, limit));
  return next;
}

export function withEquipmentCalibrationScale(
  transform: EquipmentCalibrationTransform,
  value: number,
): EquipmentCalibrationTransform {
  const next = cloneEquipmentCalibrationTransform(transform);
  next.scale = rounded(clamp(finite(value, transform.scale), SCALE_MIN, SCALE_MAX));
  return next;
}

/** Convert a Three.js XYZ Euler in degrees to the equivalent quaternion. */
export function equipmentCalibrationQuaternion(
  rotationDeg: EquipmentCalibrationVector,
): EquipmentCalibrationQuaternion {
  const [x, y, z] = rotationDeg.map((degrees) => (degrees * Math.PI) / 360);
  const c1 = Math.cos(x);
  const c2 = Math.cos(y);
  const c3 = Math.cos(z);
  const s1 = Math.sin(x);
  const s2 = Math.sin(y);
  const s3 = Math.sin(z);
  return [
    rounded(s1 * c2 * c3 + c1 * s2 * s3),
    rounded(c1 * s2 * c3 - s1 * c2 * s3),
    rounded(c1 * c2 * s3 + s1 * s2 * c3),
    rounded(c1 * c2 * c3 - s1 * s2 * s3),
  ];
}

function exportTransform(
  target: EquipmentCalibrationTarget,
  transform: EquipmentCalibrationTransform,
): EquipmentCalibrationExportTransform {
  return {
    position: [...transform.position],
    rotationDeg: [...transform.rotationDeg],
    quaternion: equipmentCalibrationQuaternion(transform.rotationDeg),
    scale: transform.scale,
    space: target.endsWith('_hip')
      ? 'pelvis-bone-local'
      : target.endsWith('_back')
        ? 'chest-bone-local'
        : target === 'mainhand' || target === 'offhand'
          ? 'hand-bone-local'
          : 'skinned-node-local',
  };
}

export function equipmentCalibrationExport(
  state: EquipmentCalibrationState,
  visualKey = 'player_meshy_titan',
): EquipmentCalibrationExport {
  return {
    version: 2,
    visualKey,
    transforms: Object.fromEntries(
      EQUIPMENT_CALIBRATION_TARGETS.map((target) => [
        target,
        exportTransform(target, state[target]),
      ]),
    ) as Record<EquipmentCalibrationTarget, EquipmentCalibrationExportTransform>,
  };
}

export function serializeEquipmentCalibration(
  state: EquipmentCalibrationState,
  visualKey = 'player_meshy_titan',
): string {
  return JSON.stringify(equipmentCalibrationExport(state, visualKey), null, 2);
}
