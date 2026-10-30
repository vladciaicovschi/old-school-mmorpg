# Native deer and raptor

The owner supplied `bible/models/mobs/animals/deer.glb` and `raptor.glb`.
Originals remain untouched. Shipping bodies retain all 103,716 / 104,166
triangles, 44 / 64 native joints, UVs, skin groups and PBR maps. The native
stance is baked into the bind pose before authoring. Both GLBs use Meshopt
and three 2048px KTX2 textures; no mesh simplification is applied.

## Motion

Deer has 13 clips: breathing idle, lowered combat idle, four-beat walk,
diagonal trot, gallop, left/right antler strikes, stronger charge, hit,
flank death, challenge, alert look and browsing. Horns keep their original
shape and move with the head; the small ear gestures use the actual ear
branches rather than the antler hinges.

Raptor has 12 clips: idle, combat idle, biped walk/run, left/right rounded
claw strokes, an airborne hind-claw pounce, a separate tail whip, hit, flank
death, alert look and threat. Its tail and neck trail the torso. All five joints in each hind
chain remain active. The supplied open mouth has no independent mandible
branch. Its aperture is retained, and the complete skull and teeth follow
the neck together; skull bones are never repurposed as a jaw.

Both use quintic timing, support-matched foot recovery, overlapping axial
motion and offline native limb solvers. Scale stays constant. Strikes
unload before contact and settle through a slower recovery. Death releases
upper limbs and holds the final pose. Attack variants are chosen randomly
with weights 2:2:1 for deer and 2:2:1:1 for raptor, including possible repeats.

The October 19 revision increases the deer's head bow and forward body drive,
with staggered rear-hoof steps instead of fixed hind supports. Raptor lifts
its body with both hind claws, kicks forward, lands and returns to its stance.
The tail whip coils before a delayed wave through the six native tail links.
See `animal-attack-expression.md` for shared validation and visual evidence.

## Supplied references

Both packs now reside under `bible/models/mobs/animations/`. The local
cataloger imports Deer, Stag and Velociraptor FBX files and samples 25
phases per clip. `deer-raptor-references.json` records archive hashes,
inventories, durations and support traces. Stag/Deer walk (1.167 s),
gallop (0.533 s) and headbutt (0.8 s), plus Velociraptor run (0.542 s),
walk (2.417 s) and attack (0.833 s), informed timing and support order.
Authored attacks have longer anticipation/recovery for readability on
these heavier bodies; the raptor walk is shortened to 1.5 s. Donor
geometry, skinning and raw bone rotations are not installed.

## Integration and rebuild

`/dev lab` creates deer at (764, 72), raptor at (740, 72). They inherit
stationary, direct-damage-only aggro and no loot. Both join the fit studio.
Heights are 2.25 / 2.1; test speeds are 4 / 4.8. Per-model gait thresholds
select run at those speeds even when the ordinary locomotion tracker
reports walking. Walk/run references derive from actual support travel and
the evaluated idle height, including the antlers.

Run `blender --background --python-exit-code 1 --python scripts/anim/blender_bake_smart_deer.py`,
and the corresponding raptor script. Then run
`node scripts/assets/build_assets.mjs scripts/assets/specs/smart_deer.json`
and the raptor spec, compress both shipping GLBs with
`scripts/assets/compress_glb_textures.mjs`, regenerate the media manifest
and run `npm run i18n:gen`. `-- --probe` on either Blender author samples
limb limits without exporting.

See `docs/screenshots/deer-raptor/` for shipping-runtime poses, cadence,
random attack and death checks, and per-clip authoring diagnostics.
