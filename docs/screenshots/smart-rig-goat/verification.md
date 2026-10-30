# Goat animation verification, 2026-10-18

`before-native.png` shows the owner's unanimated source at the same camera and
height. The real `CharacterVisual` renderer captured the final compressed asset:

- [Walk](walk.gif), [trot](trot.gif), [run](run.gif).
- [Headbutt](headbutt.gif), [stronger ram](ram.gif).
- [Bleat](bleat.gif), [death](death.gif), [overview](overview.png).

`runtime.json` derives displayed motion at wander speed 0.85 and chase speed 3.4.
The general tracker reports `globalRunning:false`, while the goat's native gait
policy selects `Goat_Run` at chase speed. It also verifies two full attack cycles,
recovery to idle and a held death pose, without browser page errors.

## Checks

The goat asset suite passes all 20 cases: topology/provenance, compression,
native joints and bindings, unit quaternions, constant scale, loop closure,
hoof/hock continuity, every support hoof's cadence, headbutt support and recovery,
corpse relaxation, skinned floor contact and island registration.

The model gait tests first reproduced two failures in the initial policy.
After correction they verify actual `updateLocomotion` output, matched cadence,
hysteresis boundaries, default models and non-travel priority. The final combined
run passed 292 tests with three skipped across 17 suites:

```text
node node_modules/vitest/vitest.mjs run tests/smart_goat_asset.test.ts tests/smart_bear_asset.test.ts tests/smart_wolf_asset.test.ts tests/quadruped_death_pose.test.ts tests/animal_motion_flow.test.ts tests/dev_model_lab.test.ts tests/dev_commands.test.ts tests/mob_weapon_fit_studio.test.ts tests/equipment_fit_payload.test.ts tests/equipment_carry_preview.test.ts tests/weapon_fit_loadouts_core.test.ts tests/character_anim_state.test.ts tests/localization_fixes.test.ts tests/model_gait_core.test.ts tests/locomotion.test.ts tests/character_tpose_repair.test.ts tests/character_preview_policy.test.ts --maxWorkers=2
```

Also passed:

```text
npm run check:ts
node_modules/.bin/biome.cmd check src/render/characters/visual.ts src/render/characters/manifest.ts src/render/characters/model_gait_core.ts tests/model_gait_core.test.ts tests/architecture.test.ts
node scripts/malware_scan.mjs --gate
node tmp/goat-motion/runtime.mjs
```

Biome reports only the existing unrelated non-null-assertion warning. The final
production Vite bundle built into a temporary directory with public copying
disabled; the browser separately loaded the shipping GLB. I18n, wiki and media
manifests were regenerated through their owning generators.

`authoring.json` records per-clip reach diagnostics. Fold margin stays above
0.1127 source units; small run/ram reach clamps are about 0.0107 and 0.0083.
`floor.json` samples every skinned vertex at 41 phases per clip: the lowest point
is -0.002094 during idle, within the existing contact tolerance. All other clips
are higher. A separate pad probe checked 625 ground samples per seed, all at
height 1.7 with no water or collider displacement.

A fresh read-only review identified the actual-world gait mismatch and verified
its correction, finding no remaining blocker. Bear and wolf assets were not
rebaked or changed. The architecture suite passes 111 assertions and retains
one pre-existing failure for raw source control bytes elsewhere in the worktree;
the new pure-core registry and import-boundary checks pass.

`GATE_SELECT_BASE=HEAD node scripts/gate_select.mjs` stops at existing i18n
freshness differences. No files were staged to bypass it. The full worktree gate
is not green.
