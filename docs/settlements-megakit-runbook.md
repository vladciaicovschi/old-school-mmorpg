# Approved village assemblies in the game

Date: 2026-10-22. This continues the Wickharbor integration in the existing
`feature/wickharbor-megakit` worktree. No release refs are available locally;
the existing integration base and unrelated owner changes are preserved.
No commit, push or deployment is part of this local transfer.

## Imported locations

The approved Eastbrook, Icemantle, Gullhaven and Gibbetmere proposals replace
their local settlement architecture. Wickharbor retains its existing playable
architecture and gains the latest chapel churchyard. Source archives remain
under `bible/models/ambient`; prototypes remain under
`artifacts/eastbrook-megakit-study`.

Regional materials, native stairs, wood shelters and varied wood supplies,
timber palisades, the hammer paladin and the churchyard marker arrangements
come from those approved proposals. The monument keeps its honouree contract.
Existing NPC, quest, profession and service identities remain unchanged.
Mailbox and noticeboard interaction entities move with their approved facades.

## Ownership and repeatable import

`scripts/assets/settlements/import_study.mjs` imports source geometry and
provenance into `src/sim/settlements_data.json` and its asset spec. Identical
existing Wickharbor assets are reused by source hash. New derivatives are
built with the existing static GLB pipeline and compressed to KTX2/Basis.
Do not run the texture converter over unrelated owner assets.

```powershell
node scripts/assets/settlements/import_study.mjs D:/THE_GAME/artifacts/eastbrook-megakit-study
node scripts/assets/build_assets.mjs scripts/assets/specs/settlements.json
$env:KTX_BIN='D:/THE_GAME/artifacts/wickharbor-integration/ktx/bin'
node scripts/assets/compress_glb_textures.mjs --jobs 2 --dir public/models/settlements
node scripts/assets/settlements/share_textures.mjs
node scripts/build_media_manifest.mjs generate
```

Shared pure settlement plans recompute foundations, entrance treads and prop
contacts from actual game terrain. The renderer and movement colliders consume
these same readouts. Prototype snapshot heights are not authoritative in game.
Remote camps, ships and outlying content stay outside the replacement scope.

The sharing step gives identical KTX2 atlases one content-addressed URL. Native
geometry GLBs retain material factors and texture bindings, and the existing
standalone texture cache loads each shared atlas once. This avoids repeating
the same kit textures in every imported house. Existing reused game assets
are preserved. `texture-sharing.json` records the offline byte census.

## Manual checks

The active checkout is `D:/THE_GAME/character-model-slice`. Start it with
`npm run dev -- --host 127.0.0.1 --port 5173`, open
http://127.0.0.1:5173/, choose Offline and use the developer chat commands:

| Settlement | Command | First checks |
| --- | --- | --- |
| Eastbrook | `/dev tp -21 -101` | Square, paladin, services, tavern, chapel and churchyard |
| Icemantle | `/dev tp -30 1562` | Entrances, rear shelters, wood supplies and service orientation |
| Gullhaven | `/dev tp 305 71` | Gate passage, inward palisade rails, tower and headquarters services |
| Gibbetmere | `/dev tp 360 1432` | Timber houses, stone bases, well crank and roadside lamps |
| Wickharbor | `/dev tp 423 361` | Existing town and new markers by the chapel |

Check entrances and stairs in both directions, camera occlusion around walls,
NPC and service interactions, courtyard props, boardwalk edges and ground
contacts. The vertical watchtower ladder is a visible native element; the game
does not currently provide a dedicated ladder-climbing interaction.

The user performs browser and visual acceptance. No automated browser test or
FPS measurement is claimed by this transfer. Deterministic checks and remaining
gate limitations are recorded in the integration handoff.

## Local transfer and verification

The integration base is `4b84a726c167ad33f17c66ee0236b51af650d064`.
Only owned migration files and derivatives were copied from the integration
worktree into the active checkout. Existing active files were backed up under
`artifacts/settlements-integration/active-before-transfer`; source hashes were
checked against the initial snapshot before copying. The active media manifest
was regenerated against all active assets, preserving unrelated owner assets.

Both client production builds and the active native TypeScript check passed.
The headless environment bundle passed. The release malware scanner reported
zero high findings. HTTP checks returned 200 for the local game, runtime module,
a new GLB and its shared KTX2 atlas. No browser or visual inspection was run.

