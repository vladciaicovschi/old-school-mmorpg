// Passive-until-pulled copies of the existing combat kits for model QA.
// Production identities and numeric tuning remain in their source tables.
import type { MobTemplate } from '../types';
import { WILDHEART_MOBS } from './wildheart';
import { ZONE1_MOBS } from './zone1';

export const DEV_IMPORTED_HUMANOIDS: Record<string, MobTemplate> = Object.fromEntries(
  [...Object.values(WILDHEART_MOBS), ZONE1_MOBS.mogger].map((source) => {
    const id = `dev_${source.id}`;
    return [
      id,
      {
        ...source,
        id,
        name: `${source.name} (Replaced)`,
        aggroRadius: 0,
        aggroOnDamageOnly: true,
        idleStationary: true,
        hardLeashRadius: 28,
        loot: [],
        // Gallery trials stay isolated; the production encounter still summons.
        summonAdds: undefined,
      },
    ];
  }),
);
