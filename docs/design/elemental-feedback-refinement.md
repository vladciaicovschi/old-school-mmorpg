# Elemental effects and death landing refinement

Follow-up to the stronger-effects and helmet-light passes. Fire and ice body
effects remain as approved. The five lab subjects and their original raid source
keep the same visual dispatch; only the five derived GLBs receive new Death clips.

- Stone debris is reduced from 80 to 24 actual point vertices.
- Water streams and the animated caustic skin are removed from the active owner.
  Water now uses centered, normal-blended teal mist clouds and 24 quiet droplets.
  The translucent body and helmet/core lighting remain. The standalone old
  `WaterSurfaceVfx` helper is retained but is not imported or instantiated by the
  active water character.
- Storm connections use short, staggered discharges instead of continuously
  lit chasing strands. Each has a jagged main bolt and a shorter branch. Both
  position and flash intensity use the same deterministic epoch; the shape
  holds during the flash and reseeds between discharges. Reduced motion selects
  a small stable subset without flashing. The network remains one draw, with
  2,304 triangles and a fixed 110,592-byte position-plus-gain buffer. There are
  no lights, textures, framebuffers or live buffer allocations.

## Death clips

The native Death clip left chest/head/shoulders above the already-fallen lower
stones. A uniform body drop would bury the pieces already on the floor.
`scripts/anim/elemental_death.mjs` instead authors separate world-Y contact
translations for 28 body assemblies, compensating inherited parent movement.
Fingers and thumbs remain part of the connected hand. Native rotations, skin
weights and topology stay intact. Ice additionally includes its two static
upper-arm crystal assemblies; its head crystals remain attached to the helmet.

The landing plane matches the renderer's normalization anchor: the minimum
skinned-body Y after sampling Idle at `min(.5, idle.duration * .5)`. Using the
bind-pose floor caused a roughly .31-world-unit sinking offset in the browser
and was rejected. Static crystal geometry contributes to contact groups but
does not change this skinned-body anchor. The five manifests also remove their
alive hover through `deathGroundOffset` during final settling.

Correction starts after .9 seconds and reaches full contact at 2.5 seconds;
the existing death duration and vocabulary remain. Each derivative is checked
after its own geometry changes, including the smoothed water surface and ice
crystals. Idle, travel and casting clips remain unchanged. Revive restores
the ordinary normalization offset and live effects.

Rebuild in dependency order:

```powershell
node scripts/anim/build_fire_elemental.mjs
node scripts/assets/build_assets.mjs scripts/assets/specs/fire_elemental.json
$env:KTX_BIN=(Resolve-Path tmp/ktx-software-4.4.2/bin).Path
node scripts/assets/compress_glb_textures.mjs public/models/creatures/fire_elemental_prototype.glb
node scripts/anim/build_ice_elemental.mjs
node scripts/anim/build_water_elemental.mjs
node scripts/anim/build_storm_stone_elementals.mjs
node scripts/assets/build_assets.mjs scripts/assets/specs/ice_elemental.json
node scripts/assets/build_assets.mjs scripts/assets/specs/water_elemental.json
node scripts/assets/build_assets.mjs scripts/assets/specs/storm_stone_elementals.json
node scripts/assets/compress_glb_textures.mjs public/models/creatures/ice_elemental_prototype.glb public/models/creatures/water_elemental_prototype.glb public/models/creatures/storm_elemental_prototype.glb public/models/creatures/stone_elemental_prototype.glb
node scripts/build_media_manifest.mjs generate
```

## Evidence

- 62 focused tests across assets, death contacts, material/effect ownership,
  motion reduction and revival pass; six render pure-core guards pass.
- The asset contact test independently welds all 28 disconnected body components
  and evaluates skinned geometry in late Death, including ice shoulder crystals.
- Standard and low renderer captures for all five subjects pass. Actual Three
  skinning after death puts every body's contact point within .00036 world units
  of the floor; no permanent floating segments or floor penetration remains.
- Water has no caustic overlay; stone/water have 24 particles. Death and revival
  screenshots and per-subject contact metadata are retained under
  `docs/screenshots/elemental-feedback/`. Storm discharges and stone death have
  WebM motion captures. These are visual checks, not hardware FPS measurements.
- Production build/bundle and scoped Biome pass, with one inherited
  weapon-skin non-null warning. Security gate passes with zero high findings.
  Fresh read-only animation and render reviews found no blocking issues.
- The full gate stops at the existing staged/committed i18n freshness comparison.
  Files were not staged to bypass it. TypeScript passed before concurrent edits;
  the final full-project check reports an unrelated missing `PathOpts.minGround`
  in `tests/gullhaven_spacing.test.ts:27`, which this task does not modify.
  Parallel settlement edits also reloaded the preview; the final stable capture uses
  HMR disabled to isolate capture from unrelated edits.

Verdict: **READY WITH NOTES** for the lab iteration, with the full-gate i18n and
unrelated TypeScript limitations. Original Ignivar model and raid encounter are unchanged.
