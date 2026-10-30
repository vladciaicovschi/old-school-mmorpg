# Weapon arsenal replacement ledger

This ledger records the live held-model fallbacks after the Meshy weapon imports.
`src/ui/weapon_variants.ts` is the source of truth for player items; hostile
attachments are defined in `src/render/characters/manifest.ts`.

## Imported families now used in game

| Weapon class | Imported family | Replaces in live item mappings |
| --- | --- | --- |
| One-handed sword | `meshy/ascendance_sword_1` through `_5` | The former one-handed KayKit variants, including `adv_sword_1handed`, `sword_f`, `sword_g`, and `purple_sword`. Visual tiers are curated per base item. |
| Two-handed sword | `meshy/claymore_sword_1` through `_5` | `adv_sword_2handed` and `adv_sword_2handed_color`, only for mechanically two-handed swords. `eastbrook_greatsword` uses the plain first tier; Highwatch uses tier 2, Wyrmfang tier 3, the base raid greatswords tier 4, and the final raid/Heroic reward tier 5. |
| Dagger | `meshy/arcane_dagger_1` through `_5` | The former dagger variants, including `ice_fang`, `redskull_dagger`, `purple_dagger`, and `whittler_s_knife`. |
| Staff | `meshy/arcane_staff_1` through `_5` | `staff_b`, `staff_c`, `adv_staff`, and `adv_druid_staff`. These are the longer staff imports. |
| One-handed axe | `meshy/evolution_axe_1` through `_5` | The former one-handed axe fallbacks `adv_axe_1handed` and `purple_axe`. |
| One-handed mace / hammer | `meshy/lion_warhammer_1h_1` through `_5` | Ordinary `hammer_a` through `_d` fallbacks for actual one-handed maces. The starter uses tier 1, the early named hammers tier 2, the mid-game cudgels tier 3, later mauls tier 4, and the end-game one-handers tier 5. |
| Two-handed mace / maul | `meshy/dwarven_warhammer_2h_1` through `_5` | `hammer_d` for actual two-handed mauls: Ironshod, Fenshadow, Gravewyrm, Scourged Wilds, then Wildsoul/Ridgebreaker. The bespoke animated `hammer_varkhul` remains unchanged. |
| Shield | `meshy/battleworn_oak_shield`, `meshy/fallen_king_shield_2` through `_5` | Player shields already resolve through this family. `fallen_king_shield_1` is retained as an imported asset but is not selected by an item. |
| Bow | `meshy/arcane_longbow_1` through `_5` | Imported from `longbows.zip`, with a centred bow grip and previews. No current weapon ItemDef classifies as a bow, so these stay available for a deliberate class-prop or cosmetic assignment. They do not replace crossbows. |
| Crossbow | `meshy/test_crossbow_1` | One imported test model, not a tier family. Registered with the separate `VAR_CROSSBOW` grip. No current weapon ItemDef classifies as a crossbow; existing class props and Armory skins keep their identities. |

Examples of the changed fallback path: `thorium_warblade` now resolves to
`ascendance_sword_3`, `staff_of_the_gravewyrm` to `arcane_staff_5`, and
`pitlords_cleaver` to `evolution_axe_5`. Heroic copies inherit the same model
from their base item automatically.

Handedness follows `weaponHand()` and `weaponTypeForItem()`, never an item name.
`verlans_oathblade`, `moonscale_saber`, and `final_argument_greatblade` are
one-handed in simulation and now use Ascendance models instead of the former
two-handed art. Likewise `bristleback_maul`, `brutoks_maul`, `drownedmoon_maul`,
and `nhalias_bell_maul` stay one-handed despite their ids. No item ids, combat
stats, equipment restrictions, native hand calibration, or Armory skins changed.

The imported claymores retain the `VAR_SWORD` grip, the one-handed hammers use
`VAR_MACE`, and the two-handed hammers use `VAR_HAMMER`. These existing families
already provide both hand and carried transforms. The five visual tiers are
curated artwork choices, not new numeric item levels or balance tiers.

## Mob weapons already imported and assigned

