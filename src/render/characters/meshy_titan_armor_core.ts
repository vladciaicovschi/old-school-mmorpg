import type { EquipSlot } from '../../sim/types';

export type EquipmentPartItems = Partial<Record<EquipSlot, string>>;
export type EquipmentPartMap = Partial<Record<EquipSlot, readonly string[]>>;

const EQUIPMENT_PART_SLOT_ORDER: readonly EquipSlot[] = [
  'helmet',
  'shoulder',
  'chest',
  'waist',
  'legs',
  'gloves',
  'feet',
];

/** The first segmented-body experiment. Item identity is deliberately not
 * interpreted yet: an occupied armor slot equips the Knight's Valor part for
 * that slot. Once the pipeline is proven, this seam becomes item -> armor-set
 * selection without changing the renderer or the GLB visibility contract. */
export const MESHY_TITAN_ARMOR_PARTS: EquipmentPartMap = Object.freeze({
  helmet: Object.freeze(['Armor_valor_Head']),
  shoulder: Object.freeze(['Armor_valor_ShoulderL', 'Armor_valor_ShoulderR']),
  chest: Object.freeze(['Armor_valor_Chest']),
  waist: Object.freeze(['Armor_valor_Waist']),
  legs: Object.freeze(['Armor_valor_LegL', 'Armor_valor_LegR']),
  gloves: Object.freeze([
    'Armor_valor_BracerL',
    'Armor_valor_BracerR',
    'Armor_valor_GloveL',
    'Armor_valor_GloveR',
  ]),
  feet: Object.freeze(['Armor_valor_FootL', 'Armor_valor_FootR']),
});

function slotShown(slot: EquipSlot, items: EquipmentPartItems, helmHidden: boolean): boolean {
  return Boolean(items[slot]) && (slot !== 'helmet' || !helmHidden);
}

export function equipmentPartNodeNames(
  parts: EquipmentPartMap,
  items: EquipmentPartItems,
  helmHidden: boolean,
): string[] {
  const shown: string[] = [];
  for (const slot of EQUIPMENT_PART_SLOT_ORDER) {
    if (!slotShown(slot, items, helmHidden)) continue;
    shown.push(...(parts[slot] ?? []));
  }
  return shown;
}

/** A value signature, not an object-identity signature: network mirror records
 * are routinely replaced even when the occupied armor slots did not change. */
export function equipmentPartSignature(
  parts: EquipmentPartMap | undefined,
  items: EquipmentPartItems,
  helmHidden: boolean,
): string | null {
  if (!parts) return null;
  return EQUIPMENT_PART_SLOT_ORDER.filter((slot) => parts[slot]?.length)
    .map((slot) => `${slot}:${slotShown(slot, items, helmHidden) ? 1 : 0}`)
    .join('|');
}

export function allEquipmentPartNodeNames(parts: EquipmentPartMap): string[] {
  const names: string[] = [];
  for (const slot of EQUIPMENT_PART_SLOT_ORDER) names.push(...(parts[slot] ?? []));
  return names;
}
