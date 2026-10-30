# Animal attack expression and caster hands

The October 19 revision updates the five native animal bodies already on the
developer island. It does not change combat damage, timing, range or simulation.

- Wolf V2 commits its body further into bites and lunges. Both hind paws lift,
  step forward, hold contact and recover. Death grounds the flank before the
  complete native tail releases, avoiding the old floor correction lifting it.
- Goat, buffalo and deer use deeper preparation, stronger head/body strikes and
  staggered hind-hoof steps. Lateral strikes retain a planted supporting forehoof.
- Raptor has stronger claw strokes, an airborne forward hind-claw kick and a new
  `Raptor_TailWhip` clip. Its weighted attack selection is 2:2:1:1, keeping the
  whip occasional. The tail coils before the striking wave reaches its tip.
- Cultist, Acolyte, Caster V3 and Necromancer V2 use the existing Warlock palm
  glow path during preparation, following both animated hands. Casting no longer
  adds full-body emissive tint. Buff aura rims and damage feedback remain independent.

`animal_motion_curves.attack_step` joins quintic forward movement to a squared
sine clearance arc, with zero contact velocity at lift-off and replanting. All
changed attack clips report zero native reach clamp. Bone scale remains fixed;
no runtime IK or new visual-dispatch path is introduced. The old wolf keeps the
previous author defaults and its shipping body is not rebuilt.

Rebuild each body using its `scripts/anim/blender_bake_smart_*.py` entry point,
then the matching `scripts/assets/specs/smart_*.json` through
`scripts/assets/build_assets.mjs`. Run `compress_glb_textures.mjs` on only the
five explicit GLBs, then `build_media_manifest.mjs generate`.

Regression coverage includes all twelve quadruped attacks' hind lift/travel,
contact stability, continuity and restored stance; raptor pelvis lift and both
airborne claws; tail sweep and recovery; wolf's final tail skin contact; retained
rigid skull/horns, floor clearance and native topology. Caster checks use both
synthetic moving hands and the four actual shipping rigs, plus painter negative
checks for whole-body casting glow. Other classes retain their existing behavior.

Evidence is in `docs/screenshots/animal-attack-expression/`: comparison sheets
use the previous poses on the top row and revised poses below; GIFs show the
revised full clips through `CharacterVisual`. Runtime probes use fixed cosmetic
random rolls to exercise each attack variant and verify idle/death transitions.

## Verification

The scoped regression command passed all 168 tests in 14 files:

```sh
node node_modules/vitest/vitest.mjs run tests/animal_attack_expression.test.ts tests/smart_wolf_v2_asset.test.ts tests/smart_goat_asset.test.ts tests/smart_bufalo_asset.test.ts tests/deer_raptor_assets.test.ts tests/animal_contact_pose.test.ts tests/quadruped_death_pose.test.ts tests/character_attack_selection.test.ts tests/cast_hand_glow.test.ts tests/cast_hand_glow_core.test.ts tests/ability_vfx_cast_gate.test.ts tests/caster_mob_motion.test.ts tests/ability_vfx_fx_sleep.test.ts tests/ability_vfx_prewarm.test.ts --maxWorkers=1 --testTimeout=60000
```

- `npm run check:ts`: passed.
- `npm run build:bundle`: passed, including backdrop checks and 1,878 hashed media assets.
- `npm run security:gate`: passed (9,081 files, no high findings after existing priors).
- Scoped `biome check` over the 13 changed TypeScript/test files: passed with three
  existing non-null-assertion warnings. The final caster test formatting check passed.
- `node node_modules/vitest/vitest.mjs run tests/architecture.test.ts tests/localization_fixes.test.ts --maxWorkers=1`:
  161 passed, three existing skips, one inherited failure for CRLF U+000D control
  bytes across source/server files. No line-ending sweep was performed.
- `node scripts/gate_select.mjs` with `GATE_SELECT_BASE=HEAD`, and `npm run gate`:
  both stopped at generated-i18n freshness because the existing worktree has
  unstaged generated localization changes. Nothing was staged to bypass that check.

The pre-change regression run reproduced stationary hind feet, a tail tip over
one metre above the floor, the small raptor hop and full-body caster glow. Final
wolf tail skin spans approximately .002 to .386 above the floor, its centreline
tip is .225, and all four final paw joints remain below .207. The dense caster
channel check retains its original five-decimal tolerance for every component,
but aggregates each channel's assertion to avoid matcher allocation per sample.

The island captures use the actual offline world and renderer, holding the clips
through the existing studio-preview seam. They are presentation smoke checks.
The caster probe records four palm sprites and zero casting body-glow intensity,
including at 960x540. `island-smoke.json` records actual mixer clip names and errors.
No simulation behavior, remote state, commits or staged files were changed.
