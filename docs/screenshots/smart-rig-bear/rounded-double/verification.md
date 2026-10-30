# Rounded double-paw attack

Both single-paw attacks already have mirrored flat-paw contact and were kept
unchanged. The double attack now opens outward during a cubic preparation,
holds briefly at the top, then follows paired bowed inward/downward curves
from phase 0.44 to 0.68, with chest descent synchronized to the sweep. Both
wrists turn 30 degrees inward for broad contact and level before replanting.
The full clip remains 1.2 seconds and the normal attack rotation is unchanged.

Regression coverage independently checks each wrist's bow above 0.25 source
units, mirrored sole orientation, continuous travel during the main sweep,
level recovery, fixed hind support, limb motion and actual skinned mesh floor
clearance. The previous clip fails the new curvature and smoother-motion pins.

Validation commands:

Eight focused suites pass, 140 tests total. TypeScript, scoped Biome and the
production bundle pass. Independent full-clip sampling measures maximum
joint movement 0.09439 and minimum skin floor -0.00645, within the 0.10 and
-0.01 regression limits. All channels and key times of the other nine clips,
including both accepted single-paw swipes, match the preceding asset exactly.

- `node node_modules/vitest/vitest.mjs run tests/smart_bear_asset.test.ts tests/anim_pipeline_bear.test.ts tests/dev_model_lab.test.ts tests/equipment_carry_preview.test.ts tests/pose_blend.test.ts tests/character_anim_state.test.ts tests/character_tpose_repair.test.ts tests/weapon_motion_core.test.ts --maxWorkers=2`.
- `npx tsc --noEmit`.
- `node node_modules/vite/bin/vite.js build --outDir C:/Users/Vlad/.codex/visualizations/2026/10/16/01a144bb-8c0c-7950-8e65-fd47497d7eac/bear-rounded-double-build`.
- `node node_modules/@biomejs/biome/bin/biome check tests/smart_bear_asset.test.ts`.
- `node scripts/gate_select.mjs` remains blocked by existing generated i18n freshness differences in this uncommitted worktree; unrelated localization work was not staged.

`slam.gif` shows the complete revised double attack. `rear-up.png` and
`release.png` preserve the full silhouette. `runtime.json` asserts ten real
attacks follow two complete left/right/left/right/double cycles without
browser errors.

The first bundle attempt exhausted free space on D:. Its task-created output
was removed and the build passed using temporary output on C:. Final browser
capture and test runs passed after this cleanup. Temporary build/profile
directories were removed while source files and saved evidence were kept.
