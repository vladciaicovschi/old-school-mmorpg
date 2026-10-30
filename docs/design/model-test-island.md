# Model Test Island

The developer-only `/dev lab` command rebuilds the owner's test subjects and
teleports to the separate `dev_model_lab` island. It does not change the tutorial
Proving Shore or production camps. Re-run the command after loading changed code
to replace previously spawned subjects; reload for regenerated terrain/colliders.

## Replacement gallery

The island also has separate animal, enemy and named-NPC replacement rows.
Each row shows one body: the new candidate when available, otherwise the
original awaiting a replacement. Old bodies with ready or installed replacements
are omitted to reduce clutter, including the repeated base troll in palette rows.
`OLD` and `NEW` nameplates identify the remaining body. `READY` means an imported
candidate exists; `DONE` means that replacement is already used in the
game; `MISSING` means there is no confirmed replacement. Missing right-hand
slots have a shoulder-height red flag rather than a duplicate stand-in body.
The status remains readable as text as well as nameplate color.

`src/sim/content/dev_model_comparisons.ts` owns the explicit creature
correspondences and the imported NPC candidates. The gallery builder in
`src/sim/dev_model_comparisons.ts` includes the complete named NPC roster,
merging repeated placements of the same person. The map marks the start of
each category. Named bosses, regional variants, frogs and other burrowers
stay explicitly missing unless their own replacement is confirmed. Rejected
skeleton-rogue and treant candidates are not used as replacements.

The original crab, ogre and Aldric definitions remain archived under dedicated
lazy visual keys. The six replaced modular NPC appearances are saved in
`src/render/characters/dev_model_legacy_npc_looks.ts`. This prevents current
production dispatch from losing the original appearance archives. Archived
definitions do not add default island subjects.
The old generic alpaca still has its own missing row beside the separate ram
comparison, so the goat candidate does not imply that every alpaca is replaced.

Gallery subjects are inert, dynamic NPC mannequins with no copied quests,
vendors, banks, loot or encounter mechanics. The existing combat pads remain
available for attacks. `/dev lab` rebuilds the requesting developer's gallery
and combat subjects without removing another developer's displays or drawing
random numbers. The flat pad extends around the gallery; ordinary world
spawns and model rollout rules are unchanged.

### Gallery cleanup (2026-10-24)

The default display drops 44 old comparison mannequins and the superseded Wolf
V1 combat subject. The gallery now has 202 bodies: 44 available replacements
and 158 originals awaiting replacements. Including the five NPC review subjects
and 27 combat subjects, `/dev lab` creates 234 owner-scoped subjects instead of 279.
No model files or production dispatch rules were removed.

Verification:

```sh
node node_modules/vitest/vitest.mjs run tests/dev_model_comparisons.test.ts tests/dev_model_lab.test.ts tests/dev_model_lab_terrain.test.ts tests/dev_commands.test.ts tests/troll_palettes.test.ts tests/smart_wolf_asset.test.ts tests/npc_looks.test.ts tests/localization_fixes.test.ts tests/island_isolation_core.test.ts tests/terrain_region_index.test.ts tests/world_grid.test.ts --maxWorkers=1
npm run check:ts
npm run i18n:gen
npm run wiki:content
npm run security:gate
npm run build:bundle
node node_modules/vitest/vitest.mjs run tests/architecture.test.ts --maxWorkers=1
npm run gate
```

The focused run has 177 passes and three existing skips. All gallery, lab,
palette, old-wolf archive, and actual `/dev lab` rebuild/ownership/RNG tests pass.
Two other `dev_commands` tests (short-handed battleground start and caller-only
farm growth) fail in Wickharbor placement with `hearth-lodge: cannot fit grounded
entrance stair`. They do not exercise this gallery change and were not modified.
TypeScript, scoped Biome, localization/wiki generation, security and the client
build pass. The architecture run has 111 passes and the existing CRLF U+000D
source-scan failure. The full gate still stops at unstaged generated-i18n freshness;
nothing was staged to bypass it.

A fresh read-only sim/test review found no correctness or coverage gaps.
The offline browser probe checks the actual 234 spawned subjects, zero old bodies
with replacements, zero default Wolf V1 subjects and one Wolf V2. Current visual
evidence and the exact runtime counts are in
`docs/screenshots/model-gallery-cleanup/`; the earlier paired display is retained
in `docs/screenshots/model-comparisons/`. These are headless SwiftShader smoke
captures, not a hardware performance benchmark.

### Elemental replacement links (2026-10-24)

