# Higher, farther-forward double-attack reach

REVERTED: the owner rejected this trial because it visibly expanded the belly
during rearing. The shipping GLB was restored byte-for-byte from the saved
pre-trial asset, and the baker/tests returned to the accepted rounded-double
trajectory and phase 0.68 timing. The evidence below describes the rejected
trial, not the current game asset.

Both loaded wrists move 0.18 source units forward and 0.12 up compared with
the accepted rounded double attack. Preparation and upper curve controls
follow the new loaded pose; contact endpoint, body height, mirrored flat-paw
rotation and total 1.2-second duration are preserved. The rounded descent
finishes at phase 0.69, with a slightly shorter recovery, to retain smooth
limb motion at the larger amplitude.

Two independent ready-pose tests reject the old 1.32-unit wrist lift and
require a lift above 1.40 plus forward placement within 0.10 of the starting
wrist plane. The strike still travels forward from this more extended ready
pose, with existing arc, sole-orientation, floor, support and continuity pins.

Validation commands:

Eight focused suites pass, 142 tests total. TypeScript and scoped Biome pass.
Independent sampling confirms both wrists move about 0.18 forward and 0.12
up. Maximum joint step is 0.09713 and lowest skin point is -0.00626, within
the 0.10 and -0.01 limits. All channels and key times of the other nine clips
match the preceding asset exactly; the global IK clamp is unchanged.

- `node node_modules/vitest/vitest.mjs run tests/smart_bear_asset.test.ts tests/anim_pipeline_bear.test.ts tests/dev_model_lab.test.ts tests/equipment_carry_preview.test.ts tests/pose_blend.test.ts tests/character_anim_state.test.ts tests/character_tpose_repair.test.ts tests/weapon_motion_core.test.ts --maxWorkers=2`.
- `npx tsc --noEmit`.
- `node node_modules/@biomejs/biome/bin/biome check tests/smart_bear_asset.test.ts`.
- `node scripts/gate_select.mjs`: existing generated i18n freshness differences still stop the wider gate. Unrelated work was not staged.

`slam.gif` shows the complete attack. `rear-up.png` shows the extended loaded
pose; `release.png` shows the strike. `runtime.json` checks ten actual attacks
against two left/right/left/right/double cycles with no browser errors.
