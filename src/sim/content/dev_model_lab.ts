// Developer-only model test island. The shoreline and dressing are translated
// from the Proving Shore, with a level interior for testing. Gameplay is absent:
// no quests, camps, vendors, ferry, or permanent entities live here. The
// `/dev lab` command is the only normal entrance and creates owner-scoped test
// subjects on demand.

import type { MobTemplate, NpcDef, ZoneDef, ZonePropsDef } from '../types';
import { emptyZoneProps } from '../types';
import { DEV_CASTER_KITS } from './dev_caster_kits';
import { DEV_ELEMENTAL_KITS } from './dev_elemental_kits';
import { DEV_SPIDER_KITS } from './dev_spider_kits';
import { PROVING_SHORE_PROPS, PROVING_SHORE_ROADS } from './proving_shore';

export const DEV_MODEL_LAB_X_OFFSET = 1100;
export const DEV_MODEL_LAB_ZONE_ID = 'dev_model_lab';

export const DEV_MODEL_LAB_RECT = {
  xMin: 560,
  xMax: 920,
  zMin: -180,
  zMax: 180,
} as const;

export const DEV_MODEL_LAB_ARRIVAL = {
  x: 819,
  z: -18,
  facing: -Math.PI / 2,
} as const;

export function isOnDevModelLab(x: number, z: number): boolean {
  return (
    x >= DEV_MODEL_LAB_RECT.xMin &&
    x < DEV_MODEL_LAB_RECT.xMax &&
    z >= DEV_MODEL_LAB_RECT.zMin &&
    z < DEV_MODEL_LAB_RECT.zMax
  );
}

const shiftX = (x: number): number => x + DEV_MODEL_LAB_X_OFFSET;

export const DEV_MODEL_LAB_ZONE: ZoneDef = {
  id: DEV_MODEL_LAB_ZONE_ID,
  name: 'Model Test Island',
  ...DEV_MODEL_LAB_RECT,
  levelRange: [1, 60],
  biome: 'vale',
  hub: { x: shiftX(-300), z: 50, radius: 14, name: 'Test Camp' },
  graveyard: { x: shiftX(-324), z: 58 },
  lakes: [],
  pois: [
    { x: shiftX(-300), z: 50, label: 'Character Lineup', id: 'dev_character_lineup' },
    { x: shiftX(-340), z: -50, label: 'NPC Gallery', id: 'dev_npc_gallery' },
    { x: shiftX(-342), z: 12, label: 'Creature Ring', id: 'dev_creature_ring' },
  ],
  welcome: 'Developer model test island. Use dev commands to rebuild or clear test subjects.',
};

export const DEV_MODEL_LAB_ROADS: { x: number; z: number }[][] = PROVING_SHORE_ROADS.map((road) =>
  road.map((point) => ({ x: shiftX(point.x), z: point.z })),
);

export const DEV_MODEL_LAB_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  stalls: PROVING_SHORE_PROPS.stalls.map((p) => ({ ...p, x: shiftX(p.x) })),
  campfires: PROVING_SHORE_PROPS.campfires.map(([x, z]) => [shiftX(x), z]),
  tents: PROVING_SHORE_PROPS.tents.map((p) => ({ ...p, x: shiftX(p.x) })),
  // The tutorial's pens and crate bank used to obstruct the combat lanes.
  fences: [],
  crates: PROVING_SHORE_PROPS.crates.map(([x, , count]) => [shiftX(x) + 36, -52, count]),
  decorProps: [
    ...(PROVING_SHORE_PROPS.decorProps ?? []).map((p) => ({ ...p, x: shiftX(p.x) })),
    // Three red markers make the initial test lanes readable without adding
    // interactive entities or collision to the copied island.
    { key: 'hexFlagRed', x: shiftX(-300), z: 45 },
    { key: 'hexFlagRed', x: shiftX(-340), z: -56 },
    { key: 'hexFlagRed', x: shiftX(-342), z: 12 },
  ],
  docks: PROVING_SHORE_PROPS.docks.map((p) => ({ ...p, x: shiftX(p.x) })),
  graveyards: PROVING_SHORE_PROPS.graveyards.map((p) => ({ ...p, x: shiftX(p.x) })),
};

