# Animal motion flow, 2026-10-18

The owner requested less mechanical bear movement and broader wolf animation,
and supplied the Quaternius animal FBX archive as a motion reference.
`docs/design/animal-motion-reference.md` documents its reusable catalog and the
native authoring approach.

## Visible result

The real `CharacterVisual` renderer captured the preceding and updated assets
with identical cameras. Each GIF plays at its actual authored clip duration:

- Bear walk: [before](bear-walk-before.gif), [after](bear-walk-after.gif).
- Bear swipe: [before](bear-swipe-before.gif), [after](bear-swipe-after.gif).
- Bear double strike: [after](bear-double-after.gif).
- Wolf walk: [before](wolf-walk-before.gif), [after](wolf-walk-after.gif).
- Wolf bite: [before](wolf-bite-before.gif), [after](wolf-bite-after.gif).
- Wolf [gallop](wolf-run-after.gif), [lunge](wolf-lunge-after.gif) and
  [howl](wolf-howl-after.gif).

Comparison PNGs show the same normalized phase. `runtime.json` records actual
walk/run selection, the full five-attack cycle and return to idle for both
animals, with no browser page errors. The wolf's bites now last about 1.12 seconds
and its lunge 1.30 seconds. The accepted bear strike duration is retained.

`preservation.json` records exact equality of original geometry attribute/index
arrays, KTX2 texture bytes, and every unmodified clip's channel values and times.
Both previously accepted relaxed death clips are among the preserved animations.

## Checks

The new flow tests first failed on the preceding assets: bear wrist speeds
collapsed to about 0.20 to 0.27 source units/second at follow-through joins,
and the wolf scapulae barely moved. The revised assets pass sustained speed,
direction continuity and visible shoulder-stride assertions. A hock-margin test
also prevents the hind leg from folding onto its IK singularity during gallop.

Passed, 50 tests:

```text
node node_modules/vitest/vitest.mjs run tests/animal_motion_flow.test.ts tests/smart_bear_asset.test.ts tests/smart_wolf_asset.test.ts tests/quadruped_death_pose.test.ts --maxWorkers=2
```

Also passed:

```text
npm run check:ts
node_modules/.bin/biome.cmd check tests/animal_motion_flow.test.ts tests/smart_wolf_asset.test.ts src/render/characters/manifest.ts
node scripts/malware_scan.mjs --gate
node tmp/animal-fluidity/capture.mjs
```

Biome reports one existing non-null-assertion warning outside the modified
manifest entry. The production Vite bundle built successfully in a temporary
directory with public copying disabled; the browser independently loaded the
final compressed GLBs. The texture finalizer confirmed both assets already use
KTX2, and the media manifest was regenerated.

A fresh read-only review confirmed support cadence across all four paws,
continuous loop boundaries, the retained flat bear wrists, wider wolf gait and
preservation evidence. The separate dense mesh-floor results are in `floor.json`.
The scan samples every vertex at 41 phases of each revised clip; all stayed
within the established -0.025 source-unit contact tolerance. The catalog
generator was rerun successfully and its JSON passes Biome. `npm run ci:changed`
exits successfully but checks zero committed-diff files in this uncommitted
worktree; the scoped Biome command above is the meaningful formatting result.

The broader regression command covering these suites plus developer lab,
commands, animation state, T-pose repair, clip maps and architecture reported
286 passed and seven inherited failures. The failures are the existing clip-map
coverage/other-rig problems and raw source control bytes. The focused animation
suites above are green.

`GATE_SELECT_BASE=HEAD node scripts/gate_select.mjs` stops at existing i18n
freshness differences between regenerated and staged/committed artifacts. Nothing
was staged to bypass the gate. The complete worktree gate is not green.
