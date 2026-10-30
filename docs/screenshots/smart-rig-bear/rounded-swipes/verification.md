# Rounded single-paw sweeps

Both swipes use a cubic preparation, one continuous bowed high-to-low
cross-body stroke, and a cubic recovery. Forward extension and trunk lunge
are reduced. The active elbow splays gradually and the paw turns with the
shoulder so the claws follow the sweep. Other clips and the existing
left/right/left/right/double attack rotation retain their behavior.

## Validation

- `node node_modules/vitest/vitest.mjs run tests/smart_bear_asset.test.ts tests/anim_pipeline_bear.test.ts tests/dev_model_lab.test.ts tests/equipment_carry_preview.test.ts tests/pose_blend.test.ts tests/character_anim_state.test.ts tests/character_tpose_repair.test.ts tests/weapon_motion_core.test.ts --maxWorkers=2`: eight suites, 136 tests pass.
- `npx tsc --noEmit`: pass.
- `node node_modules/vite/bin/vite.js build --outDir tmp/bear-rounded/build`: pass.
- `node scripts/malware_scan.mjs --gate`: pass, zero high findings after path priors.
- `node node_modules/@biomejs/biome/bin/biome check tests/smart_bear_asset.test.ts`: pass after scoped formatting.
- New acceptance cases fail on the previous asset's abrupt joint motion; the rebuilt asset passes rounded-trajectory, lateral-dominance, joint-continuity and central-stroke movement checks on both sides.
- Browser capture uses real `CharacterVisual` and compressed source materials. Ten consecutive attacks still follow the expected two complete rotation cycles, with no page errors (`runtime.json`).

Independent before/after sampling measures the mid-sweep bow at 0.323 versus
0.208 source units, and the lateral/depth ratio at about 4.92 versus 1.55.
The tests pin a bow above 0.26 and lateral travel above three times depth.
Full-mesh sampling finds the revised swipes' lowest skin points above -0.007
source units, within the -0.01 regression limit. Every channel and key time
of the other eight clips matches the preceding asset exactly.

`left.gif` and `right.gif` play complete 0.95-second clips rounded to 24
frames at 25 fps. `before.gif` preserves the preceding right swipe in the
same framing. The three PNGs show preparation, the middle of the arc, and
follow-through.

The wider selective gate remains blocked at existing generated i18n
freshness differences in this uncommitted worktree. No localization changes
were staged to bypass it.
