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
