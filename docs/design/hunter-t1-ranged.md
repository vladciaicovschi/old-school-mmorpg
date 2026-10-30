# Hunter T1 ranged equipment

The active T1 hunter uses the imported `meshy/test_crossbow_1` as its default
ranged visual. Generic crossbow model names fall back to it; dedicated higher
tier models such as Cinderlatch and Meteorlatch remain unchanged. Legacy hunters
with a melee stat weapon still display the ranged default, not their hatchet.

The local DEV test kit grants Practice Bow and Practice Crossbow into the bag.
Equip them through the normal inventory UI to switch. They are hunter-only
two-handed mainhand test items with the starter hatchet's melee numbers and no
sale value or loot/vendor acquisition. Class ranged damage, attack cadence,
projectiles and launch/impact de-duplication are unchanged. Quivers remain worn
offhands through the existing occupiesHand rule. Production/online entry grants
nothing. To retire the kit later, remove the DEV acquisition, not persisted ids.

## Animation ownership

`export_hunter_motion_donors.py` imports the supplied Hunter Pro Longbow pack
and Druid Pro Rifle/Locomotion/Magic packs without opening a preview. The companion
`hunter_t1_motion_anims.glb` is baked onto the actual T1 hierarchy by
`build_hunter_motion_anims.mjs`, preserving native translations and scales.
Legacy KayKit hunter bow/ability/hit donors are no longer loaded by T1.

Bow is held in the left hand, Crossbow in the right. Both use Longbow idle,
forward/back walking and running body motion. Jump uses the accepted Warrior/
Warlock JumpClassic at its native 0.8333333-second clock, including the moving
spine/head and lower body, with only the armed grip chains preserved. The raw
Locomotion jump is not used. Crossbow replaces only the shoulder/arm/hand chains with
Rifle's carry pose; Rifle walking/running are not imported or used. Its aimed
shot keeps Rifle's aiming pose and the authored recoil.
Ordinary shots start with recoil at the authoritative launch event, with no
draw/aim delay. Bow keeps the native Longbow release pose and hand/elbow path,
including its original frame times; no additive idle rebase is applied. Crossbow
uses a low-ready correction: lift both palms 7 cm and rotate their grip toward
the target without borrowing Rifle's shoulder/head/torso aim, then recoil.
Neither changes the sim timer or equipment fitting.
Cast-time shots draw into their aim anchor at 0.6 seconds and hold until the
authoritative release event. Utility pet casts do not select aimed weapon poses.

The Rifle pack contains no shooting/reloading take. Its aim supplies a modest
3.5 cm two-hand recoil authored offline, followed by recovery, not a new gameplay
timer. Bow release comes from Standing Aim Recoil. Melee punch/kick and Magic's
Standing 1H Magic Attack 03 upward gesture remain distinct from shots for melee
abilities and buffs.
Swim/fall presentation remains the existing shared lane, outside this migration.

Auto shots use a short straight pooled-particle trace instead of a round core.
Hunter projectile skills resolve to the existing arrow ribbon silhouette via
`hunter_vfx_specs.ts`, preserving their skill color and impact identity. The
most degraded tier uses the same narrow particle trace, not a magic orb.

## Fitting

Open `/?weaponfit=1&weaponfitModel=player_hunter&weaponfitWeapon=crossbow`
or use `weaponfitWeapon=bow`. Hunter loadouts appear in the existing subject
panel. Each has its own explicit body/model fit key, local draft, validated
project save and reload hydration. Initial palm fits are solved against the
new aim pose: bow limbs upright/string back, crossbow muzzle forward/prod
horizontal. `hunter_weapon_fits.ts` supplies defaults; authored or local saved
item fits override them. Other bodies/models and the generic hunter fit are
untouched by these model-specific edits.

## Art and provenance

The two inventory icons were generated separately using the built-in image
generation tool, with imported model previews as identity-only references and
approved inventory paintings as style anchors. They ship as opaque 128px WebP.
Exact prompts, sources, retained staging paths and hashes are in
`hunter-ranged-art.json`. Original results and 512px masters remain under ignored
`tmp/hunter_motion/art`. Raster review covers small sizes and grayscale; browser
acceptance belongs to the owner.