`node scripts/gate_select.mjs` stopped at i18n freshness because the inherited
uncommitted localization artifacts differ from the index. No files were staged.
The initial broader run also identified inherited CRLF architecture failures,
three existing monolith ceilings and character visual-manifest expectations;
these were reproduced in the untouched active checkout. The collider coordinator
was reduced from 2529 to 2525 lines with the town assembly extraction.
`node scripts/ci_changed.mjs` selected zero files in this local worktree, so an
explicit Biome check was used for the owned files instead. Numerical terrain
fixtures are generated with the active world, not copied over owner changes.

Detailed command output is under `artifacts/settlements-integration`.
This is ready for local manual acceptance; it is not a claim that the full
release gate or browser performance acceptance has passed.

## Recorded commands and outcomes

Local acceptance verdict: READY WITH NOTES (manual visual acceptance pending).

| Command | Outcome |
| --- | --- |
| `npm run build:bundle` | PASS in integration and active checkouts |
| `node node_modules/@typescript/native/bin/tsc --noEmit --incremental false` | PASS in active checkout |
| `npm run build:env` | PASS in integration checkout |
| `node scripts/malware_scan.mjs --gate` | PASS, zero high findings |
| `node scripts/gate_select.mjs` | Stops at inherited i18n freshness diff |
| `node scripts/ci_changed.mjs` | Selected zero files; explicit scoped Biome used instead |

Active focused verification (6 suites, 23 tests, all passed):

```powershell
node node_modules/vitest/vitest.mjs run tests/settlements.test.ts tests/settlements_assets.test.ts tests/settlements_render.test.ts tests/settlement_textures.test.ts tests/settlement_collision_integration.test.ts tests/terrain_height_parity.test.ts --maxWorkers=1 --testTimeout=60000
```

Gameplay migration verification (2 suites, 37 tests, all passed):

```powershell
node node_modules/vitest/vitest.mjs run tests/eastbrook_gameplay_integration.test.ts tests/eastbrook_grand_armoury.test.ts --maxWorkers=1
```

Also passed: `tests/noticeboard_interaction.test.ts` (36 tests),
`tests/noticeboard_placements.test.ts` (17 tests) and the updated legacy
`tests/eastbrook_town_renderer.test.ts` (22 tests). The gameplay proof retains
full player body clearance, both directions of town routes, the actual summoned
pet, service interactions, starter camp routes and two 2500-tick deterministic
simulations. Redundant same-world reloads were removed from the test harness;
regional camp path searches now cover their actual bounding rectangle.

The active terrain parity fixture was regenerated using
`UPDATE_TERRAIN_HEIGHT_PARITY=1`. Its numerical assertions passed on the final
run. A concurrent generation attempt hit the old 30-second test timeout;
final verification used a 60-second execution budget without changing the
corpus or the two-ULP accuracy threshold.


## Player-scale and texture repair (2026-10-23)

This section records the first repair pass. Its door sizes, minimum lot gaps and
seed-1 stair count are superseded by the second scale pass below.

The active runtime normalizes player bodies to 2.6 world units. Against the
approved 1.80 m character this gives 1.44444 world units per metre. Measuring
source doors instead of assuming one source unit equals one runtime metre gives:

| Door family | Assembly scale | Door height relative to the player |
| --- | --- | --- |
| Flat doors, including Wickharbor chapel and lighthouse | 1.35 | approximately 1.96 m |
| Icemantle arched doors and Eastbrook chapel | 1.22 | approximately 1.96 m |
| Warehouse leaves | 1.50 | approximately 1.96 m |

`architecture_scale.ts` converts geometry, furniture, foundations, contact points,
interior stairs and collision together. Source geometry and provenance remain
unchanged. Native placement samples the actual enlarged footprint on game terrain;
absolute heights are converted back into world units with the same transform.
Ordinary gates and palisades already have their independent fortification sizes.

Buildings grow back from their doorway so most existing public approaches remain
in place. Measured lot corrections open the tight Eastbrook and Wickharbor gaps.
The 56 house lots retain at least 2.2 world units (about 1.52 m) between roof
footprints, including rear wings. Procedural trees and rocks use a shared exclusion
for visual and collision generation; authored trees use their actual crown bounds.
Grass also excludes enlarged wings. Door approaches reserve room for native stairs.

