// Item id -> held-weapon variant key. This registry selects the 3D model attached by
// src/render/characters/manifest.ts as models/weapons/<key>.glb. Inventory identity is
// deliberately independent: every authored weapon now ships bespoke painted art at
// public/ui/items/<item-id>.webp, while Heroic copies inherit their base painting.
//
// Pure data, no imports, no DOM: safe to import from both the ui icon layer and
// the render character layer (and from node unit tests). Add a base weapon here and add its
// painted item WebP in the same change. Values name both the GLBs and their legacy JPG previews
// under public/ui/weapons/, which remain useful to Armory and asset-pipeline tooling.
export const ITEM_WEAPON_VARIANTS: Record<string, string> = {
  dev_hunter_practice_bow: 'meshy/arcane_longbow_1',
  dev_hunter_practice_crossbow: 'meshy/test_crossbow_1',
  // ---- swords (separate Meshy one-handed and two-handed tiers) ---------------
  worn_sword: 'meshy/ascendance_sword_1',
  eastbrook_arming_sword: 'meshy/ascendance_sword_2',
  ironedge_longsword: 'meshy/ascendance_sword_2', // crafted (weaponcrafting tier 2)
  thorium_warblade: 'meshy/ascendance_sword_3', // crafted 1H fallback
  gravecaller_blade: 'meshy/ascendance_sword_3',
  emberfang_warblade: 'meshy/ascendance_sword_3',
  redbrook_blade: 'meshy/ascendance_sword_4',
  crossroads_saber: 'meshy/ascendance_sword_4',
  mistcallers_edge: 'meshy/ascendance_sword_5',
  zealotsbane_blade: 'meshy/ascendance_sword_5',
  hoarfrost_edge: 'meshy/ascendance_sword_5', // rift rare 1H sword (heroic clone rides heroicOf)
  veilsteel_blade: 'meshy/ascendance_sword_2', // realm uncommon 1H sword (arming-sword sibling)
  kingsbane_last_oath: 'meshy/ascendance_sword_5',
  valeborn_spellblade: 'meshy/ascendance_sword_5',
  maldrecs_soulbinder: 'meshy/ascendance_sword_5',
  highwatch_warblade: 'meshy/ascendance_sword_4',
  duskforged_warblade: 'meshy/ascendance_sword_5', // crafted apex 1H (masterwrought)
  // These names do not imply two-handed mechanics: their actual item hand is 1H.
  verlans_oathblade: 'meshy/ascendance_sword_3',
  moonscale_saber: 'meshy/ascendance_sword_4',
  final_argument_greatblade: 'meshy/ascendance_sword_5', // WARFARE Strength one-hander
  eastbrook_greatsword: 'meshy/claymore_sword_1', // plain starter two-hander
  highwatch_greatsword: 'meshy/claymore_sword_2',
  wyrmfang_greatblade: 'meshy/claymore_sword_3',
  bonewrought_greatsword: 'meshy/claymore_sword_4',
  direfang_greatblade: 'meshy/claymore_sword_4',
  wildheart_tuskblade: 'meshy/claymore_sword_4',
  deathless_greatblade: 'meshy/claymore_sword_5',
  greatfang_of_the_basin: 'meshy/claymore_sword_5',

  // ---- daggers (five Meshy tiers, from plain iron to the ornate arcane blade) --
  rusty_dagger: 'meshy/arcane_dagger_1',
  vale_carving_knife: 'meshy/arcane_dagger_1',
  mirefen_skinner: 'meshy/arcane_dagger_1',
  ironvein_pickblade: 'meshy/arcane_dagger_1',
  caravan_warden_dirk: 'meshy/arcane_dagger_1',
  icevein_dirk: 'meshy/arcane_dagger_2',
  keen_dirk: 'meshy/arcane_dagger_2',
  whetted_iron_dirk: 'meshy/arcane_dagger_2', // crafted; dirks share dagger_b
  mistbinder_kris: 'meshy/arcane_dagger_2',
  mirejaw_biteblade: 'meshy/arcane_dagger_2',
  cultist_flayer: 'meshy/arcane_dagger_2',
  tideglass_dirk: 'meshy/arcane_dagger_2',
  duskfang_dirk: 'meshy/arcane_dagger_2', // realm uncommon dirk (dirks share dagger_b)
  moggers_shiv: 'meshy/arcane_dagger_3',
  widowfang_dirk: 'meshy/arcane_dagger_3',
  nhalias_dirgeblade: 'meshy/arcane_dagger_4',
  riptide_dirk: 'meshy/arcane_dagger_4',
  gutripper_shiv: 'meshy/arcane_dagger_4',
  fang_of_korzul: 'meshy/arcane_dagger_4',
  gravewardens_shiv: 'meshy/arcane_dagger_5',
  drownedmoon_kris: 'meshy/arcane_dagger_5',
  sloomtooth_tidefang: 'meshy/arcane_dagger_5',
  skullsplitter_dirk: 'meshy/arcane_dagger_5',
  first_blood_razor: 'meshy/arcane_dagger_5', // WARFARE Agility main hand
  mirejaw_fang_knife: 'meshy/arcane_dagger_1', // knives share dagger_a (vale_carving_knife)
  drowned_choir_fang: 'meshy/arcane_dagger_4', // fangs share dagger_c (fang_of_korzul)
  mistcallers_fang: 'meshy/arcane_dagger_5', // EPIC: Heroic Vael dagger
  wildheart_fangknife: 'meshy/arcane_dagger_5',
  voidsong_dirk: 'meshy/arcane_dagger_5', // LEGENDARY: the S-rift caster dirk
  // Meshy has a complete five-tier dagger family, including the end-game fallback.
  rimefang: 'meshy/arcane_dagger_5',
  marrowpoint: 'meshy/arcane_dagger_5',
  duskwhisper: 'meshy/arcane_dagger_5',
  // heroic_duskwhisper inherits the base variant via heroicOf (auto-generated);
  // it must NOT have its own entry here (held_weapon_models pins that).
  boneglass_shiv: 'meshy/arcane_dagger_3', // RARE: Basin Lv17-19 filler

  // ---- staves (the longer Meshy five-tier family) ------------------------------
  gnarled_staff: 'meshy/arcane_staff_1',
  hickory_shortstaff: 'meshy/arcane_staff_1',
  fenreed_staff: 'meshy/arcane_staff_1',
  craghorn_staff: 'meshy/arcane_staff_2',
  apprentice_staff: 'meshy/arcane_staff_2',
  staff_of_drowned_prayers: 'meshy/arcane_staff_2',
  gravecaller_staff: 'meshy/arcane_staff_3', // "Staff of the Hollow"
  mirejaw_oracle_staff: 'meshy/arcane_staff_3',
  hollow_vigil_staff: 'meshy/arcane_staff_3',
  emberwood_staff: 'meshy/arcane_staff_4',
  ironvein_lantern_staff: 'meshy/arcane_staff_4',
  elderwood_battle_staff: 'meshy/arcane_staff_4', // crafted (weaponcrafting tier 3)
  staff_of_velkhar: 'meshy/arcane_staff_4',
  vaels_mist_staff: 'meshy/arcane_staff_5',
  ogre_bonecharm_staff: 'meshy/arcane_staff_5',
  briarroot_staff: 'meshy/arcane_staff_1', // feral ladder, zone-1 rung
  cragthorn_greatstaff: 'meshy/arcane_staff_3', // feral ladder, zone-3 rung
  nightfangs_greatstaff: 'meshy/arcane_staff_5', // feral ladder, Korzul epic rung
  gleamwood_stave: 'meshy/arcane_staff_2', // realm uncommon caster stave
  staff_of_the_gravewyrm: 'meshy/arcane_staff_5',
  deathless_heartwood: 'meshy/arcane_staff_5',
  drovers_staff: 'meshy/arcane_staff_3',
  emberglass_warstaff: 'meshy/arcane_staff_4', // WARFARE caster main hand
  lunar_tide_greatstaff: 'meshy/arcane_staff_5',
  wildheart_hexwood_staff: 'meshy/arcane_staff_5',

  // ---- wands (1H caster: scepters / rods / foci) ------------------------------
  drowned_tide_scepter: 'wand_a',
  drownedmoon_scepter: 'wand_b',
  palecoil_rod: 'adv_wand',
  corpse_candle_focus: 'wand_a',
  nhalias_litany_rod: 'wand_b',
  stormcallers_focus: 'wand_b', // EPIC: Nythraxis raid caster focus
  scepter_of_the_deathless_court: 'adv_wand', // EPIC: Nythraxis raid scepter

  // ---- maces (actual handedness chooses Lion 1H or Dwarven 2H) ---------------
  training_mace: 'meshy/lion_warhammer_1h_1',
  bronzework_mace: 'meshy/lion_warhammer_1h_1',
  copper_flanged_mace: 'meshy/lion_warhammer_1h_1', // crafted starter
  bristleback_maul: 'meshy/lion_warhammer_1h_2', // mechanically one-handed despite the id
  voss_sanctified_mace: 'meshy/lion_warhammer_1h_2',
  bogiron_mace: 'meshy/lion_warhammer_1h_2',
  moggers_copper_cudgel: 'meshy/lion_warhammer_1h_3',
  crag_warden_cudgel: 'meshy/lion_warhammer_1h_3',
  brutoks_maul: 'meshy/lion_warhammer_1h_4', // mechanically one-handed
  drownedmoon_maul: 'meshy/lion_warhammer_1h_4',
  nhalias_bell_maul: 'meshy/lion_warhammer_1h_5',
  ironshod_maul: 'meshy/dwarven_warhammer_2h_1', // crafted 2H on-ramp
  fenshadow_maul: 'meshy/dwarven_warhammer_2h_2',
  gravewyrm_thornmaul: 'meshy/dwarven_warhammer_2h_3',
  maul_of_the_scourged_wilds: 'meshy/dwarven_warhammer_2h_4',
  wildsoul_maul: 'meshy/dwarven_warhammer_2h_5',
  ridgebreaker: 'meshy/dwarven_warhammer_2h_5', // crafted apex (masterwrought)
  varkhul_forgebreaker: 'hammer_varkhul', // LEGENDARY: Ignivar raid (animated engine maul)

  // ---- axes (Meshy one-handed tiers; two-handed art remains separate) ---------
  rusty_hatchet: 'meshy/evolution_axe_1',
  copper_bearded_axe: 'meshy/evolution_axe_1', // crafted (weaponcrafting tier 1)
  drogmars_skullcleaver: 'meshy/evolution_axe_2',
  deacons_cleaver: 'meshy/evolution_axe_3',
  gorraks_cruel_chopper: 'meshy/evolution_axe_4',
  arcanite_war_axe: 'meshy/evolution_axe_4', // crafted (weaponcrafting tier 3)
  gorraks_cleaver: 'meshy/evolution_axe_5',
  tradesman_hatchet: 'meshy/evolution_axe_5',
  gravewyrm_cleaver: 'meshy/evolution_axe_5', // EPIC: Heroic Korzul axe
  courtiers_bonefang: 'meshy/arcane_dagger_5',
  thornpeak_wardblade: 'meshy/ascendance_sword_5',
  gravecourt_hewer: 'meshy/evolution_axe_5',
  pitlords_cleaver: 'meshy/evolution_axe_5', // rift rare cleaver (heroic clone rides heroicOf)
  tunnelkings_spade: 'adv_axe_2handed',

  // ---- polearms --------------------------------------------------------------
  fen_reaver_glaive: 'scythe', // "Reaver" -> reaper scythe
  tidereaver_gaff: 'spear_a', // a gaff is a hooked spear
  ironbark_boar_spear: 'spear_a', // crafted 2H spear
  fanglords_beastspear: 'spear_a', // RARE: the basin Beastmaster's boar spear

  // ---- Crucible of the Last Spring raid weapons (ignivar_loot.ts) -------------
  // Held models reuse shipped GLBs.
  forgefathers_warhammer: 'meshy/lion_warhammer_1h_5',
  springtouched_crozier: 'meshy/lion_warhammer_1h_5',
  cinderfang_kris: 'meshy/arcane_dagger_5',
  slagrender_cleaver: 'meshy/evolution_axe_5',
  anvilguard_blade: 'meshy/ascendance_sword_5',
  heart_of_the_end_greatblade: 'meshy/claymore_sword_5',
  staff_of_the_last_spring: 'meshy/arcane_staff_5',
  forgefire_spire: 'meshy/arcane_staff_5',
  wand_of_quenched_sparks: 'adv_wand',
};
