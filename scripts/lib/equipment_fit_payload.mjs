// Dev-save boundary: accept old hand/armor payloads or a complete carry extension,
// never a partial extension or unchecked additional property.
export const CARRY_FIT_TARGETS = ['mainhand_hip', 'offhand_hip', 'mainhand_back', 'offhand_back'];

// One explicit roster for the chooser, runtime draft hydration and dev save
// boundary. Legacy bodies remain save-compatible, not selectable replacements.
export const MOB_EQUIPMENT_FIT_SUBJECTS = [
  'dev_rogue_minion',
  'dev_rogue_assassin',
  'dev_skeleton_minion',
  'dev_skeleton_warrior',
  'dev_skeleton_cultist',
  'dev_skeleton_acolyte',
  'dev_kobold',
  'dev_troll',
  'dev_bone_golem',
  'dev_meshy_murlok',
  'dev_meshy_ogre',
  'dev_skeleton_necromancer_v2',
  'dev_skeleton_caster_v3',
  'dev_skeleton_rogue_v3',
  'dev_treant_v2',
  'dev_smart_bear',
  'dev_smart_wolf',
  'dev_smart_wolf_v2',
  'dev_smart_goat',
  'dev_smart_bufalo',
  'dev_smart_deer',
  'dev_smart_raptor',
  'dev_smart_imp',
  'dev_fire_elemental',
  'dev_ice_elemental',
  'dev_water_elemental',
  'dev_storm_elemental',
  'dev_stone_elemental',
].map((templateId) => ({ templateId, visualKey: `npc_${templateId}` }));

export const HELD_EQUIPMENT_FIT_VISUALS = [
  'player_warrior',
  'player_paladin',
  'player_hunter',
  'player_rogue',
  'player_priest',
  'player_shaman',
  'player_mage',
  'player_warlock',
  'player_druid',
  'player_meshy_sentinel_v1',
  'player_meshy_titan',
  'mob_murloc',
  'mob_ogre',
  'skel_minion',
  'skel_warrior',
  'skel_rogue',
  'skel_mage',
  'skel_boss',
  'delve_skel_ringer',
  'delve_skel_effigy',
  'delve_skel_varric',
  ...MOB_EQUIPMENT_FIT_SUBJECTS.map((subject) => subject.visualKey),
];

// Explicit authoring subjects, never arbitrary save keys or filesystem paths.
export const ITEM_EQUIPMENT_FIT_PROFILES = [
  { visualKey: 'player_paladin', modelUrl: 'models/weapons/meshy/dwarven_warhammer_2h_1.glb' },
  { visualKey: 'player_warrior', modelUrl: 'models/weapons/meshy/claymore_sword_1.glb' },
  { visualKey: 'player_hunter', modelUrl: 'models/weapons/meshy/arcane_longbow_1.glb' },
  { visualKey: 'player_hunter', modelUrl: 'models/weapons/meshy/test_crossbow_1.glb' },
];
export function itemEquipmentFitKey(visualKey, modelUrl) {
  return `${visualKey}@${modelUrl}`;
}
export function validItemEquipmentFitKey(key) {
  return ITEM_EQUIPMENT_FIT_PROFILES.some(
    (profile) => itemEquipmentFitKey(profile.visualKey, profile.modelUrl) === key,
  );
}

export function validEquipmentFitTransform(value) {
  if (!value || typeof value !== 'object') return false;
  return (
    [
      ['position', 5],
      ['rotationDeg', 360],
    ].every(
      ([key, limit]) =>
        Array.isArray(value[key]) &&
        value[key].length === 3 &&
        value[key].every(
          (entry) =>
            typeof entry === 'number' && Number.isFinite(entry) && Math.abs(entry) <= limit,
        ),
    ) &&
    typeof value.scale === 'number' &&
    Number.isFinite(value.scale) &&
    value.scale >= 0.01 &&
    value.scale <= 10
  );
}

export function validEquipmentFitTransforms(value, legacyTargets) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const expected =
    keys.length === legacyTargets.length ? legacyTargets : [...legacyTargets, ...CARRY_FIT_TARGETS];
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key)) &&
    expected.every((key) => validEquipmentFitTransform(value[key]))
  );
}

export function mergeHeldEquipmentFit(current, transforms, includeHands = true) {
  const keys = includeHands ? ['mainhand', 'offhand', ...CARRY_FIT_TARGETS] : CARRY_FIT_TARGETS;
  return {
    ...current,
    ...Object.fromEntries(
      keys.filter((key) => transforms[key] !== undefined).map((key) => [key, transforms[key]]),
    ),
  };
}