Prototype flat road/plaza overlays have been removed. Roads use the game's terrain
material; native docks and small garden soil beds remain physical scenery.

The dark-material defect was lost `TEXCOORD_0`, not a regional palette decision.
The sharing pipeline pruned attributes while texture bindings were temporarily
external. The fix preserves vertex attributes during pruning and optimization.
All 49 new derivatives were rebuilt from their verified source files, compressed
to KTX2 and texture-shared again. All 360 textured primitives retain varying UVs;
49 source fingerprints and 267 material-factor records match the originals.
There is no runtime material-brightening workaround.

Legacy local grave clusters are retired in the five remodeled settlements.
Eastbrook and Wickharbor retain their approved irregular churchyards; Gullhaven,
Gibbetmere and Icemantle use small mixed groups of the new native markers.
Gameplay release/healer definitions are retained, as are remote grave fields.
Original source packs and unused legacy assets are retained for other locations.

Verification details and command logs for this repair are under
`D:/THE_GAME/artifacts/settlement-scale-fix`. Browser/manual visual acceptance
remains with the user; this repair does not start the game server.


### Decoration and material follow-through

Decor was reviewed against the enlarged houses rather than enlarged independently.
The smithy crate now sits beside its entrance; benches and apple crates leave a
visible gap beside stairs. Eastbrook's 24 rear fence pieces follow their host
houses, including moved lots; one complete fence line was pulled clear of its
neighbor. Six Icemantle wood-storage groups move together so their roofs join the
rear walls and the varied wood piles stay under cover. Gullhaven's well is clear
of the entrance. Wickharbor's shared bench was moved out of the enlarged house,
and the front garden follows the current facade rather than its old coordinates.
Canonical crafting stations and masters were moved away from entrance approaches.

Rest areas now use the correct rotated footprint for migrated settlement inns.
For alternate seed 1 the sanctuary needs 25 native treads instead of 24. The
shared limit is now 25; the maximum riser stays 0.18 native units, with actual
mesh/surface agreement and a complete character walk up and down verified.

A separate normal-map restoration error also discarded GLTFLoader's negative Y
scale for meshes using derivative tangents. Restoration now keeps the loader's
sign while applying the authored strength. The regression failed before the fix
and passes for both tangent conventions without mutating loader materials.

### Final repair verification

Local manual-test handoff: READY WITH NOTES. This is not a release-gate approval.
The active checkout remains `D:/THE_GAME/character-model-slice`, based on
`4b84a726c167ad33f17c66ee0236b51af650d064`. Existing unrelated work was preserved;
no staging, commit, push, server start or browser automation was performed.

| Evidence | Result |
| --- | --- |
| `final-focused.log` | 15 suites, 70 tests passed: geometry, scaling, decor, texture assets, collision and terrain parity |
| `final-gameplay.log` | 10 suites, 135 tests passed: NPC/services, rest, paths, boards, seed-1 reload, and 2500-tick replay |
| `routes-after-fences.log` | Both entrance-clearance and bidirectional-route checks passed after the last fence adjustment |
| `normal-sign-after.log` | 2 suites, 11 tests passed after the final normal-map fix |
| `typecheck.log` | Native TypeScript check passed |
| `build-final.log` | Client production bundle passed; 2033 hashed media assets emitted |
| `headless-final.log` | Headless environment bundle passed |
| `biome-final.log` | Explicit check of 40 owned source/test files passed with warnings only |
| `security-final.log` | Malware gate passed, 9142 files, zero high findings |

The terrain parity fixture was regenerated from the active enlarged world and
then verified again without update mode. Read-only sim and render reviews are
complete; the normal-map finding from render review was fixed and verified.

`node scripts/gate_select.mjs` was run with the explicit local HEAD base and
process-local safe-directory configuration. It stopped at inherited i18n
freshness differences against staged/committed localization files. Those files
were not staged. `ci_changed.mjs` selected zero files, so the explicit Biome
check above is the lint evidence. The broader architecture/monolith checks have
130 passing tests and four inherited failures: repository CRLF content and the
HUD, renderer and world line ceilings. The world helper extraction reduced its
file from the baseline 5234 lines to 5225; the existing ceiling is 5216.

Exact focused command:

