# Animal attack contact revision

The wolf projects its muzzle by leveling the upper neck during jaw closure. Its
head release trails the chest recovery. The goat keeps the head bowed through
contact and lifts it afterward, with a stronger bow on Ram. This presents the
crown and horns rather than the nose, without changing body scale.

Reference sequencing was checked against Bull and Stag `Attack_Headbutt` in the
owner's Quaternius archive. `ungulate-reference.json` records 61 world-space
landmark samples per action, in Blender coordinates (forward -Y, up +Z).
These references guide timing and weight transfer; no donor geometry, weights or
local bone rotations are installed.

Compare the side views at identical phases and actual clip durations:

| Animal | Before | After |
| --- | --- | --- |
| Wolf bite | [Cycle](wolf-before.gif), [sequence](wolf-before-sequence.png) | [Cycle](wolf-after.gif), [sequence](wolf-after-sequence.png) |
| Goat ram | [Cycle](goat-before.gif), [sequence](goat-before-sequence.png) | [Cycle](goat-after.gif), [sequence](goat-after-sequence.png) |

The exported contact tests failed for all six previous attacks and pass with the
new poses. The wolf's muzzle projects about 0.09 to 0.10 source units farther
relative to its upper neck. The goat's nose stays below and behind its crown
through the main contact window. The asset suites retain planted support checks,
joint continuity, constant scale and relaxed death checks. Goat reach now measures
the crown because the intended contact is with the horns.

Passed:

```text
npx vitest run tests/animal_contact_pose.test.ts tests/smart_goat_asset.test.ts tests/smart_wolf_asset.test.ts tests/smart_bear_asset.test.ts tests/animal_motion_flow.test.ts tests/quadruped_death_pose.test.ts tests/model_gait_core.test.ts --maxWorkers=2
```

This run passed all 89 tests. `floor.json` additionally checks all deformed mesh
vertices at 41 phases of each changed attack. The worst penetration is 0.0081
source units, within the existing 0.025 contact tolerance. `preservation.json`
confirms unchanged geometry and textures, plus exact sampled channels for every
untouched clip. The texture finalizer reported no conversion needed, and the
media manifest was regenerated.

Also passed: `npm run check:ts`, scoped Biome checks on both changed tests,
`node scripts/malware_scan.mjs --gate`, and a production Vite bundle into an owned
temporary directory with public copying disabled. Browser captures use the final
compressed assets and `CharacterVisual`; `runtime.json` records both attack
cycles and idle recovery with no page errors. Its locomotion setup is a synthetic
preview; actual goat gait selection remains covered by `model_gait_core.test.ts`
and the previous goat runtime evidence.

The broader `GATE_SELECT_BASE=HEAD node scripts/gate_select.mjs` still stops at
pre-existing i18n freshness differences between generated and staged/committed
artifacts. Nothing was staged to bypass that check.