/** First live test subject requested for the island. */
export const DEV_MODEL_LAB_APOTHECARY_POS = {
  x: shiftX(-356),
  z: -50,
  facing: Math.PI,
} as const;

/** Reserved for imported non-combat characters. Combat test bodies are mob
 * templates below so they acquire threat and retaliate when attacked. */
export const DEV_MODEL_LAB_NPCS: Record<string, NpcDef> = {};

const testMob = (
  id: string,
  name: string,
  family: MobTemplate['family'],
  color: number,
): MobTemplate => ({
  id,
  name,
  minLevel: 1,
  maxLevel: 60,
  family,
  hpBase: 180,
  hpPerLevel: 42,
  dmgBase: 5,
  dmgPerLevel: 2.2,
  attackSpeed: 2,
  armorPerLevel: 18,
  // Above the renderer's run threshold: an engaged test mob uses its run
  // cycle while a future slow patrol can still select an authored walk.
  moveSpeed: 6,
  // Explicit opt-in bypasses the normal four-yard proximity floor and social
  // assistance. Direct attacks still seed real threat and retaliation.
  aggroRadius: 0,
  aggroOnDamageOnly: true,
  idleStationary: true,
  hardLeashRadius: 28,
  loot: [],
  scale: 1,
  color,
});

// Testable caster role, not merely a magic-looking attack animation. Keep the
// same passive/damage-only pull policy and modest damage for model testing.
const testCaster = (
  id: keyof typeof DEV_CASTER_KITS,
  name: string,
  color: number,
): MobTemplate => ({
  ...testMob(id, name, 'undead', color),
  ...DEV_CASTER_KITS[id],
});

