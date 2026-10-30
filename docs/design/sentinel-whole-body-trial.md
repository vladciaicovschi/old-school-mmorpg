# Whole-body Sentinel trial

The requested direction is one complete character appearance, with only weapons
and shields represented by separate equipped models. Progression is intended to
move toward runes and enchantments rather than individually assembled armor.

## Implemented local visual slice

- The Meshy preview and Proving Shore player override use
  `MESHY_SENTINEL_VISUAL_KEY` and `meshy_sentinel_v1.glb`.
- `Sentinel_Body` is one skinned mesh on one skeleton. Armor inventory slots do
  not toggle its surfaces. Weapons and shields retain the existing item swap path.
- The previous Titan asset and the segmented Blender authoring source are retained.
- `scripts/assets/export_sentinel_v1.py` builds the raw asset from the fitted V1
  Blender file. Native locomotion is retained; other runtime clips are retargeted
  from the existing Titan bake. Run `scripts/assets/build_assets.mjs` with
  `scripts/assets/specs/sentinel_v1.json`, then the mandatory KTX2 compression and
  media-manifest generator.

## Progression is not migrated yet

Existing inventory slots, item statistics, loot, crafting, enchantment behavior,
and persistence are unchanged in this local visual trial. Rune count, effects,
replacement rules, acquisition and conversion of existing armor need a separate
gameplay design before changing the simulation or saved characters. No new balance
values or currencies have been invented for this import.

## Review

Open the local Vite client, choose Offline and enter the world. The complete suit
appears on the tutorial island. `?charbody=quaternius` remains an appearance
comparison option. This is a local trial, not a deployment.

Focused Sentinel asset, character-body selection, clip-map and existing armor
tests pass. TypeScript and `vite build` pass. `node scripts/gate_select.mjs` stops
at i18n freshness because pre-existing generated localization changes differ
from the staged/committed baseline; nothing was staged to bypass that check.
