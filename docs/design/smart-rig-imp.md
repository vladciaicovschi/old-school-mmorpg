# Native flying imp

Source: the owner's `bible/models/mobs/meshy_smart_rig/imp.glb`, SHA-256
`74db4af0ccabaa67cc98b2d0e5b718948f1d4d883ccd080b1ee3171aa16e996f`.
The original remains unchanged. The shipping body preserves 103,664 triangles,
all 56 native joints, skin weights, UVs and PBR materials. It uses Meshopt
geometry and three 2048px KTX2 textures. No mesh simplification or reskinning.

## Motion

The 13 clips are Hover, CombatHover, Fly, FlyFast, ClawLeft, ClawRight,
Dive, Hit, Death, Threat, AlertLook, Cast and CastRelease, prefixed `Imp_`
in the GLB.
Hover and slow flight use a 0.6-second wing beat; fast flight uses 0.5 s.
The stroke drives the real wing roots, with a slightly quicker downstroke
and a delayed elbow/tip response. Torso, head, folded hind legs and curled
tail overlap the stroke. The leg chain bends at the hip, knee and hock;
it never plays a ground walk cycle.

Positive-X wing: 040 -> 039 -> 038; negative-X wing: 043 -> 042 -> 041.
The shared 027/026 chain is the back attachment. Flaps rotate about
Blender Y, with opposite signs, and backward folding uses Blender Z.
Large opposing membrane rotations are avoided. Native outer membrane
weights average over 99.9% wing influence, so the skin is retained.

Claw attacks sweep from a raised outward windup through a forward diagonal
with torso drive and slower recovery. Dive uses both claws and narrows
the wing stroke. The optional claw clips use random weights 2:2:1, allowing
repeats. Normal island combat uses the ranged spell described below.
The complete skull moves at neck 025; the linear lower-face chain
is not repurposed as a jaw.

Cast is a seamless two-handed charge in front of the chest. CastRelease
pushes both hands forward together and recovers to hover. Both retain
wing beats, bent legs and tail follow-through. The ordinary `cast` and
hostile `castReleaseByTarget` slots expose these through CharacterVisual;
there is no full-body frozen hold point. Cancellation returns directly to
hover.

The island imp now attacks with `emberkin_felbolt`, reusing Emberkin's
existing Felbolt projectile and green fel-fire palette. The spell uses
the ordinary Fire Demon's modest NPC damage range (8 to 11 before level
scaling), 25-yard range and a two-second attack cycle. A 0.45-second
windup starts the native `Imp_CastRelease` hand thrust before the bolt
leaves; its recovery continues without restarting the gesture at launch.
No new player ability, boss skill or asset is added. The summoned
warlock Emberkin retains its own unchanged pet AI and scaling.

`updateRangedPetAttack` forwards an optional configured spell identity
on windup and projectile events. Legacy spell templates without an
identity keep their original event shape and cadence.

Death loses lift, folds the wings, rolls onto a flank and releases the upper
arm, leg, wing and tail. The final pose is held. Its baked floor accounts
for the runtime's hover offset, so the corpse lands on the ground.

## Integration

`/dev lab` spawns `dev_smart_imp` at (716, 72), in the last free pad on
the existing level row. It is a demon with stationary idle, direct-pull
aggro, no loot, and a fit-studio entry. The existing warlock imp and other
flying demon visuals retain their models.

Presentation height is 1.65, hover clearance 0.6. Fly / FlyFast use cruise
speed references 1.2 / 4.8 and per-model run thresholds 2.2 / 1.8.
The references control flight tempo rather than planted-foot travel.
No runtime solver, new animation dispatcher or sim flight system is added.

## Rebuild

```text
blender --background --python-exit-code 1 --python scripts/anim/blender_bake_smart_imp.py
node scripts/assets/build_assets.mjs scripts/assets/specs/smart_imp.json
node scripts/assets/compress_glb_textures.mjs public/models/creatures/smart_imp.glb
node scripts/build_media_manifest.mjs generate
npm run i18n:gen
```

The baker samples the same 0.5-second hover pose used for runtime bounds.
It computes `death_floor = idle_floor - hover * idle_height / height`.
All transforms are baked at 60 fps with constant scale. The source file
stays untouched. Final evidence is in `docs/screenshots/smart-rig-imp/`.

## Combat verification

`tests/smart_imp_combat.test.ts` exercises the real mob update and legacy
spell path: passive aggro, close and ranged magic attacks, release delay,
cadence, out-of-range approach, seeded repeatability and unchanged no-ID
legacy bolts. `tests/smart_imp_asset.test.ts` pins the native release mapping
and actual hand motion. `tests/warlock_pet_vfx.test.ts` pins the shared
Felbolt effect and windup/projectile pair without restarting the gesture.

```sh
npx vitest run tests/smart_imp_combat.test.ts tests/smart_imp_asset.test.ts tests/warlock_pet_vfx.test.ts tests/dev_model_lab.test.ts tests/dev_caster_kits.test.ts tests/mob_caster_spell.test.ts tests/pet_ranged_resist.test.ts tests/warlock_pet_skills.test.ts tests/pet_signature_attack_ids.test.ts --maxWorkers=1
npm run wiki:content
npm run check:ts
npm run security:gate
npm run build:bundle
node scripts/gate_select.mjs
```

Browser acceptance remains with the user. Reload and rebuild the island
with `/dev lab` so an old spawned imp does not retain stale AI state.
The checkout's shared selective gate is still blocked by existing unstaged
generated-i18n differences. The broad guide suite also has unrelated zone,
stills, touch-tray and committed-content freshness failures; generated wiki
content was rebuilt, but no files were staged to bypass those guards.