export const DEV_MODEL_LAB_MOBS: Record<string, MobTemplate> = {
  dev_rogue_minion: testMob('dev_rogue_minion', 'Rogue Minion', 'humanoid', 0x8f4b45),
  dev_rogue_assassin: testMob('dev_rogue_assassin', 'Rogue Assassin', 'humanoid', 0x593b47),
  dev_skeleton_minion: testMob('dev_skeleton_minion', 'Skeleton Minion', 'undead', 0xd8cfb8),
  dev_skeleton_warrior: testMob('dev_skeleton_warrior', 'Skeleton Warrior', 'undead', 0xc9c2b2),
  dev_skeleton_cultist: testCaster('dev_skeleton_cultist', 'Cultist', 0x7b617e),
  dev_skeleton_acolyte: testCaster('dev_skeleton_acolyte', 'Skeleton Acolyte', 0x655275),
  dev_kobold: testMob('dev_kobold', 'Kobold (Replaced)', 'humanoid', 0xb87868),
  dev_troll: testMob('dev_troll', 'Troll', 'humanoid', 0x7f9b8b),
  dev_bone_golem: testMob('dev_bone_golem', 'Bone Golem', 'undead', 0xd4c8b4),
  dev_meshy_murlok: testMob(
    'dev_meshy_murlok',
    'Meshy Native Murlok (Replaced)',
    'humanoid',
    0x668f72,
  ),
  dev_meshy_ogre: testMob('dev_meshy_ogre', 'Meshy Native Ogre', 'humanoid', 0x8e806d),
  dev_skeleton_necromancer_v2: testCaster(
    'dev_skeleton_necromancer_v2',
    'Skeleton Necromancer V2',
    0x7d5361,
  ),
  dev_skeleton_caster_v3: testCaster('dev_skeleton_caster_v3', 'Skeleton Caster V3', 0x80515e),
  dev_skeleton_rogue_v3: testMob('dev_skeleton_rogue_v3', 'Skeleton Rogue V3', 'undead', 0x755159),
  dev_treant_v2: testMob('dev_treant_v2', 'Treant V2', 'elemental', 0x82956a),
  dev_fire_elemental: {
    ...testMob('dev_fire_elemental', 'Fire Elemental Prototype', 'elemental', 0xffffff),
    ...DEV_ELEMENTAL_KITS.dev_fire_elemental,
  },
  dev_ice_elemental: {
    ...testMob('dev_ice_elemental', 'Ice Elemental Prototype', 'elemental', 0xffffff),
    ...DEV_ELEMENTAL_KITS.dev_ice_elemental,
  },
  dev_water_elemental: {
    ...testMob('dev_water_elemental', 'Water Elemental Prototype', 'elemental', 0xffffff),
    ...DEV_ELEMENTAL_KITS.dev_water_elemental,
  },
  dev_storm_elemental: {
    ...testMob('dev_storm_elemental', 'Storm Elemental Prototype', 'elemental', 0xffffff),
    ...DEV_ELEMENTAL_KITS.dev_storm_elemental,
  },
  dev_stone_elemental: {
    ...testMob('dev_stone_elemental', 'Stone Elemental Prototype', 'elemental', 0xffffff),
    ...DEV_ELEMENTAL_KITS.dev_stone_elemental,
  },
  dev_smart_bear: {
    ...testMob('dev_smart_bear', 'Smart Rig Bear', 'beast', 0x8b6246),
    moveSpeed: 5.4,
  },
  dev_smart_wolf: testMob('dev_smart_wolf', 'Smart Rig Wolf', 'beast', 0xffffff),
  dev_smart_wolf_v2: testMob('dev_smart_wolf_v2', 'Smart Rig Wolf V2', 'beast', 0xffffff),
  dev_smart_goat: {
    ...testMob('dev_smart_goat', 'Smart Rig Goat', 'beast', 0xffffff),
    moveSpeed: 3.4,
  },
  dev_smart_bufalo: {
    ...testMob('dev_smart_bufalo', 'Smart Rig Buffalo', 'beast', 0xffffff),
    moveSpeed: 4.2,
  },
  dev_smart_deer: {
    ...testMob('dev_smart_deer', 'Smart Rig Deer', 'beast', 0xffffff),
    moveSpeed: 4,
  },
  dev_smart_raptor: {
    ...testMob('dev_smart_raptor', 'Smart Rig Raptor', 'beast', 0xffffff),
    moveSpeed: 4.8,
  },
  dev_smart_imp: {
    ...testMob('dev_smart_imp', 'Smart Rig Imp', 'demon', 0xffffff),
    moveSpeed: 4.8,
    // Emberkin's Felbolt identity/palette, with the basic Fire Demon's modest
    // NPC damage. Telegraph reaches the native hand thrust at 0.45 seconds.
    petSpell: {
      name: 'Felbolt',
      ability: 'emberkin_felbolt',
      school: 'fire',
      min: 8,
      max: 11,
      range: 25,
      every: 2,
      windup: 0.45,
    },
  },
  dev_smart_spider: {
    ...testMob('dev_smart_spider', 'Spider (Replaced)', 'spider', 0xffffff),
    ...DEV_SPIDER_KITS.dev_smart_spider,
  },
  // Spawned on their existing comparison positions through combatMobId.
  dev_spider_forest: {
    ...testMob('dev_spider_forest', 'Forest Spider Trial (90%)', 'spider', 0xffffff),
    ...DEV_SPIDER_KITS.dev_spider_forest,
  },
  dev_spider_marsh: {
    ...testMob('dev_spider_marsh', 'Marsh Spider Trial (105%)', 'spider', 0xffffff),
    ...DEV_SPIDER_KITS.dev_spider_marsh,
  },
  dev_spider_sand: testMob('dev_spider_sand', 'Sand Spider Trial (80%)', 'spider', 0xffffff),
  dev_spider_frost: testMob('dev_spider_frost', 'Frost Spider Trial (110%)', 'spider', 0xffffff),
  dev_spider_broodmother: {
    ...testMob('dev_spider_broodmother', 'Broodmother Spider Trial (130%)', 'spider', 0xffffff),
    ...DEV_SPIDER_KITS.dev_spider_broodmother,
  },
};

/** Bespoke NPC models shown shoulder-to-shoulder for scale, materials and idle
 *  review. Keep this data in the island module so the command and tests share
 *  the exact authored lineup rather than duplicating offsets. */
