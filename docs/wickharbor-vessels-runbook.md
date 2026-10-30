# Wickharbor vessel integration

Living local import and placement runbook. Last verified 2026-10-27.

## Accepted sources

The external library is `D:/THE_GAME/bible/models/ambient/boats`.

- Sailship: `sailing-modular-v1/output/sailing-modular.glb`, accepted
  `hawse-chain-v20`, backed by `sailing-modular-v1/checkpoints/accepted-v20`.
  Import the complete owner-approved ship, including its hawse, chain and anchor.
  Do not rebuild it from the earlier generated ship candidates.
- Ordinary dinghy: `Meshy_AI_Create_a_wooden_raft_which_is_textured_20260105_texture_fbx.zip`.
  Despite the archive name, this is the owner-confirmed open boat with three
  benches. It is not a fishing boat. Do not substitute construction-kit boats.
  Authoring derivative: `rowboat-v1/prepare_rowboat.py` and
  `rowboat-v1/output/rowboat.raw.glb`.

Keep archives and the accepted ship checkpoint unchanged. Source hashes,
triangle counts, measured draft and rowboat material settings are pinned in
`scripts/assets/wickharbor_vessels/upstream.json`.

## Build and materials

Follow `scripts/assets/wickharbor_vessels/README.md` in order: prepare sources,
static asset build, scoped KTX2 compression, media manifest generation. The
fingerprint includes the importer, source contract, metadata, spec, optimizer
and pnpm lockfile. Regenerate shipping files if any fingerprint input changes.
Do not hand edit the generated media manifest or copy the WebP intermediate
build into the game without KTX2 compression.

The dinghy keeps its original UV, albedo and normal detail. Its base color
factor is `[0.63, 0.66, 0.60, 1]`, roughness is `0.97`, metallic is zero,
metallic-roughness texture is removed, and normal strength is `0.25`.
This removes the original shine and darkens the fresh light wood.

The runtime converter preserves authored normal strength. For the `wickboats`
kit it also preserves source emission, so the ship lantern glass retains its
warm material on both material profiles. No dynamic lights are added.

## Fleet ownership

`src/sim/wickharbor_vessels.ts` owns berths, physical dimensions and draft.
`src/sim/wickharbor_props.ts` replaces old vessels only within Wickharbor.
Other regions, the haulout rack, anchors and harbor buildings remain under
their existing owners. The registry keys are `wickSailingShip` and `wickRowboat`.
Both profiles preload both keys through the existing prop preparation path.

Seven ships and three dinghies are placed at scale `0.9`. The longer ship
hulls require revised berths. Two dinghies float beside the harbor and one
rests near the existing rack. Physical OBBs, water draft, terrain clearance
and dock separation are checked against the built world. Hull collision uses
the existing coarse prop bounds; this is not a boardable ship implementation.

## Evidence and verification

- [Before placement](screenshots/wickharbor-vessels/fleet-before.png) and
  [after placement](screenshots/wickharbor-vessels/fleet-after.png) are top-down
  diagrams generated from world coordinates, terrain and collision bounds.
  They are not in-game screenshots.
- [Original dinghy](screenshots/wickharbor-vessels/rowboat-before.png) and
  [matte dinghy](screenshots/wickharbor-vessels/rowboat-after.png) are offline
  authoring renders, not the final game renderer.

Final scoped Vitest run: 10 files, 60 tests pass. This covers fleet placement,
asset provenance and fingerprints, exact yaw, KTX2 and meshopt, texture sizes,
matte PBR settings, material normal/emission conversion, preload ownership,
cutouts, harbor integration and prop collision behavior.

Commands:

```powershell
node node_modules/vitest/vitest.mjs run tests/wickharbor_vessels.test.ts tests/wickharbor_vessel_assets.test.ts tests/props_material_normal_scale.test.ts tests/props_material_cutout.test.ts tests/render_asset_preload.test.ts tests/decor_prop_colliders.test.ts tests/gale_harbor.test.ts tests/wickharbor.test.ts tests/wickharbor_render.test.ts tests/defer_launcher_preloads.test.ts --maxWorkers=2
npm run check:ts
npm run build:bundle
npm run gate
```

Typecheck and bundle build pass. The full gate was attempted and stops at
existing i18n freshness differences in inherited local work. A broader test
run also found existing architecture CRLF and Eastbrook Grand Armoury source
fingerprint failures; both were reproduced in the original live checkout
before transfer. Do not stage or rewrite unrelated generated files to hide
these failures. A worktree-only Basis byte mismatch was corrected by restoring
unchanged baseline bytes; it was not a live source failure.

