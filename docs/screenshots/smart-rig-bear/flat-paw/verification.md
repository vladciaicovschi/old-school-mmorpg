# Flat-paw contact adjustment

The active wrist rolls inward by 30 degrees about its yaw-turned longitudinal
axis. A smooth contact envelope ramps from phase 0.20 to 0.38 and fades from
0.58 to 0.84. Both paw sides mirror this rotation; the wrist is level again
before replanting. The rounded wrist target path and existing attack rotation
are unchanged.

The two new orientation cases fail on the preceding asset's almost-zero
inward sole normal and pass on the rebuilt asset. They check both inward
and downward sole orientation at mid-sweep, plus the level end pose.
Existing trajectory, limb-continuity, support and skin-floor checks remain.
Forward reach is measured at the wrist target, so the new contact roll can
turn the claws without changing the trajectory assertion.

Validation commands:

Eight focused suites pass, 138 tests total. TypeScript and scoped Biome pass.
Independent full-clip sampling confirms mirrored contact sole normals
(inward component about 0.50, downward component about -0.865), unchanged
skin clearance, and exact channel/key equality of the other eight clips.

- `node node_modules/vitest/vitest.mjs run tests/smart_bear_asset.test.ts tests/anim_pipeline_bear.test.ts tests/dev_model_lab.test.ts tests/equipment_carry_preview.test.ts tests/pose_blend.test.ts tests/character_anim_state.test.ts tests/character_tpose_repair.test.ts tests/weapon_motion_core.test.ts --maxWorkers=2`.
- `npx tsc --noEmit`.
- `node node_modules/@biomejs/biome/bin/biome check tests/smart_bear_asset.test.ts`.
- `node scripts/gate_select.mjs` still stops at existing generated i18n freshness differences in this uncommitted worktree. No unrelated work was staged.

`left.gif` and `right.gif` show the complete updated clips; `before.gif` is
the previous rounded right swipe. The three PNGs show windup, middle contact
and follow-through. `runtime.json` checks two real left/right/left/right/double
rotation cycles without browser errors.
