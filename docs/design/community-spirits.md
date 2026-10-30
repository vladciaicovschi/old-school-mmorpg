# Community ghost and wisp replacements

The owner supplied `bible/models/mobs/comunity/ghost.glb` and `wisp.zip`.
These remain intact. No generation service or paid rigging was used.

## Production mapping

| Mob | Visual | Treatment |
| --- | --- | --- |
| Ledger Wraith (`reliquary_ledger_wraith`) | `delve_skel_wraith` | Native floating ghost, physical two-hand rake |
| Wood Wraith (`wood_wraith`) | `mob_ghost` | Same ghost replacement pending its separate wooden concept |
| Ice Wisp | `mob_ice_wisp` | Pale ice blue |
| Lily Wisp | `mob_lily_wisp` | Leaf green |
| Glimmerwisp | `mob_glimmerwisp` | Warm golden light |
| Duskwisp | `mob_duskwisp` | Muted violet |
| Gale Wisp | `mob_gale_wisp` | Pale turquoise |

`mob_choir_thrall` still uses the old `ghost.glb`. Its Bog Thrall identity is
outside this replacement. Dedicated `dev_legacy_*` visual keys preserve old
ghost, wisp and Ledger bodies for comparison without adding eager preloads.

Every replacement has an installed row in the model lab (`/dev lab`). The
gallery marks these `REPLACED IN GAME`. No existing mob stats, loot, aggression,
damage schools or on-hit effects change. Ledger Rot and Duskchill still use the
original simulation templates. Duskchill is currently a nature-school proc;
its name does not introduce frost damage or a new cast.

## Assets and motion

- Ghost source SHA256:
  `f54059d80edc05c036dea96cdf855b09cb13c45591a415809c65c78ffed3d8f2`.
  The replacement source's 68-joint Smart Rig and 103127 triangles remain intact. Native
  upper-body IK produces a two-hand physical strike; incompatible donor bone
  channels are not copied. Artificial lower-body chains remain fixed locally
  in all clips (`Bone_001` through `Bone_010`). The body drifts as a whole and
  never takes walking steps. Upper-body chains are adapted to this skeleton;
  the former source's numbered channels are not reused.
- Wisp archive SHA256:
  `c1e5b0b8d3f240b1555b50a69062a17aefc83dc62bd6cf1258a6a72537db8354`.
  Its static source is reduced from 99553 to 23998 triangles before adding
  rigid object-transform clips. It has no skeleton or skin weights. Idle,
  movement, attack, hit and shrinking death are authored locally.
- Shipping files: `public/models/creatures/community_ghost.glb` and
  `community_wisp.glb`. Both use Meshopt geometry and embedded KTX2 textures,
  with source maps clamped to 2048. Nothing uses Draco.

Reproduce with the corresponding `scripts/anim/blender_*community*.py`, then
`scripts/assets/build_assets.mjs` with the matching `community_*.json` spec.
Finally run `scripts/assets/compress_glb_textures.mjs` on those two files and
regenerate the media manifest. The wisp script safely extracts its own source
archive. Never simplify the skinned ghost.

## Materials and effects

`spirit_appearance.ts` defines a finite palette. Wisps use the existing atlas
dye shader to retain texture detail, with one shared GLB and map set.
`spirit_surface.ts` applies permanent spectral opacity and restrained emission
to derived materials. The cache partitions kind, graphics tier and rig/far
mount. Loader source materials and textures stay unchanged.

`SpiritBodyVfx` creates three owned mist billboards before the character GPU
compile gate. It adds no point lights or runtime texture generation. The mist
freezes with reduced motion, hides with the articulated body at far LOD, fades
on death, restores after reuse, and disposes its own resources once.

Guide model data carries spectral style and atlas dye. Its viewer clones and
disposes only its own material variants, retaining shared textures.

## Verification

- `community_spirits.test.ts`: full production mapping, unchanged combat
  records, native rig/topology, fixed lower limbs, rigid wisp motion,
  compression and installed gallery rows.
- `spirit_surface_vfx.test.ts`: standard/Lambert material isolation, far and
  effect clones, mist visibility, reduced motion, death/reuse and disposal.
- `guide_spirit_materials.test.ts`: guide palette isolation and clone ownership.
- `docs/screenshots/community-spirits/runtime.json`: all seven visuals at
  standard and low quality, with idle, attack and death screenshots.
- The newer ghost's current screenshots and rig facts are under
  `docs/screenshots/ghost-sporeling`; earlier ghost screenshots in the first
  directory are historical and show the superseded torn-cloth model.
- `combat.json` in the same directory records real Sim combat events and
  selected clips, including the original Ledger Rot and Duskchill effects.

The canonical wiki still launcher currently rejects an existing unresolved
`import.meta.env` field in its IIFE bundle. The six current stills were rendered
through the exact canonical `scripts/wiki/stills_render_entry.js` as an ES
module on local Vite instead. The temporary harness and logs are under
`tmp/spirit-import`.

The full gate stops at the pre-existing i18n freshness Git exit 129. This is
not a clean full-gate result. Browser captures establish headless smoke
coverage; GPU pacing and hardware memory residency were not measured.

Scoped results: 51 tests in eight suites pass, plus all 12 guide viewer mount
tests when run with bounded workers. TypeScript, client build and security
scan pass. Full character clip-map checks retain six unrelated player/NPC
failures (hunter field coverage, missing player clips, foreign player channels,
and a multipart NPC assumption). The former static wisp exemptions now point
at the preserved legacy bodies; no spirit binding or idle-bake failure remains.
Guide still guards report an existing missing Warlock still and unrelated
orphan art. All six spirit stills exist and the exact canonical still entry
rendered them without page errors. `ci:changed` cannot resolve its release
base in this checkout. No unrelated test expectations or art were removed.