Fresh read-only render and coverage review found lost source emission and a
missing exact yaw assertion; both were fixed and the reviewer rechecked them.
An isolated headless browser smoke attempt failed to launch Chrome. Game
appearance, cold arrival, low-tier rigging appearance and hardware frame
pacing remain visual acceptance checks. No browser or performance pass is
claimed. Detailed command logs are under
`D:/THE_GAME/artifacts/wickharbor-vessels`.

## Local delivery and recovery

Implementation was isolated in `D:/THE_GAME/wickharbor-vessels` at
`4b84a726c167ad33f17c66ee0236b51af650d064`, seeded with the live checkout's
existing work. No release ref was available. Only the task-owned paths from
`artifacts/wickharbor-vessels/scoped-files.json` are transferred into
`D:/THE_GAME/character-model-slice`, with baseline SHA-256 guards for existing
files and absence guards for new files. The manifest is regenerated in the
live checkout after transfer. Existing WIP is not replaced wholesale.

The transfer script, pre-transfer backups and delivery hashes are kept in
`D:/THE_GAME/artifacts/wickharbor-vessels`. To recover, inspect those backups
and merge only the vessel-owned changes; never reset the live checkout.
No commit, push or remote publication is part of this local delivery.

## Cosmetic fleet variety, 2026-10-27

The seven existing berths now use four visual styles with unchanged hull
dimensions, rig geometry, water draft, scale and collision bounds:

| Key | Sails | Fore / aft railing | Cargo | Ships |
| --- | --- | --- | --- | --- |
| `wickSailingShip` | Accepted natural linen | Cross / cross | Accepted barrels and crates | 2 |
| `wickSailingShipBlue` | Faded blue | Simple / cross | Two fore crates and a sack, aft barrels | 2 |
| `wickSailingShipOchre` | Ochre linen | Simple / simple | Produce crates, apple barrel and sack, aft chest and sack | 2 |
| `wickSailingShipRusset` | Muted brick red | Cross / simple | Compact fore barrel group, aft crate and barrel | 1 |

The midship deck, hatch, stairs and helm routes remain clear. All eight end
posts and their lantern attachments are retained. Fore cargo is placed opposite
the foredeck stair approach; aft cargo remains at the sides. New panels use
`Balcony_Simple_Straight` from the same village pack. Cargo uses native fantasy
props. The accepted source scene, base shipping GLB and ordinary dinghy are
unchanged. Derivatives live separately under `boats/sailing-variants-v1/`.

Reproduction steps are in the asset importer README's cosmetic variants section.
`variant_sources.json` records accepted Blender source SHA-256, patch hashes,
kit source hashes, geometry counts, deck support and sampled 0.30m body-route
clearance. The importer verifies the accepted Blender and GLB sources and each
patch before combining only cargo/rail groups. Reused pack atlases avoid
duplicate full-resolution maps; new small-cargo maps are capped at 1024px.

Offline exterior and deck renders are under
`docs/screenshots/wickharbor-vessels/variants/`. They are authoring evidence,
not in-game screenshots. Actual cold-arrival frame pacing and game visual
acceptance remain unmeasured. Existing deferred loading and preparation paths
own every new key on both profiles, with no new lights or runtime update loop.

Variant QA and guarded local transfer evidence are stored separately in
`D:/THE_GAME/artifacts/wickharbor-vessel-variants`, preserving the original
vessel-integration baseline. The full gate still encounters inherited i18n
freshness differences; the scoped asset/fleet tests and type/bundle checks
are run independently. No unrelated generated changes are transferred.

Final variant check: 9 scoped Vitest files, 57 tests pass; `npm run check:ts`
and `npm run build:bundle` pass. Scoped Biome check passes. Fresh read-only
frontend, render-performance and coverage review found a missing accepted
Blender-source hash field; the recorder now normalizes Windows paths, the
importer verifies that hash and the contract test requires it. Final outputs
were regenerated and compressed after this fix. No other code finding remained.

## Original brigantine refinement v21

The base and all three cosmetic ships now use the `rig-refinement-v21` patch.
This continues the accepted v20 brigantine with five sails; it does not adopt
the separately authored ketch or brig studies. Those studies and the original
accepted scene/checkpoint remain unchanged.

The after mast rises to 15.2m, with the overall fore-mast height still 15.55m.
The large gaff sail has separate throat/peak halyards and a bridle, physical
mast hoops and head/foot lacing. Yard lifts, braces, footropes and topsail
sheets make the forward square rig readable. The lower jib keeps its original
stay attachment between the yards; its higher clew and hollow foot provide
clearance over the foredeck without routing a stay through the topsail.
Bindings follow the actual mast taper.

The authoring checks cover five independent cloth surfaces, independent rope
clearance, over 0.12m head gap above a 1.8m figure, 141 supported foredeck
body poses at radius 0.3m, and less than 0.012m mast-binding surface gap.
Retained hull/equipment objects are checked by geometry, UV and transform
signatures. The hull half-width profile increases from 2.8m to 2.85m to cover
the measured retained planking extent of about 2.821m. Berths, scale and draft
remain unchanged and their collision/terrain checks are rerun.