The shared old elemental and the old water elemental now have explicit ready
candidates for stone, fire, ice, water and storm. The existing `elemental` row
keeps its identity and now names the stone candidate. Old elemental bodies and
their missing flags are omitted. The five inert comparison bodies sit beside
their matching combat pads, using `labMobId` anchors in the comparison content.
This leaves the main gallery within its existing floor capacity and keeps each
candidate near its attackable version. World mob, pet and boss routes are unchanged.

The gallery has 205 bodies: 49 available replacements and 156 originals still
awaiting replacements. `/dev lab` creates 237 owner-scoped subjects, including
the unchanged five NPC review subjects and 27 combat subjects. Reload changed
code and run `/dev lab` again to replace an already-spawned gallery.

Regression cases pin each element's visual, matching combat pad, ready status,
spacing from other bodies, absence of the old body and absence of a missing flag.
The command test checks exactly one new body per element in the actual rebuilt lab.

Verification: 72 tests pass (three existing skips) across `dev_model_comparisons`,
`dev_model_lab`, `dev_model_lab_terrain` and `localization_fixes`; the three
`dev_commands` tests selected with `--testNamePattern 'lab'` also pass. Scoped
Biome reports only the three existing command-test warnings. TypeScript,
localization/wiki generation, security and the client build pass. The full
`npm run gate` still stops at the checkout's unstaged generated-i18n freshness
differences. A fresh read-only sim/test review confirmed placement and readiness
semantics; its spacing-coverage finding was fixed and re-reviewed. Logs are in
`tmp/lab-elemental-links/`.

The offline browser smoke also passes: all five live elemental gallery entries
resolve to their new visuals with `ready` status, zero old elemental gallery
bodies remain, and rebuilding preserves the total of 237 subjects. The two
inspected captures show rendered models with readable replacement nameplates.
Evidence is in `docs/screenshots/elemental-gallery-links/`. This is a headless
SwiftShader smoke check, not a hardware performance measurement.

### Replacement-gallery verification

`tests/dev_model_comparisons.test.ts` covers the live enemy visual roster,
the canonical named NPC roster, one current body per row, archived
idle clips, installed production routes, explicit missing slots, localized
entity names and dry, level, collider-clear approaches. `dev_commands` also
checks rebuild determinism, zero RNG draws and developer ownership isolation.

Local checks:

```sh
npx vitest run tests/dev_model_comparisons.test.ts tests/dev_model_lab.test.ts tests/dev_model_lab_terrain.test.ts tests/dev_commands.test.ts tests/npc_looks.test.ts tests/localization_fixes.test.ts tests/island_isolation_core.test.ts tests/terrain_region_index.test.ts tests/world_grid.test.ts --maxWorkers=1
npm run i18n:gen
npm run wiki:content
npm run check:ts
npm run security:gate
npm run build:bundle
node scripts/gate_select.mjs
npm run gate
```

The focused suites, typecheck, localization generation, security scan and
client build pass. Both full and selective gates stop at i18n freshness
because generated localization changes are unstaged; no files were staged
to bypass the check. A broader test run also exposes existing Windows CRLF
source-scan failures, guide still/zone assertions and player clip-map/skin
expectations from the ongoing model work. These checks are not reported as
green. A two-worker test run contending with the client build also hit the
existing combat test's timeout; the final single-worker run passes.

Browser smoke images live in `docs/screenshots/model-comparisons/`. They use
headless SwiftShader at desktop and narrow desktop viewports and establish model/label visibility only, not hardware
performance or frame pacing. Fresh read-only frontend/render and sim/test
reviews found no blocking defects in the comparison changes.

## Test floor

`src/sim/dev_model_lab_terrain.ts` supplies a seed-independent level floor six
yards above the water plane. A rounded pad fills the copied small bays around
the combat grid; the perimeter blends into the existing beaches and sea.
`world.ts` applies this grading only inside the lab, after normal terrain
shaping and before custom editor stamps. Renderer and simulation sample the
same finished heightfield.

Wild tree/rock scatter is excluded from the test floor and its immediate
skirt. The copied fence pens are omitted, and the crate bank is moved out of
combat lanes. Other camp dressing remains. The NPC gallery is separate from
the combat grid.

## Test subjects

`DEV_MODEL_LAB_MOB_LINEUP` contains one instance of each active imported test template,
spaced 24 yards apart. Templates opt into `idleStationary` and
`aggroOnDamageOnly`. Damage and explicit taunts still initiate normal combat,
movement, threat and retaliation. Proximity to a player or a nonattacking pet
does not. These templates neither receive nor propagate social pulls or
fleeing-ally rallies. Ordinary mob templates retain all previous rules,
including the four-yard minimum proximity radius.

Wolf V1 is omitted from the default combat lineup because Wolf V2 supersedes
it. Its template and assets remain available for explicit developer spawns.
After loading these changes, run `/dev lab` again to remove the owner's old
gallery subjects and recreate the smaller lineup. Other developers' subjects
remain isolated.

