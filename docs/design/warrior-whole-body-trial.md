# Warrior whole-body appearance trial

Historical trial, superseded by [independent equipment and chest tiers](equipment-appearance-tiers.md).
The current game retains all twelve gear slots; the old load-time one-slot conversion
and universal test-suit grants are disabled. Higher tiers fall back to the approved T1
body until compatible models are registered. The text below documents the earlier trial.

Recruit, Militia, and Knight are complete skinned characters, with weapons and
shields attached separately through the existing equipped-hand path. Each GLB
contains one mesh, one skeleton, and all 51 supplied Sword and Shield clips.
The runtime clip map selects idle, combat idle, walk, run, attack, hit, cast,
jump, and death. Remaining clips are retained for future animation wiring.

For a warrior in the default Meshy body mode, open Bags (B) or Character (C)
and choose Armor appearance. Russian labels are Novobranets, Opolchenets, and
Rytsar. The character-sheet turntable and world body use the same selection.
It remains active outside the tutorial island. A Combat Mech cosmetic keeps
priority; unequip it to use the warrior suits. The KayKit/Quaternius comparison
flags retain their existing behavior.

This is a device-local visual trial. Choice is stored per character name in
localStorage, defaults to Knight, and never changes equipment stats, loot,
set bonuses, or server state. Other clients do not receive this preference.
It does not add three inventory item definitions. Inventory and character-sheet
controls are two views of the same appearance selection. Small class portraits
retain their existing class portrait; the large turntable shows the suit.

## Rebuild

Sources: D:/MODELS/warior/mixamo_rigged/{recruit,militia,knight}_sword_and_shield.
Texture masters: D:/MODELS/warior/mixamo_ready/{recruit,militia,knight}.

1. Run Blender with scripts/assets/export_warrior_suits.py, --source and --textures.
2. Run node scripts/assets/build_assets.mjs scripts/assets/specs/warrior_suits.json.
3. Run scripts/assets/compress_glb_textures.mjs over the three output GLBs, with ktx on PATH.
4. Run node scripts/build_media_manifest.mjs generate.

The exporter reuses the existing evaluated-pose Mixamo retargeter, bakes unit
transforms, and removes horizontal root translation. Raw GLBs and Blender
inspection files stay under tmp/asset_src/warrior_suits, outside public.

Game launching and manual visual checks are reserved for the owner. Inspect
weapon grips, transitions, movement, death, and mobile picker layout in-game.
