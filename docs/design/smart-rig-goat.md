# Native Smart Rig goat

The owner supplied `bible/models/mobs/animals/goat.glb` without animation. Source
SHA-256: `dc23d1fa29efdeb602b0d6aa5f60f1e3a7737bfed6b7b89fe79e83ecf8bf6353`.
`public/models/creatures/smart_goat.glb` retains its original 103,613 triangles,
44-joint skin and PBR maps. Geometry uses Meshopt, with three 2048px KTX2 maps.
No simplification, skin transfer or replacement body is used.

## Motion set

| Clips | Motion |
| --- | --- |
| Goat_Idle / Goat_CombatIdle | Breathing, ear/tail response and a lowered ready stance |
| Goat_Walk | Four-beat hoof placement and overlapping body/head motion |
| Goat_Trot | Diagonal pairs, available in the studio |
| Goat_Run | Hind propulsion and front reception with support-matched cadence |
| Goat_HeadbuttLeft / Goat_HeadbuttRight | Head loading, curved horn strike, front bracing step and recovery |
| Goat_Ram | Both forehooves lift before a stronger horn strike |
| Goat_Hit | Supported recoil |
| Goat_Death | Flank collapse, upper-limb relaxation and a held final pose |
| Goat_Bleat | Head raise, jaw motion and ear/tail response |
| Goat_AlertLook | Head and ear turn |
| Goat_Graze | Head-down browsing and small chewing motion, studio preview |

`scripts/anim/blender_bake_smart_goat.py` authors the native rig at 60 fps.
The reusable offline support in `native_quadruped_author.py` retains the third
leg segment, fetlock and hoof, with fixed anatomical bend planes. The source's
front feet are staggered, so recovery paths are centered per limb. Export records
per-clip reach and folding diagnostics. `animal_motion_curves.py` matches stance
velocity and acceleration at hoof contact. Neck, chest, ears and tail overlap in
time. Attacks use staggered hind-hoof steps into the strike, then recover to
their anchors; the inactive forehoof stays planted on lateral headbutts.
Scale channels stay at one. The corpse's upper limbs fall toward the lower side;
the evaluated skin determines floor correction before baking.

## Island and cadence

`dev_smart_goat` occupies `(812, 48)` on `/devlab`, behind the wolf. The pad was
probed for flat dry ground and static collider clearance over six yards on seeds
1, 42 and 20061. It inherits the stationary, direct-pull-only, no-loot developer
subject policy and joins the equipment-fit studio roster.

Presentation height is 1.85. Walk/run references measure hoof support velocity.
The compact body uses world speed 3.4, with presentation gait thresholds 1.55 to
enter run and 1.3 to return to walk. `model_gait_core` applies this after ordinary
displayed-motion derivation. Global thresholds and models without the opt-in
retain existing behavior. Tests and browser evidence use the actual tracker
rather than forcing run.

Attacks cycle left, right, left, right, ram through the existing dispatcher.
The roar emote previews bleating; trot and browsing are studio poses. This
isolated subject has no camp, boss reward, loot, deed or public bestiary entry.

## Rebuild

```text
blender --background --python-exit-code 1 --python scripts/anim/blender_bake_smart_goat.py
node scripts/assets/build_assets.mjs scripts/assets/specs/smart_goat.json
node scripts/assets/compress_glb_textures.mjs public/models/creatures/smart_goat.glb
node scripts/build_media_manifest.mjs generate
npm run i18n:gen
node scripts/wiki/build_content.mjs
```

Set `KTX_BIN` to the installed KTX Software bin directory for final compression.
See [visual evidence and verification](../screenshots/smart-rig-goat/verification.md).

The contact revision keeps the crown ahead of the nose through headbutt contact,
with a stronger bow for Ram and a delayed head lift on recovery. Bull and Stag
headbutts from the owner's Quaternius pack were sampled as timing references.
See [contact comparison](../screenshots/animal-contact/verification.md).
