// Chest-driven full-body appearance, independent of the other equipment stats.
// A model tier is authored explicitly, never inferred from rarity or item power.
import type { EquipSlot, ItemDef } from '../../sim/types';

export function chestAppearanceTier(
  equipment: Partial<Record<EquipSlot, string>> | undefined,
  items: Readonly<Record<string, ItemDef>>,
): number {
  const id = equipment?.chest;
  const item = id ? items[id] : undefined;
  const tier = item?.kind === 'armor' && item.slot === 'chest' ? item.appearanceTier : undefined;
  return typeof tier === 'number' && Number.isSafeInteger(tier) && tier > 0 ? tier : 1;
}

export function playerArmorVisualKey(
  cls: string,
  equipment: Partial<Record<EquipSlot, string>> | undefined,
  items: Readonly<Record<string, ItemDef>>,
  visuals: Readonly<Record<string, unknown>>,
): string {
  const base = `player_${cls}`;
  const tier = chestAppearanceTier(equipment, items);
  // Only registered, production-ready class tier bodies participate. Legacy
  // warrior suit experiments have incompatible rigs/motions and intentionally
  // do not claim these keys. Their chest items still retain stats and tier data.
  const key = tier > 1 ? `${base}_t${tier}` : base;
  return visuals[key] ? key : visuals[base] ? base : 'player_warrior';
}
