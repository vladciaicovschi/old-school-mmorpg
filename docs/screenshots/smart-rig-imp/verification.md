# Smart Rig imp verification, 2026-10-19

The shipping GLB is 7,606,296 bytes, with 56 native joints, 310,992 indices,
13 animation clips, Meshopt geometry and three 2048px KTX2 maps. Original
source geometry, UVs, skin weights and PBR materials are retained. The
source SHA-256 remains
`74db4af0ccabaa67cc98b2d0e5b718948f1d4d883ccd080b1ee3171aa16e996f`.

## Passing checks

```text
node node_modules/vitest/vitest.mjs run tests/smart_imp_asset.test.ts tests/dev_model_lab.test.ts tests/dev_model_lab_terrain.test.ts tests/dev_commands.test.ts tests/model_gait_core.test.ts tests/character_attack_selection.test.ts tests/equipment_fit_payload.test.ts tests/deer_raptor_assets.test.ts --maxWorkers=2
```

121 tests passed across all 8 suites. Asset checks cover every nonempty
clip, finite unit rotations, constant scale, loop seams, actual membrane
travel, wing/limb continuity, tucked feet, broad hand arcs, rigid face and
horn skin, flight clearance, hover-compensated landing and held death pose.
Island checks include dry, level ground, collider clearance and 24-yard
subject separation. Deer/raptor regression checks still pass.

- `npm exec -- tsc --noEmit`: exit 0.
- Scoped Biome over the imp spec, tests and integration files: passed with
  the existing `manifest.ts:1373` non-null assertion warning.
- `python -m py_compile scripts/anim/blender_bake_smart_imp.py`: passed.
- `npm run i18n:gen`: passed.
- `node scripts/malware_scan.mjs --gate`: passed, 9076 files, 0 high findings.
- Vite build into the task-owned temporary `woc-imp-build-20261019`
  directory, with `copyPublicDir:false`: passed.
- `node scripts/build_media_manifest.mjs generate`: 1878 media assets.

`runtime.json` uses real CharacterVisual and updateLocomotion with the
shipping compressed asset. At speeds 0.8 and 4.8 it selects Imp_Fly and
Imp_FlyFast even though globalRunning=false. Attacks choose both claw
sides and Dive randomly, including repeats, then recover to Imp_Hover.
Imp_Death clamps and remains at 1.8 s. There are no browser page errors.

The screenshots show upstroke/downstroke, tucked legs, both claw attacks,
dive and grounded death. GIFs use 25 fps and the actual hover, fast-flight
and attack durations. The folded corpse's upper wing relaxes onto its flank.
`authoring.json` records zero reach clamps in every clip; the smallest
arm fold reserve is 0.1920, during Dive. Read-only anatomical and final
source/test reviews found no actionable issues.

## Checkout gate limitation

`GATE_SELECT_BASE=HEAD node scripts/gate_select.mjs` was run with the
checkout's Git safe.directory setting. It stops at i18n freshness because
generated files differ from staged/committed versions, including existing
checkout changes. No staging was performed to bypass the check.

The imp uses only the developer island and fit studio. It adds no public
camp, quest, loot, reward, deed or bestiary entry. Existing warlock imp and
flying demon visuals retain their models and behavior.

## Two-handed cast addition

`Imp_Cast` is a 1.2-second looping two-handed charge; `Imp_CastRelease`
is a 1.2-second coordinated forward release and recovery. Both continue
flapping, keep the feet tucked, and preserve the rigid skull. Native arm
reach clamps remain zero. They use the ordinary cast and hostile release
slots without changes to the animation driver or simulated abilities.

The final command below passes all 54 tests across 5 suites:

```text
node node_modules/vitest/vitest.mjs run tests/smart_imp_asset.test.ts tests/character_attack_selection.test.ts tests/cast_target_mode.test.ts tests/cast_duration_core.test.ts tests/caster_mob_visual.test.ts --maxWorkers=2
```

TypeScript, scoped Biome, security and the temporary Vite build passed.
The required selective gate was rerun and still stops at i18n freshness.
`cast/runtime.json` verifies the actual CharacterVisual charge loop,
hostile release, recovery and cancellation. Wing tip travel during a
held cast is 0.582 world units; no browser errors occurred.

`cast/unchanged.json` compares the previous 11 shipping clips at 61 phases
each: 112728 channel samples, maximum component difference zero. The cast
GIFs and screenshots were rendered from the final compressed shipping GLB.