## Rebuild and verify

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/assets/export_hunter_motion_donors.py
node scripts/build_hunter_motion_anims.mjs
node scripts/assets/compress_glb_textures.mjs public/models/chars/players/hunter_t1_motion_anims.glb
node scripts/build_media_manifest.mjs generate
npx vitest run tests/hunter_motion.test.ts tests/hunter_motion_visual.test.ts tests/ranged_weapon_core.test.ts tests/hunter_weapon_test_kit.test.ts tests/weapon_fit_loadouts_core.test.ts tests/weapon_fit_studio.test.ts tests/equipment_fit_payload.test.ts tests/item_attachment_fit.test.ts tests/item_attachment_fit_hydration.test.ts --maxWorkers=2
npx vitest run tests/weapon_skins.test.ts tests/held_weapon_models.test.ts tests/anim_pipeline_hunter_ghost.test.ts tests/item_icons.test.ts tests/shipped_item_ids.test.ts --maxWorkers=2
npx vitest run tests/hunter_motion.test.ts tests/hunter_motion_visual.test.ts tests/hunter_projectile_vfx.test.ts tests/vfx.test.ts tests/ranged_shot.test.ts tests/ability_vfx_gesture_release.test.ts tests/ability_vfx_frame_cost.test.ts tests/ability_vfx_core.test.ts tests/ability_vfx_cast_gate.test.ts tests/weapon_skins.test.ts tests/renderer_spellfx_dispatch_order.test.ts --maxWorkers=2
npm run check:ts
npm run security:gate
npm run build:bundle
node scripts/gate_select.mjs
```

The animation-only compressor skip is expected. No browser or Blender GUI is
needed for these checks. Manual acceptance: start a local DEV Hunter, equip
each practice weapon, test movement/jump, instant and aimed shots, pet utility,
then adjust and save both fits independently in the editor. Reload to verify
world/preview agreement. Browser testing and desktop/mobile visual acceptance
are deliberately reserved for the owner.

## Motion corrections, 2026-10-15

User feedback identified three regressions in the first Hunter pass: raw
Locomotion jump rather than the accepted classic jump, a downward-pointing
crossbow, and an anatomically wrong additive bow-release rebase. Before the
fix, three new asset regressions failed: jump clock 2.1666667 instead of
0.8333333 seconds, bow launch palm 0.626 m away from the native anchor, and no
crossbow lift. The corrected asset keeps the same clip names and runtime routing.

`scripts/anim/hunter_hip_fire_pose.mjs` authors the low-ready grip offline.
Tests cover both palms' relative grip through recoil, native arm lengths,
unchanged carry torso/head, native Longbow palm/elbow landmarks, and actual
mixer transitions at 33/70/120 ms. Jump tests compare the full body against the
accepted Warlock source and check airborne clamp/landing for both weapons.

Only Bow/Crossbow Jump and Bow/Crossbow Shot animation channels change. The
other eighteen clips compare numerically identical against the pre-fix asset;
body geometry, PBR maps, VFX, weapon fits and simulation are untouched. A local
pre-fix copy is retained at `tmp/hunter_motion/hunter-before-2026-10-15.glb`.

```powershell
npx vitest run tests/hunter_motion.test.ts tests/hunter_motion_visual.test.ts tests/hunter_hip_fire_pose.test.ts tests/warrior_motion.test.ts tests/warrior_motion_visual.test.ts tests/warlock_motion.test.ts tests/hunter_projectile_vfx.test.ts tests/ranged_shot.test.ts tests/weapon_skins.test.ts tests/anim_pipeline_hunter_ghost.test.ts --maxWorkers=2
```

Focused three-file motion regression run: 16 tests PASS. Expanded ten-file
command above: 125 tests PASS. `npm run check:ts`, scoped Biome and
`npm run security:gate`: PASS. Browser visual acceptance remains with the owner.

`npm run build:bundle` compiled the client and passed backdrop checks, but the
final `build_media_manifest.mjs emit` failed with ENOSPC while copying resources
to `dist/media`: drive D was full. The incomplete generated `dist/media` copy
was removed after validating the exact workspace path and absence of links,
recovering 597114393 bytes; all source assets under `public` and Bible remain
intact. This disposable build output can be regenerated by the normal build.
The current hashed resource set needs 745514887 bytes before extra headroom,
while only about 600 MB remained, so a complete production build is unverified.
No other files were removed to free disk space.

`node scripts/gate_select.mjs` initially stopped on the same ENOSPC during its
Git diff. After temporary-output cleanup, a retry reached the established
i18n freshness failure on accumulated unstaged generated translations. Neither
failure was bypassed; no files were staged. The existing localization issues
recorded below remain outside this animation-only correction.

## Moving shots, 2026-10-15

Native T1 Hunter Bow/Crossbow Shot and Release now opt into
`ClipMap.locomotionShotClips`. `shot_locomotion.ts` partitions the existing
immutable tracks on the character's existing mixer: torso/arms/fingers play
the shot while Hips/root/legs continue Walk, WalkBack, Run or Jump/Fall.
Standing shots retain their full original clips. Aim, utility, melee, other
classes and the legacy modular Hunter do not opt in.

Shot time/rate are preserved when movement starts or stops mid-shot. Incoming
arms crossfade from the outgoing gait; lower gait phase survives shot completion,
including mixer finished-event action reordering. Both layers use the existing
hitstop/LOD clock. Helper actions participate in pose-watchdog checks and stop
for death, pose freeze, studio preview, repair and disposal. Cached split clips
are bounded by the character's existing actions; source tracks are not edited.

This is presentation only: no movement blocking, combat timing, projectile,
simulation, equipment-fit, mesh or GLB changes. Existing cast-time rules remain
unchanged. Browser visual acceptance remains with the owner.

Regression coverage uses the actual shipped hierarchy/tracks and CharacterVisual
mixer, comparing lower-body pose against an independent no-shot control through
walk/backwalk/run, changing speeds, repeated shots and return to locomotion.
Additional checks cover start/stop/gait changes, jumping/clamping, bow/crossbow
switches, arm entry blending, tiny-frame watchdog and preview/death cleanup.

```powershell
npx vitest run tests/shot_locomotion.test.ts tests/hunter_motion_visual.test.ts tests/hunter_motion.test.ts tests/hunter_hip_fire_pose.test.ts tests/clip_names_core.test.ts --maxWorkers=2
```

Verification: 17 files, 186 tests PASS across the two batches below. Typecheck
(`npm run check:ts`), scoped eight-file Biome, `npm run security:gate` and
`npm run build:bundle` PASS. Biome reports only the existing manifest non-null
assertion warning. Bounded read-only runtime/test review found no remaining
actionable issues. No browser was opened.

```powershell
npx vitest run tests/shot_locomotion.test.ts tests/hunter_motion_visual.test.ts tests/hunter_motion.test.ts tests/hunter_hip_fire_pose.test.ts tests/clip_names_core.test.ts tests/warrior_motion_visual.test.ts tests/warrior_motion.test.ts tests/warlock_motion.test.ts tests/paladin_twohand_visual.test.ts tests/remaining_player_motion.test.ts tests/remaining_player_motion_visual.test.ts --maxWorkers=2
npx vitest run tests/character_anim_state.test.ts tests/visual_anim_state.test.ts tests/cast_duration.test.ts tests/cast_duration_core.test.ts tests/hunter_projectile_vfx.test.ts tests/ranged_shot.test.ts --maxWorkers=2
```

`node scripts/gate_select.mjs` (HEAD base, safe-directory environment) again
stops at the established i18n freshness failure: accumulated generated locale
files differ from staged/committed copies. Later shared-gate steps did not run;
the gate was not bypassed and no files were staged.

## Verification record, 2026-10-14

- Headless donor export, 22-clip native bake, expected texture-compressor skip,
  and media manifest generation: PASS.
- Final motion/projectile/launch/VFX regression batch above: 158 tests PASS.
- Final equipment/content batch below: 85 tests PASS. This also runs a real
  AbilityVfxFx assertion: arrow ribbon width 0.08 versus unchanged comet 0.32,
  for both entity-targeted and ground-targeted shots.

```powershell
npx vitest run tests/ability_vfx_frame_cost.test.ts tests/ranged_weapon_core.test.ts tests/hunter_weapon_test_kit.test.ts tests/weapon_fit_loadouts_core.test.ts tests/weapon_fit_studio.test.ts tests/equipment_fit_payload.test.ts tests/item_attachment_fit.test.ts tests/item_attachment_fit_hydration.test.ts tests/item_icons.test.ts tests/shipped_item_ids.test.ts tests/held_weapon_models.test.ts tests/anim_pipeline_hunter_ghost.test.ts --maxWorkers=2
npx vitest run tests/architecture.test.ts -t 'src/sim architecture|src/ui pure-core|src/render pure-core|curated bare-named' --maxWorkers=2
npx vitest run tests/architecture.test.ts tests/localization_fixes.test.ts tests/i18n_completeness.test.ts tests/guide.test.ts --maxWorkers=2
```

- Targeted purity/registration guards: 21 PASS, 91 intentionally outside the
  selected groups. `check:ts`, `security:gate`, `build:bundle`: PASS.
- Wiki/i18n owner generation: PASS. Accepted-art schema/hash/size validation and
  small-size/grayscale/64px circular-crop inspection: PASS.
- Shared `node scripts/gate_select.mjs`: FAIL at i18n freshness because generated
  files differ from staged/committed copies in the accumulated working tree.
  Nothing was staged to bypass this guard. Later gate steps were not reached.
- Broader diagnostic batch: 317 PASS, 3 skipped, 8 FAIL. The architecture
  control-byte scan rejects this Windows checkout's CRLF files across the tree;
  six guide checks fail on accumulated guide/freshness/zone/art/interface WIP;
  M16 localization fails with 70 leaked English leaves.
- Ten M16 leaks belong to this change: Practice Bow and Practice Crossbow each
  still need real zh_CN/zh_TW/ja_JP/ko_KR/ru_RU names. DEV-only acquisition does
  not exempt globally shipped catalog names. Repository policy forbids agent
  overlay translation edits; maintainer fills are required before merge/release.
  This is a known same-change content blocker, not a passing localization gate.
- Scoped read-only runtime/test and content reviews completed. Browser/desktop/
  mobile visual acceptance remains with the owner; no browser was opened.
