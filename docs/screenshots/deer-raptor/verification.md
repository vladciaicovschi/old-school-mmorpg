# Deer and raptor verification, 2026-10-19

Shipping GLBs retain 44 / 64 joints and 311148 / 312498 indices. Three
2048px KTX2 maps per body, Meshopt geometry, approximately 6.35 MiB each.
The originals in the Bible are unchanged.

## Passing checks

- `node node_modules/vitest/vitest.mjs run tests/deer_raptor_assets.test.ts --maxWorkers=2`:
  final 31/31 pass after the tail correction. Covers nonempty clips, bind
  targets, constant scale, quaternion normalization, loop closure, continuous
  limbs, planted supports, gait cadence, actual antler/muzzle skin rigidity,
  ground clearance, released limbs, tail settling and held death poses.
- The seven adjacent suites passed, 92 tests: `dev_model_lab`,
  `dev_model_lab_terrain`, `dev_commands`, `model_gait_core`,
  `character_attack_selection`, `equipment_fit_payload`, and
  `smart_wolf_v2_asset`, via Vitest with `--maxWorkers=2`. Island checks include
  dry, level pads, six-yard approaches, collider clearance and 24-yard separation.
- `npm exec -- tsc --noEmit`: exit 0.
- Vite `build({build:{outDir: path.join(os.tmpdir(),
  'woc-deer-raptor-build-20261019'), copyPublicDir:false, emptyOutDir:true}})`:
  passed. Only the task-owned temporary output was written.
- `npm run i18n:gen`: passed. The first sandboxed attempt hit a Windows
  atomic-rename restriction; the authorized local retry completed.
- `node scripts/malware_scan.mjs --gate`: passed, 9073 files, 0 high findings.
- Scoped Biome: passed, with the existing non-null assertion warning in
  `manifest.ts:1373`. Python authors compile successfully.
- `node scripts/build_media_manifest.mjs generate`: 1877 assets.

`runtime.json` was captured through real `CharacterVisual` and
`updateLocomotion`, using shipping compressed GLBs. Speeds 0.8 / 4 select
deer Walk / Run; 0.8 / 4.8 select raptor Walk / Run. Both faster cases have
globalRunning=false, confirming the per-model gait thresholds work. Random
attacks can repeat, recover to idle, and both death clips clamp at their
actual duration. No browser page errors.

The four GIFs use 25 fps and actual clip durations, including the short run
cycles. Static images show both attack sides, charge/pounce and final death.
The raptor tail relaxes toward the floor after the flank roll.

`deer-floor.json` and `raptor-floor.json` evaluate every skinned vertex at
41 phases of every clip. Worst native-space floor errors are -0.001892
(Deer_Walk) and -0.003390 (Raptor_Run), within the 0.012 tolerance. All
authoring reach clamps are zero; the minimum limb fold reserves are 0.0664
for deer and 0.0642 for raptor. Actual gait speed references were measured
with the same 0.5-second idle normalization sample as the runtime.

## Existing checkout gate failures

`GATE_SELECT_BASE=HEAD node scripts/gate_select.mjs` was run with the
checkout's Git safe.directory setting. It stops at i18n freshness because
regenerated files differ from staged/committed versions. No staging was
performed to bypass the check.

`tests/character_clipmaps.test.ts` and `tests/architecture.test.ts` were
also run: 118 pass, 7 fail. Failures concern the existing hunter
locomotionShotClips field, paladin/warrior/rogue generated clips, player
swim bindings, multipart instructor rig, and widespread existing CRLF
control-byte findings. None of the missing/bind failures name deer or
raptor. These broader checkout failures were not changed by this task.
