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