| Mob group | Live model |
| --- | --- |
| Ogres | `rusted_ogre_club` |
| Murlocs | `rusted_murloc_pitchfork` |
| Kobolds | `rusted_kobold_pickaxe` |
| Skeleton minion, warrior, rogue | `rusted_sword_1`, `_2`, `_3` respectively |

## Waiting for dedicated imports

| Class | Current live fallback | Required replacement scope |
| --- | --- | --- |
| Two-handed axes | `adv_axe_2handed` | A two-handed axe family. |
| Wands / scepters | `wand_a`, `wand_b`, `adv_wand` | Caster one-handed wand/scepter tiers. |
| Polearms | `spear_a`, `scythe` | Spear, glaive, and scythe variants. |
| Crossbow tiers | Single `meshy/test_crossbow_1` available; existing class attachments unchanged | The test import does not supply a five-tier family. Longbows remain a separate weapon type. |
| Orbs, lanterns, quivers | Some body defaults or existing special models | Dedicated held props where a class body does not already supply one. |
| Relic / named variants | The relevant class fallback | Bespoke final art can replace any per-item fallback without changing item IDs or heroic inheritance. |

When a new family is imported, add the GLBs under `public/models/weapons`, map
the appropriate base items in `src/ui/weapon_variants.ts` (or
`ITEM_OFFHAND_MODELS` for shields), ensure the grip family exists in
`src/render/characters/assets.ts`, then extend `tests/held_weapon_models.test.ts`.

## Local test kit and rebuild

`grantTemporaryWarriorWeapon` in `src/game/warrior_weapon_test_kit.ts` adds
one `eastbrook_greatsword` (plain Claymore tier 1) to each new offline Warrior
session in DEV only. It does not equip it, alter shared starter gear, touch
online characters or write a save. Remove the helper and its `startOffline`
import/call after testing. Restarting an offline session clears its old inventory.

The supplied archives are extracted under
`tmp/asset_src/meshy_weapon_sets/source/<pack>`. Rebuild the new packs with:

```text
blender --background --factory-startup --python scripts/assets/export_meshy_weapon_sets.py -- claymores warhammers_1h warhammers_2h crossbow
node scripts/assets/build_assets.mjs scripts/assets/specs/meshy_weapon_sets_oct13.json
```

Copy each generated preview JPG to `public/ui/weapons/meshy`, run
`compress_glb_textures.mjs` on the explicit spec outputs, then regenerate the
media manifest. On Windows set `TEMP` and `TMP` to the workspace's
`tmp/blender_temp` for Blender, and point `KTX_BIN` at the local KTX tools when
they are not on PATH. Do not re-export unchanged longbows.

Claymore blade four includes two disconnected inlays; the exporter merges
them with their containing blade instead of dropping decorations. The crossbow
source lies flat with muzzle along -X; export puts its barrel along canonical
+Y (glTF), with the origin behind the trigger. All imported families are listed
in `AUTHORED_HELD_MODELS` to retain original PBR response, including the longbows.
Structural import coverage lives in `tests/meshy_weapon_expansion_assets.test.ts`.

## Local verification of the expansion

The coordinated Vitest run covers the asset/mapping/material contracts, weapon
skins, Warrior motion/visual/carry/preview selection, weighted attack selection,
temporary grant, Warlock motion/casts and global GLB texture compression. All
selected suites pass. `npm run check:ts` and `npm run security:gate` pass.
Scoped Biome reports warnings only. The five prior weapon families and longbows
also received the mandatory KTX2 finalization; no mesh geometry or item stats
were reauthored in that step.

`node scripts/gate_select.mjs` still stops at existing i18n freshness changes.
`npm run build:bundle` still fails because the existing edited `index.html`
lacks `__I18N_LOCALE_CHUNKS__`. Wider architecture/monolith guards report the
checkout's CRLF bytes and pre-existing coordinator size overruns; the temporary
grant adds no net lines to `main.ts`. `npm run ci:changed` selects no files in this
uncommitted setup, so it is not substituted for the explicit scoped Biome run.
No staging, commits, gate bypasses or browser tests were performed. User visual
acceptance remains pending for palm placement, two-hand alignment and back/belt
clearance through movement and jumps.
