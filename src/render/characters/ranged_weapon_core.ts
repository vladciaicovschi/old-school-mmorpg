import { weaponTypeForItem } from '../../sim/content/weapon_skin_rules';
import { WEAPON_SKINS } from '../../sim/content/weapon_skins';

export const HUNTER_BOW_ITEM = 'dev_hunter_practice_bow';
export const HUNTER_CROSSBOW_ITEM = 'dev_hunter_practice_crossbow';
export const HUNTER_BOW_MODEL = 'models/weapons/meshy/arcane_longbow_1.glb';
export const HUNTER_CROSSBOW_MODEL = 'models/weapons/meshy/test_crossbow_1.glb';

export type RangedWeaponHandling = 'bow' | 'crossbow';

/** Legacy hunters still equip melee stat weapons beneath their fixed ranged visual. */
export function rangedWeaponHandling(
  itemId: string | null | undefined,
  skinId: string | null | undefined,
): RangedWeaponHandling {
  const skin = skinId ? WEAPON_SKINS[skinId] : undefined;
  const handling = skin?.handling ?? skin?.weaponType;
  if (handling === 'bow' || handling === 'crossbow') return handling;
  return weaponTypeForItem(itemId) === 'bow' ? 'bow' : 'crossbow';
}

/** Only replace the generic legacy crossbows. Dedicated higher-tier art wins. */
export function crossbowModelFallback(model: string): string {
  return model === 'crossbow_1handed' ||
    model === 'crossbow_2handed' ||
    model === 'simple_farmhand_crossbow'
    ? 'meshy/test_crossbow_1'
    : model;
}
