# Expressive bear motion verification

Work performed in the existing `feature/character-model-slice` worktree because
the source bear, baker and lab registration are existing uncommitted work there.
No release refs are available locally. No changes were staged, committed or pushed.

## Passing checks

- `node node_modules/vitest/vitest.mjs run tests/smart_bear_asset.test.ts tests/anim_pipeline_bear.test.ts tests/dev_model_lab.test.ts tests/equipment_carry_preview.test.ts tests/pose_blend.test.ts tests/character_anim_state.test.ts tests/character_tpose_repair.test.ts --maxWorkers=2`: seven suites, 115 tests pass. An earlier concurrent run hit a 10-second setup timeout in the generic CharacterVisual suite; the bounded run completes without changing the timeout or assertions.
- `npx tsc --noEmit`: exit 0.
- `node node_modules/vite/bin/vite.js build --outDir tmp/bear-motion-expressive/build`: exit 0.
- `node node_modules/@biomejs/biome/bin/biome check tests/smart_bear_asset.test.ts`: pass after scoped formatting.
- `node scripts/malware_scan.mjs --gate`: pass, zero high findings after path priors.
- Original asset: the three added acceptance cases fail on absent body sway and insufficient swipe windup height. Rebuilt asset: all 14 bear asset cases pass, including all-frame three-paw support and intermediate knee/elbow continuity.
- Browser captures use the real `CharacterVisual` and original compressed materials; no page errors. `runtime.json` confirms load, run, attack, recovery to idle and held death.

## Wider project blockers

- `node scripts/gate_select.mjs`: stops at i18n freshness, with existing generated localization differences against the staged/committed tree. Unrelated work was not staged to bypass this check.
- `tests/character_clipmaps.test.ts`: six failures involving existing hunter ClipMap fields, paladin/modular clip availability, incompatible player/modular skeleton bindings and a multipart NPC expectation. No bear mismatch appears in this output. These other rigs were not changed in this task.

## Evidence

`before-after.png` compares original and revised windup, release and walk poses.
`walk.gif` shows the complete 1.2-second walk; `swipe.gif` shows the 0.95-second
right swipe rounded to 24 frames at 25 fps. `windup.png`, `diagonal-rake.png`
and `walk.png` are individual revised poses. Left and right swipes both have
automated direction, reach and support coverage.