The reproducible recipe and source contracts live under
`scripts/assets/wickharbor_vessels/`; its README owns the rebuild sequence.
The library derivative and authoring evidence are under
`D:/THE_GAME/bible/models/ambient/boats/sailing-refined-v21/`.
Matched before/after offline renders are under
`docs/screenshots/wickharbor-vessels/rig-refinement-v21/`. These are not game
screenshots. Local integration hashes, backups and checks are under
`D:/THE_GAME/artifacts/boats-rig-refinement`.

The shared role-patch merger preserves accepted encoded atlas images; only
previously absent small-part maps receive the established 1024px cap. Runtime
load/prewarm paths and prop keys stay the same. No new dynamic lights or
runtime geometry logic are introduced. Actual game visual acceptance and
hardware frame pacing remain unmeasured; no performance pass is claimed.

Final v21 validation: 11 scoped Vitest files / 66 tests pass, TypeScript and
the bundle build pass, scoped Biome passes, and `npm run security:gate` reports
zero high findings. The full gate was attempted and still stops on inherited
i18n freshness differences. Fresh read-only frontend/render-performance and
coverage review found no blocking or should-fix issue. Transfer is local and
hash-guarded; the live manifest is regenerated after copying scoped files.


## Mixed rig fleet and uniform railings

The current fleet uses three brigantines, two ketches and two brigs. Four sail
palettes remain distributed as two linen, two blue, two ochre and one russet.
Bow and stern rail panels always match within each vessel: blue/russet use
simple panels, linen/ochre use cross panels. The authoring script asserts
actual Balcony panel provenance in both zones, retaining the eight end posts.

The accepted v20, refined v21 and approved v2 study sources remain immutable.
New editable rig derivatives, pinned role patches and geometric evidence live
in `D:/THE_GAME/bible/models/ambient/boats/fleet-rigs-v1/`; new uniform railing
and cargo patches live in `sailing-variants-v2/`. The mixed rig recipe replaces
old study jibs with the crew-safe v21 pair. See the script README for the full
static-spec, scoped KTX2 and manifest rebuild sequence.

The existing ochre prop now uses brig rigging. New ketch-blue, ketch-ochre and
linen brig keys use the existing deferred loader on both graphics profiles.
The base linen brigantine and ordinary rowboat assets remain unchanged. The
new complete-rig bounds require per-key conservative hull profiles; real-bed,
pier and vessel-separation tests cover their actual placements.

Task baseline, hash-guarded local delivery and check logs are under
`D:/THE_GAME/artifacts/wickharbor-fleet-mix/`. Offline render evidence lives in
`docs/screenshots/wickharbor-vessels/fleet-mix/`. Offline model renders do not
establish in-game frame pacing or final hardware visual acceptance.


Mixed fleet validation: 45 scoped tests across 10 files pass; TypeScript,
production bundle, scoped Biome and the security scanner pass (zero high
findings). The full gate was attempted and stops at inherited i18n freshness.
An additional architecture run passes 111 checks and fails its control-byte
scan on widespread inherited CRLF files in the Windows checkout; task source
files have LF endings. Neither inherited failure is hidden or waived.
Fresh read-only review identified a shipping rig-contract coverage gap; tests
now pin patch SHA/checks, per-role triangle counts and geometry parity within
each family. The reviewer hit its usage limit before a complete verdict.
The owner approved the displayed fleet renders before local transfer.

## Walkable boarding, pier dressing and dry rowboats

The native pier kit now has projecting timber posts and sagging hemp-colored
rope guards. Existing native fence panels remain on the stair flights. Guard
runs stop at walkway junctions and boarding openings. Cargo clusters use the
existing crate and barrel assets, seated on the plank surface with matching
collider heights rather than on the seabed.

`wickharbor_boarding.ts` shares six alongside boarding plans between the
renderer and the deterministic walk-surface query. The offshore roadstead
ship has no gangway. Each gangway rises above the gunwale before descending
onto the central working deck. The low hull collider still blocks swimmers
but lets a player arriving at deck height pass. This does not add a complete
ship interior or access to every cabin and raised deck. Ships are excluded
from the generic camera fade registration and remain opaque.

The ordinary rowboat's unique wood material receives a darker warm tint in
the existing material adapter. Cached source assets remain unchanged.
`water_hull_core.ts` describes measured interior sections; both Standard
water faces and the Phong fallback discard fragments inside floating rowboat
hulls using their displaced fragment height. Hauled-out boats add no water
cutout. The section envelope is a measured approximation, not a new physics
water volume.

Validation commands and evidence:

- `npx vitest run tests/wickharbor_boarding.test.ts tests/gale_harbor.test.ts tests/wickharbor_vessels.test.ts tests/decor_prop_colliders.test.ts tests/water_hull_clip.test.ts tests/props_material_normal_scale.test.ts tests/wickharbor_render.test.ts tests/architecture.test.ts --maxWorkers=1`: 145 pass; one inherited control-byte scan failure from widespread CRLF files. Task files are not among the offenders.
- `npx vitest run --config tmp/rowboat-water.browser.config.mts tests/browser/wickharbor_pier.browser.test.ts tests/browser/water_hull_clip.browser.test.ts`: three real Edge/WebGL checks pass, including both water shader paths and shipping KTX2 models.
- `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsc/harbor-final.tsbuildinfo`, `npx vite build`, and `npm run security:gate`: pass, zero high scanner findings. Scoped Biome passes for new modules; existing yard assertions remain warnings.
- `npm run gate`: attempted, stops at inherited i18n freshness differences. No files were staged to bypass the gate.

Movement tests walk both directions across every gangway with the real
character solver. Geometry rays check the sloped planks and their crest seams.
Read-only review found cargo seating, hull approach clearance and repeated
ground-query allocations; all three were fixed and the second pass found no
further concrete blocker. This is local integration, with no publication or
hardware frame-pacing claim.

The [pier assembly screenshot](screenshots/wickharbor-pier/alongside-boarding.png)
uses shipping compressed textures in a focused browser fixture, rather than a
full game-session capture. Shader pixel proofs are in
`docs/screenshots/rowboat-water/`. Check logs live under
`D:/THE_GAME/artifacts/harbor-final-*`.

### Pier revision after visual review

Gangways are now narrow unguarded boards, with a checked perpendicular
alignment to their pier. The north pier extends six yards seaward while
retaining its shore root and the ship's deep-water world position. Moving
that ship inshore was rejected by the existing measured-bed clearance test.

Level pier supports and guard posts are one round timber pile from below
the seabed to above the deck, rather than separate square pieces. The native
timber atlas's side and end-grain UV islands are adapted to the cylinders.
Ropes use a pale hemp surface without the timber atlas or vertex colors.
Native stair-flight railings and supports remain.

The focused revision command passes 19 tests across
`wickharbor_boarding`, `wickharbor_vessels`, `gale_harbor`,
`wickharbor_render`, and `wickharbor_yard_clearance`; the real browser pier
fixture also passes and refreshes all four screenshots. Tests pin continuous
pile bounds, rope material inputs, clear unguarded gangway footprints,
perpendicular alignment and traversal in both directions. Read-only review
found no concrete issue in the revision or its final atlas adaptation.
Revision logs live under `D:/THE_GAME/artifacts/harbor-revision-*`.
TypeScript and the production bundle build pass after the final UV change.
The repeated full gate still stops at inherited i18n freshness differences.

The browser fixture now renders the complete ship roster using the production
asset URL table. Its earlier two-ship subset left other valid boarding runs
visibly orphaned in screenshots. The fixture checks that every run has its
ship and ray-tests real deck support across each gangway endpoint before
capturing. This correction changes capture coverage, not game berth positions.
`harbor-connections-browser.log` records the passing compressed-texture check.

### Rectilinear harbor plan

The main harbor now uses `GALE_HARBOR_AXIS` and `galeHarborPoint`: parallel
finger piers, a perpendicular shore quay and a square dogleg toward the
southern deep-water berth. Flat deck rectangles meet edge to edge without
coplanar area overlaps. Both main stair flights follow the same grid and
meet the inland quay edge; the northern landing uses the clear approach
south of the port office. The cape berth retains its separate coastline axis,
with its stair aligned to that berth. Existing cargo and berth offsets follow
the updated deck definitions; the north ship retains its deep-water position.

Shore stair endpoints meet terrain without the old plank-height lip. A tiny
footprint tolerance keeps a shared edge walkable despite rotation roundoff.
`GALE_HARBOR_JUNCTIONS` records the intentional joins for geometry and movement
checks. Browser rays verify supporting planks and open guard passages at every
join, as well as deck support at each gangway. Node coverage walks every join,
the complete shore flights and their landings in both directions, and checks
orthogonal axes, nonoverlapping floor areas, hull clearance and seabed depth.

Validation: `npx vitest run tests/gale_harbor.test.ts tests/wickharbor_vessels.test.ts tests/wickharbor_boarding.test.ts tests/wickharbor_render.test.ts tests/wickharbor_yard_clearance.test.ts tests/deck_railings.test.ts tests/deck_floor.test.ts --maxWorkers=1` passes 33 tests. The real-browser pier fixture, scoped Biome, TypeScript and production bundle build pass. Read-only review found no concrete blocker. The full gate was attempted and still stops at inherited i18n freshness differences. Logs use `D:/THE_GAME/artifacts/harbor-plan-*`.
