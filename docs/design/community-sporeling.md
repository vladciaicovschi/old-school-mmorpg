# Animated community sporeling

The owner supplied `bible/models/mobs/comunity/sporling.zip`.
SHA256: `deb1fce490bca9295c1758089850bfe18885a743a7c76a6377f1acb0ae4ef110`.
The archive remains unchanged, including the static character, animation FBX
and original base-color, normal, metallic and roughness maps.

## Population scope

`sporeling_gatherer` uses `mob_glub` / `community_sporeling.glb`.
`corrupted_sporeling` uses its separate `mob_corrupted_sporeling` /
`community_sporeling_infected.glb`. Both are grounded and unarmed. Existing
scale, movement speed, aggression, loot and the infected Pack Frenzy remain
unchanged. `dev_legacy_sporeling` keeps the former floating body for comparison.
Both replacement rows in `/dev lab` are marked installed; the infected row is
beside the treant combat pad to avoid overflowing the main gallery.

## Import and motion

`scripts/anim/blender_build_community_sporeling.py` safely extracts the archive
under `tmp/sporeling-import/source` and uses the supplied merged animation
FBX's own mesh and rig together. The static character FBX has different rest
axes and an extra bone, so copying its animation channels would be incorrect.
The animated source's 23 joints, 9994 triangles and original skin weights are
preserved. No skinned geometry is simplified or re-skinned.

Original PBR maps are rebuilt explicitly. The geometry-safe asset spec
`scripts/assets/specs/community_sporeling.json` produces
`public/models/creatures/community_sporeling.glb`; the final scoped texture
compression step supplies Meshopt and embedded KTX2 maps at a maximum 2048.
There are no new generation calls or paid services.

The ten `Sporeling_*` clips include:

- Neutral Idle and ready CombatIdle from the supplied two stances.
- Walk and Run, retimed for the creature's short legs.
- Attack from Charged Slash, usable as an empty-handed strike.
- Kick, Spin and Combo retained for editor inspection, not randomly used
  during ordinary auto-attacks.
- A short authored Hit reaction from the neutral pose.
- The complete backward Death fall, compressed to 2.2 seconds with a held
  landing. The wide cap supports the fallen body; pelvis height alone is
  not a reliable humanoid death test for this shape.

Source horizontal root travel is removed, keeping the simulation responsible
for movement. Loop endpoints close exactly. Offline floor normalization uses
actual deformed bounds through stances, locomotion, attack and death. This
avoids inheriting the source pack's different floor heights between actions.

Walk lasts 0.4 seconds, Run approximately 0.192 seconds; baking at 120 Hz
retains source pose detail through the faster cycle. Model-specific
`walkRef=1.27`, `runRef=4.6` agree with the actual playback caps and ordinary
mob scale. The stance-foot regression test measures both feet through the
real `locomotionTimeScale` function. It catches the earlier mismatch where
the old default reference made the short-legged body slide during pursuit.

## Infected model

The 2026-10-29 native reimport supersedes the initial retarget described below.
The current source is `sporling-infected.zip`, with the full supplied motion
pack, plus `sporling-reaction.zip` for the supplied damage reaction. See
[the native reimport record](community-sporeling-native.md) for current source
fingerprints, clips and gait calibration. The ordinary model remains unchanged.

### Initial import history

The owner supplied `bible/models/mobs/comunity/sporling_infected.zip`.
SHA256: `a40bb42c1ca09bdf5d6d136cf41d8e8082f0d2982601c30eda7eb759918449ba`.
`scripts/anim/blender_build_infected_sporeling.py` preserves all 66 joints,
104386 triangles, native weights and original PBR maps. Its 4.3-second native
triple-combo action supplies the ordinary attack opening and an optional full
Combo for the editor. Idle, combat idle, travel and full backward death are
retargeted from the ordinary model using evaluated world poses and each rig's
rest axes. Fingers retain the native rig relationship to the hands.

The eight `Infected_*` clips are Idle, CombatIdle, Walk, Run, Attack, Combo,
Hit and Death. Ground normalization and closed travel loops are baked offline.
The final death landing is held. Walk lasts 0.3333 seconds; Run lasts 0.175.
At VisualDef height 1.45 and existing entity scale 0.85, walkRef=1.2553874329
and runRef=4.7310805843 match stance-foot speed through the runtime caps.
The geometry-safe spec `scripts/assets/specs/community_sporeling_infected.json`
and scoped KTX2 compressor produce the 8,087,776-byte shipping GLB, with
Meshopt and three embedded KTX2 maps at most 2048. No skinned simplification.

## Simple palette adjustments on both models

The reference is `bible/conceptart/mob/sporling.png`. Both VisualDefs use the
reversible HSV material palettes in `src/render/characters/sporeling_palettes.ts`:

- Ordinary: warmer rust cap, muted olive moss, cream underside/chest and a
  subtle warm lift to existing brown limbs.
- Infected: warmer rust cap, darker muted moss and a small lift toward aged
  cream/brown tissue. Black sockets and dark decay remain visible.

Original atlas files, normal/roughness maps, UVs, mesh and skin weights stay
unchanged. Selectors retain painted shading rather than flattening it with a
global tint. These are color corrections, not new cap spots, geometry, glowing
eyes or detailed repainting. The guide receives the same material palette and
regenerates untinted `mob_glub.webp` / `mob_corrupted_sporeling.webp` thumbnails.
Standard and low graphics materials, far LOD and effect clones retain the dye.

## Verification and evidence

`tests/community_sporeling.test.ts` and
`tests/community_infected_sporeling.test.ts` pin source fingerprints, topology,
channel bindings, loop closure, articulated feet, actual locomotion cadence,
attack, complete grounded death and retained combat identity.
`tests/sporeling_palettes.test.ts` covers both palettes through standard/low
materials, far LOD and effect clones without changing shared source maps.
`tests/guide_spirit_materials.test.ts` covers guide palette isolation and owned
material disposal for non-spirit models too.

`docs/screenshots/sporeling-colors` contains before/after captures for both
bodies in standard and low graphics, plus real Sim combat move/attack/death
views. `runtime.json` and `combat.json` record no browser errors; each new body
lands hits and reaches its own full death clip. The earlier ghost/ordinary
import evidence remains in `docs/screenshots/ghost-sporeling` as historical QA.
Canonical still rendering runs through the local Vite harness because the
existing IIFE launcher rejects an unrelated import.meta.env field.

The full gate remains blocked by the pre-existing i18n freshness Git exit 129;
`ci:changed` cannot resolve a release base in this checkout. Full character
clip-map checks have six previously recorded player/NPC failures. Do not
interpret successful scoped model checks as a clean full-repository gate.

Final scoped verification (2026-10-26): 39 tests pass in the five listed model,
palette, guide and gallery suites; five src/sim architecture invariants pass.
TypeScript and production build pass. The security scan reports zero high
findings. Source archive SHA256 values remain unchanged. Detailed logs are in
`tmp/sporeling-colors/`; final tests/typecheck both exit 0 in final-status.json.
Fresh read-only frontend/asset review completed with no consequential findings (READY WITH NOTES for the recorded baseline gate blockers).
