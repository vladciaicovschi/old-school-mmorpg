// Existing kits, isolated as passive combat trials for the imported bodies.
import type { MobTemplate } from '../types';
import { AMBERFALL_MOBS } from './amberfall';
import { GALECREST_MOBS } from './galecrest';
import { REALM_MOBS } from './realm';

function trial(id: string, source: MobTemplate): MobTemplate {
  return {
    ...source,
    id,
    name: `${source.name} (Replaced)`,
    aggroRadius: 0,
    aggroOnDamageOnly: true,
    idleStationary: true,
    hardLeashRadius: 28,
    loot: [],
    summonAdds: undefined,
  };
}
export const DEV_COMMUNITY_ANCIENTS: Record<string, MobTemplate> = {
  dev_the_wreck_warden: trial('dev_the_wreck_warden', GALECREST_MOBS.the_wreck_warden),
  dev_ancient_guardian: trial('dev_ancient_guardian', REALM_MOBS.ancient_guardian),
  dev_waking_warden: trial('dev_waking_warden', REALM_MOBS.waking_warden),
  dev_treant_warrior: {
    ...trial('dev_treant_warrior', AMBERFALL_MOBS.orchard_treant),
    name: 'Treant Warrior',
    scale: 1,
  },
};