```powershell
node node_modules/vitest/vitest.mjs run tests/architecture_entrances.test.ts tests/architecture_clearance.test.ts tests/settlement_dressing_placements.test.ts tests/settlement_churchyards.test.ts tests/wickharbor_yard_clearance.test.ts tests/settlements.test.ts tests/settlements_assets.test.ts tests/settlements_render.test.ts tests/settlement_textures.test.ts tests/glb_texture_compression.test.ts tests/settlement_collision_integration.test.ts tests/wickharbor.test.ts tests/wickharbor_render.test.ts tests/foliage_core.test.ts tests/terrain_height_parity.test.ts --maxWorkers=1 --testTimeout=60000
```

Other exact commands:

```powershell
node node_modules/@typescript/native/bin/tsc --noEmit --incremental false
npm run build:bundle
npm run build:env
node scripts/malware_scan.mjs --gate
node scripts/gate_select.mjs
```

## Second scale and spacing pass (2026-10-23)

The active target door height is now **2.25 m**, giving 45 cm above a 1.80 m
character. Runtime players remain 2.6 world units tall; doors measure 3.25 world
units. Compared with the first repair, whole buildings grow approximately 15%,
including interiors, furniture, foundations, stairs and their collision geometry.
Source meshes and materials are unchanged.

| Door family | Active assembly scale |
| --- | --- |
| Flat doors, including Wickharbor chapel and lighthouse | approximately 1.5473 |
| Icemantle arches and Eastbrook chapel | approximately 1.3992 |
| Warehouse leaves | approximately 1.7263 |

`architecture_scale.ts` derives these factors from measured source door heights.
`architecture_placements.ts` contains explicit lot corrections. Across 56 lots,
roof and rear-wing footprints retain at least 3.5 world units (2.42 m) between
buildings; Gullhaven retains at least 4.5 world units (3.12 m). Its watchtower,
gate and palisade stay in place. A separate review found no intersection of the
enlarged roofs with the tower, gate or 65 palisade panels.

The final Gullhaven residential adjustment also clears the family home's long
entrance stair from the fisher home's corner. Real pathfinding and character
movement now complete the square-to-house routes in both directions with radii
0.5 and 0.7. All 56 entrance feet are checked against actual collision bodies.
The alternate-seed sanctuary now uses 23 native treads; the supported cap remains
25 and the maximum native riser remains 0.18. Mesh/surface agreement and the
complete stair ascent and descent remain covered.

Hosted decor follows each building's affine transform. Eastbrook's lane-home
rear fence and provisions stall were moved clear of their neighboring buildings.
Gullhaven's well, Coalfast, Nell and Tam were moved away from expanded stairs and
walls. The canonical NPC definitions read the same settlement service positions;
Eastbrook's Aldric and Brandt also stand clear of the enlarged chapel and cottage.
NPC identities, dialogue and quests are preserved.

Evidence is under `D:/THE_GAME/artifacts/settlement-scale-round2`:

| Evidence | Result |
| --- | --- |
| `final-focused.log` | 69 checks passed; the remaining Tam placement failure was corrected and rerun below |
| `final-passages.log` | 2 suites, 7 tests passed, including canonical NPC standing spots and both passage radii |
| `decor-after.log` | All 4 decor placement checks passed |
| `build.log` | Client production bundle passed; 2038 hashed media assets emitted |
| `headless.log` | Headless environment bundle passed |
| `typecheck-final.log` | Native TypeScript check passed |
| `terrain-verify.log` | Full authored-world parity passed again without fixture update mode |
| `biome-final.log` | Explicit check of 12 changed source/test files passed with warnings only |
| `security-final.log` | Malware gate passed, 9168 files, zero high findings |

The earlier terrain fixture regeneration encountered a transient file-open error.
The retry regenerated the full authored-world fixture successfully with the
original two-ULP threshold. Browser and manual visual acceptance remain pending;
the game server was not started. No staging, commit or push was performed.

The selective gate again stops at inherited i18n freshness differences. Those
unrelated localization files were not staged; this handoff is not a release-gate
approval.

Final passage/NPC command:

```powershell
node node_modules/vitest/vitest.mjs run tests/gullhaven_spacing.test.ts tests/settlement_npc_standing.test.ts --maxWorkers=1 --testTimeout=60000
```