There is no new persistent state, wire field, simulation tick or RNG draw.
The flag is template data, not a global no-aggro cheat or an invulnerability
toggle. Directly attacked subjects still deal their normal damage.

### Accepted creature variants (2026-10-14)

Skeleton Rogue V3 and Treant V2 replace
the rejected Meshy Smart Rig Skeleton Rogue and Meshy Smart Rig Treant. The
old assets and visual definitions remain archived/lazy-loaded for recovery,
but have no lab spawn templates or lineup entries.

Skeleton Acolyte now occupies the vacated smart-rig treant pad. Cultist,
Acolyte, Caster V3 and Necromancer V2 use target-specific calm idle and joined
two-handed spell gestures. The templates retain direct-action-only aggro and
their existing combat rules. See [Caster mob motion](caster-mob-motion.md).

Bone Golem height is 3.5 (previously 2.8) and Treant V2 height is 4.0
(previously 3.2), both a 25% visual increase. Combat stats are unchanged.

The native ogre's main animation archive has no idle, but the separate supplied
`ogre_animated_meshy_idle.zip` contains `Animation_Idle_11_withSkin.fbx` with
identical native bind matrices. The lab now uses that full native idle, with
its last quarter-second eased into its initial pose for seamless looping.
The previous synthetic breathing loop held walking frame 15 and froze a stride:
motionless legs did not mean planted soles. Axe Pack idle was also evaluated,
but its whole-body retarget produces a strongly staggered combat stance, so it
is not used. The exporter is
`scripts/assets/export_meshy_native_ogre.py`. Rebuild just the ogre with
`node scripts/assets/build_assets.mjs scripts/assets/specs/meshy_test_minions.json --shard 10/12`,
then run the mandatory texture compressor on
`public/models/chars/npcs/dev_meshy_ogre.glb` and regenerate the media manifest.
The shard addresses the ogre in the current 12-item spec; re-check its index
before using this command after adding or reordering spec entries.
`tests/ogre_idle_asset.test.ts` checks native idle provenance, actual motion,
foot/toe world heights against native rest support, level toes, bounded foot
motion, no held walking stride, no root drift, loop endpoints and duration,
not merely an Idle clip name.

Reload the game and re-enter with `/dev lab` to replace the previous lineup.
Browser acceptance remains with the user: check the larger silhouettes and
the ogre's breathing, especially the weapon hand and transitions into combat.

## Verification

Focused suites: `dev_model_lab`, `dev_model_lab_terrain`, `dev_commands`,
`mob_damage_only_aggro`, `social_aggro`, `mob_targeting`, `dev_noaggro`,
`terrain_region_index` and `world_grid`. They cover unique subjects and
rebuilds, level dry combat pads, collider-clear melee approaches, ordinary
behavior/RNG controls, direct retaliation and isolated pulls.

Browser acceptance is reserved for the user: check the shoreline transition,
all imported body scales, attacking one target near other subjects, and moving
through the island with a following pet.

Local verification (2026-10-14): focused island/command/aggro and asset suites
pass, including the native Idle_11 support, provenance and loop checks. TypeScript and the security
gate pass. All seven non-idle ogre clips were compared numerically with the
previous asset and are unchanged. The ogre was finalized with KTX2 textures
and the media manifest regenerated. Browser tests were not run.

Current verification commands:

```sh
npx vitest run tests/dev_model_lab.test.ts tests/dev_model_lab_terrain.test.ts tests/dev_commands.test.ts tests/mob_damage_only_aggro.test.ts tests/ogre_idle_asset.test.ts --maxWorkers=2
npx vitest run tests/ogre_idle_asset.test.ts tests/meshy_npc_assets.test.ts tests/rusted_mob_weapons.test.ts tests/starting_point_npc_assets.test.ts tests/proving_shore_monster_visuals.test.ts tests/zone_prewarm_groups.test.ts --maxWorkers=2
npm run check:ts
npm run security:gate
npm run build:bundle
node scripts/gate_select.mjs
```

Focused asset tests, typecheck, security gate and client build pass. The selective gate stops at
the checkout's pre-existing unstaged i18n freshness differences; no files
were staged to bypass it. The read-only frontend review found no blockers.

Deer and raptor occupy the next two separated pads at (764, 72) and
(740, 72). They are native animated developer subjects with direct-pull
aggro, no loot, and equipment-fit studio entries. See
[their motion notes](smart-rig-deer-raptor.md).

The flying native imp occupies (716, 72), with wing-driven hover and flight,
tucked hind legs and a grounded death. It follows the same isolated
developer-subject policy. See [its motion notes](smart-rig-imp.md).
