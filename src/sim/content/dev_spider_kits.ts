// Only existing spider on-hit traits. Lab stats and passive pull policy stay
// in dev_model_lab; appearance trials never invent new elemental mechanics.
import type { MobTemplate } from '../types';
import { RIFT_MOBS } from './rift/mobs';
import { ZONE1_MOBS } from './zone1';
import { ZONE2_MOBS } from './zone2';

type Kit = Pick<MobTemplate, 'venom' | 'ensnare' | 'critVuln' | 'stackPoison'>;

export const DEV_SPIDER_KITS = {
  dev_smart_spider: {
    venom: RIFT_MOBS.rift_venom_weaver.venom,
    ensnare: RIFT_MOBS.rift_venom_weaver.ensnare,
  },
  dev_spider_forest: {
    venom: ZONE1_MOBS.webwood_spider.venom,
    ensnare: ZONE1_MOBS.webwood_spider.ensnare,
  },
  dev_spider_marsh: { critVuln: ZONE2_MOBS.mire_widow.critVuln },
  // Canopy Weaver and Bonechill Widow have ordinary physical attacks only.
  dev_spider_sand: {},
  dev_spider_frost: {},
  dev_spider_broodmother: { stackPoison: ZONE2_MOBS.mirefen_broodmother.stackPoison },
} satisfies Record<string, Kit>;
