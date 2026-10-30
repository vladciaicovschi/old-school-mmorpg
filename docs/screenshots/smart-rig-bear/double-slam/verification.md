# Double-paw slam validation

The existing attack sequencer rotates through left, right, left, right, double,
then repeats. No runtime selector or combat rule changed. The new authored clip
is `Bear_DoubleSlam`, duration 1.2 seconds. Front paw pitch tapers near contact
to keep the claws above the floor while both hind paws remain fixed.

## Checks

- `node node_modules/vitest/vitest.mjs run tests/smart_bear_asset.test.ts tests/anim_pipeline_bear.test.ts tests/dev_model_lab.test.ts tests/equipment_carry_preview.test.ts tests/pose_blend.test.ts tests/character_anim_state.test.ts tests/character_tpose_repair.test.ts tests/weapon_motion_core.test.ts --maxWorkers=2`: eight suites, 134 tests.
- `npx tsc --noEmit`: pass.
- `node node_modules/vite/bin/vite.js build --outDir tmp/bear-motion-expressive/build`: pass.
- `node scripts/malware_scan.mjs --gate`: pass, zero high findings after path priors.
- Scoped Biome: bear test passes; manifest has only its existing non-null assertion warning in `weaponSkinModelUrls`.
- Real `CharacterVisual` browser capture asserts ten consecutive attacks against two complete cycles and records no page errors in `runtime.json`.
- `node scripts/gate_select.mjs`: existing i18n freshness differences remain the wider project blocker, as in the previous pass. No unrelated localization files were staged.

`slam.gif` and both PNGs use the original compressed model and materials. The
camera is pulled back for the added standing height. Temporary profile/build
files created during this task were removed after the workspace disk filled;
source files and saved review evidence were preserved.
