// Existing creature mechanics on the new lab bodies. Copy only the selected
// traits, never donor stats, loot, boss flags or production placement.
import type { MobTemplate } from '../types';
import { MAGE_PET_MOBS } from './mage_pets';
import { REALM_MOBS } from './realm';
import { RIFT_MOBS } from './rift/mobs';
import { ZONE3_MOBS } from './zone3';

type Kit = Pick<
  MobTemplate,
  'smolder' | 'frostbite' | 'chillOnHit' | 'spellVuln' | 'stoneskin' | 'petRanged'
>;

export const DEV_ELEMENTAL_KITS = {
  dev_fire_elemental: { smolder: RIFT_MOBS.rift_magma_brute.smolder },
  dev_ice_elemental: { frostbite: RIFT_MOBS.rift_rime_elemental.frostbite },
  dev_water_elemental: { petRanged: MAGE_PET_MOBS.water_elemental.petRanged },
  dev_storm_elemental: {
    chillOnHit: ZONE3_MOBS.stormcrag_elemental.chillOnHit,
    spellVuln: ZONE3_MOBS.stormcrag_elemental.spellVuln,
  },
  dev_stone_elemental: { stoneskin: REALM_MOBS.ancient_guardian.stoneskin },
} satisfies Record<string, Kit>;