export const DEV_MODEL_LAB_NPC_LINEUP = [
  { templateId: 'apothecary_lin', ...DEV_MODEL_LAB_APOTHECARY_POS },
  { templateId: 'fisherman_brandt', x: shiftX(-348), z: -50, facing: Math.PI },
  { templateId: 'trader_wilkes', x: shiftX(-340), z: -50, facing: Math.PI },
  { templateId: 'smith_haldren', x: shiftX(-332), z: -50, facing: Math.PI },
  { templateId: 'marshal_redbrook', x: shiftX(-324), z: -50, facing: Math.PI },
] as const;

/** One stationary subject per model, on separated combat pads. Each subject
 * retaliates only after a direct pull; the NPC gallery is outside the grid. */
export const DEV_MODEL_LAB_MOB_LINEUP = [
  { templateId: 'dev_rogue_minion', x: shiftX(-384), z: -24, facing: Math.PI / 2 },
  { templateId: 'dev_rogue_assassin', x: shiftX(-360), z: -24, facing: Math.PI / 2 },
  { templateId: 'dev_skeleton_minion', x: shiftX(-336), z: -24, facing: Math.PI / 2 },
  { templateId: 'dev_skeleton_warrior', x: shiftX(-312), z: -24, facing: Math.PI / 2 },
  { templateId: 'dev_skeleton_cultist', x: shiftX(-384), z: 0, facing: Math.PI / 2 },
  { templateId: 'dev_kobold', x: shiftX(-360), z: 0, facing: Math.PI / 2 },
  { templateId: 'dev_troll', x: shiftX(-336), z: 0, facing: Math.PI / 2 },
  { templateId: 'dev_bone_golem', x: shiftX(-312), z: 0, facing: Math.PI / 2 },
  { templateId: 'dev_meshy_murlok', x: shiftX(-384), z: 24, facing: Math.PI / 2 },
  { templateId: 'dev_skeleton_acolyte', x: shiftX(-360), z: 24, facing: Math.PI / 2 },
  { templateId: 'dev_meshy_ogre', x: shiftX(-336), z: 24, facing: Math.PI / 2 },
  { templateId: 'dev_skeleton_necromancer_v2', x: shiftX(-384), z: 48, facing: Math.PI / 2 },
  { templateId: 'dev_skeleton_caster_v3', x: shiftX(-360), z: 48, facing: Math.PI / 2 },
  { templateId: 'dev_skeleton_rogue_v3', x: shiftX(-336), z: 48, facing: Math.PI / 2 },
  { templateId: 'dev_treant_v2', x: shiftX(-312), z: 48, facing: Math.PI / 2 },
  { templateId: 'dev_smart_bear', x: shiftX(-312), z: 24, facing: Math.PI / 2 },
  // Wolf V1 remains available for explicit dev spawns; V2 owns the default pad.
  { templateId: 'dev_smart_wolf_v2', x: shiftX(-312), z: 72, facing: Math.PI / 2 },
  { templateId: 'dev_smart_goat', x: shiftX(-288), z: 48, facing: Math.PI / 2 },
  { templateId: 'dev_smart_bufalo', x: shiftX(-288), z: 72, facing: Math.PI / 2 },
  { templateId: 'dev_smart_deer', x: shiftX(-336), z: 72, facing: Math.PI / 2 },
  { templateId: 'dev_smart_raptor', x: shiftX(-360), z: 72, facing: Math.PI / 2 },
  { templateId: 'dev_smart_imp', x: shiftX(-384), z: 72, facing: Math.PI / 2 },
  { templateId: 'dev_fire_elemental', x: shiftX(-288), z: 0, facing: Math.PI / 2 },
  { templateId: 'dev_ice_elemental', x: shiftX(-288), z: -24, facing: Math.PI / 2 },
  { templateId: 'dev_water_elemental', x: shiftX(-288), z: -48, facing: Math.PI / 2 },
  { templateId: 'dev_stone_elemental', x: shiftX(-264), z: -48, facing: Math.PI / 2 },
  { templateId: 'dev_storm_elemental', x: shiftX(-264), z: 0, facing: Math.PI / 2 },
  { templateId: 'dev_smart_spider', x: shiftX(-264), z: 48, facing: Math.PI / 2 },
] as const;
