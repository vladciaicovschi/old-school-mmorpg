# Wolf animation verification — 2026-10-16

The files in this directory were captured using the shipped GLB in the actual
`CharacterVisual` renderer. `before-native.png` shows the unanimated owner
source at the same height and camera. `overview.png` compares authored poses;
walk, trot, run, bite, lunge and howl GIFs show complete cycles.

`runtime.json` records actual runtime playback: idle, walk, run, two complete
five-attack rotations, recovery and held death. All expected clips were selected
and the browser emitted no page errors.

## Checks

- Blender bake, asset optimization and KTX2 compression: passed.
- `node scripts/build_media_manifest.mjs generate`: passed.
- `npm run i18n:gen`: passed.
- `node scripts/wiki/build_content.mjs`: passed.
- `node node_modules/vite/bin/vite.js build --outDir <temporary output>`:
  passed (5,538 transformed modules).
- `node scripts/malware_scan.mjs --gate`: passed (9,044 files, zero high findings
  after accepted priors).
- `node tmp/wolf-motion/capture.mjs`: passed; runtime assertions and screenshots
  are retained here.
- The focused wolf asset suite passed all 20 tests. It samples complete
  deformed meshes as well as animation channels and joints.
- `npm run check:ts`: passed.
- Scoped `biome check`: passed for the new test/spec and changed lab/studio files.
- Final focused run: 11 test files passed, 222 tests passed, three skipped:

```text
node node_modules/vitest/vitest.mjs run tests/smart_wolf_asset.test.ts tests/smart_bear_asset.test.ts tests/dev_model_lab.test.ts tests/dev_commands.test.ts tests/mob_weapon_fit_studio.test.ts tests/weapon_fit_loadouts_core.test.ts tests/equipment_carry_preview.test.ts tests/equipment_fit_payload.test.ts tests/character_anim_state.test.ts tests/character_tpose_repair.test.ts tests/localization_fixes.test.ts --maxWorkers=2
```

A separate read-only scan sampled 121 joint poses and 41 full-mesh floor poses
per clip. Worst adjacent joint step was 0.04555 source units during run;
lowest deformed point was -0.00725 during run. The small reach clamp is localized
to early airborne hind-leg recovery; no bite, lunge or howl required a clamp.

The wider existing-worktree check reported 475 passed, eight failed and three
skipped tests. Failures concerned existing control bytes, a fixture setup
timeout, and guide content/stills/UI expectations. The fixture timeout passed
in the focused rerun above.

`node scripts/gate_select.mjs` stops at i18n freshness because regenerated
artifacts differ from staged/committed copies in this worktree. Files were not
staged to bypass the gate. This is not a clean full-gate result.
