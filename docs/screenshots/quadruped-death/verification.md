# Upper-paw release during flank collapse

The owner observed the upper paw hanging stiffly above the wolf's corpse.
Both native rigs retained almost the full standing limb spread after the trunk
rolled. The correction releases the upper front and hind legs toward the floor,
with a soft joint bend and wrist relaxation delayed behind the trunk.

Only `Wolf_Death` and `Bear_Death` were replaced from their Blender-baked native
donors. `preservation.json` records equality of every other clip's channel
times/values and of all embedded KTX2 texture bytes against the preceding
shipped assets. Original geometry, joints, weights and source provenance remain.
The standard texture finalizer confirmed both assets already have compressed
textures, and the media manifest was regenerated.

## Visual proof

The real `CharacterVisual` renderer loaded both compressed assets without page
errors (`browser.json`). In each comparison, the left image is before and the
right image is after. The GIFs show the complete updated collapse and hold:

- [Wolf comparison](wolf-comparison.png), [wolf motion](wolf.gif).
- [Bear comparison](bear-comparison.png), [bear motion](bear.gif).

## Validation

`tests/quadruped_death_pose.test.ts` failed on both original assets: upper/lower
front-paw height gaps were 0.756 and 0.864 source units. The updated gaps are
0.028 and 0.171. The test independently checks both upper paws against their
lower counterparts, checks their drop relative to the body, and checks every
joint across the collapse for sudden steps. Existing asset suites check held
death poses and deformed mesh floor contact.

Passed:

```text
node node_modules/vitest/vitest.mjs run tests/quadruped_death_pose.test.ts tests/smart_wolf_asset.test.ts tests/smart_bear_asset.test.ts --maxWorkers=2
npm run check:ts
node_modules/.bin/biome.cmd check tests/quadruped_death_pose.test.ts
node scripts/malware_scan.mjs --gate
```

All 43 targeted tests passed. A separate full-mesh scan over 61 poses per death
clip found lowest vertices at +0.001825 (wolf) and +0.000048 (bear), recorded in
`floor.json`. The production Vite bundle built successfully into a temporary
directory with public copying disabled; asset loading was checked separately
in the browser. A fresh read-only coverage review found no blocking issue.

`GATE_SELECT_BASE=HEAD node scripts/gate_select.mjs` stops at existing i18n
freshness differences between regenerated and staged/committed artifacts.
No files were staged to bypass the check. The complete worktree gate is not green.
