export const CARRY_FIT_TARGETS: readonly [
  'mainhand_hip',
  'offhand_hip',
  'mainhand_back',
  'offhand_back',
];
export function validEquipmentFitTransform(value: unknown): boolean;
export const MOB_EQUIPMENT_FIT_SUBJECTS: readonly { templateId: string; visualKey: string }[];
export const HELD_EQUIPMENT_FIT_VISUALS: readonly string[];
export const ITEM_EQUIPMENT_FIT_PROFILES: readonly { visualKey: string; modelUrl: string }[];
export function itemEquipmentFitKey(visualKey: string, modelUrl: string): string;
export function validItemEquipmentFitKey(key: unknown): boolean;
export function mergeHeldEquipmentFit(
  current: Record<string, unknown> | undefined,
  transforms: Record<string, unknown>,
  includeHands?: boolean,
): Record<string, unknown>;
export function validEquipmentFitTransforms(
  value: unknown,
  legacyTargets: readonly string[],
): boolean;
