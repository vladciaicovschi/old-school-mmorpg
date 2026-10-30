# Native Smart Rig buffalo

The owner supplied `bible/models/mobs/animals/bufalo.glb` without animations.
The filename spelling is retained in asset and developer identifiers; the English
display name and clips use Buffalo. Source SHA-256:
`4704eb3c89a0ce66e8fef1266ac25aaf9eb3cebebb9c608217c4e33934de4100`.

The shipping `public/models/creatures/smart_bufalo.glb` retains the native
103,876 triangles, 52-joint rig, weights and PBR maps, with Meshopt geometry and
three 2048px KTX2 textures. No body scaling or replacement rig is used.

## Motion set

| Clips | Motion |
| --- | --- |
| Buffalo_Idle / Buffalo_CombatIdle | Slow breathing, tail response and a loaded shoulder stance |
| Buffalo_Walk | Heavy four-beat steps with overlapping head/chest motion |
| Buffalo_Trot | Diagonal hoof pairs, available in the studio |
| Buffalo_Run | Hind propulsion and front reception, restrained body bounce |
| Buffalo_HornLeft / Buffalo_HornRight | Rounded lateral horn strikes with a front bracing step |
| Buffalo_Charge | Low horn-first drive, staggered forehoof and hind-hoof steps |
| Buffalo_Hit | Brief supported recoil |
| Buffalo_Death | Flank collapse with relaxed upper limbs and a held final pose |
| Buffalo_Bellow | Head/chest lift and subtle mouth response, existing roar emote |
| Buffalo_AlertLook | Neck turn and tail response |
| Buffalo_Graze | Lowered browsing pose with small chewing motion, studio preview |

The supplied Quaternius Bull headbutt and ungulate rhythms guide timing and
weight transfer. The author uses the actual native hierarchy, not donor local
rotations. The head turns at the neck base to carry the skull, horns and muzzle
together. The horn-bearing outer chains stay fixed on the skull. Mouth
articulation stays restrained. Attacks hold the crown
forward through contact, then release the head after the body starts recovering.
The buffalo does not rear up before charging.

`scripts/anim/blender_bake_smart_bufalo.py` uses `native_quadruped_author.py` for
offline three-segment limb solving. Source forefeet are staggered; gait strokes
are centered separately under their shoulders. Support-matched quintic swing
curves avoid abrupt hoof contact. Reach and folding diagnostics are exported per
clip. The upper legs soften downward after the death roll, while the evaluated
skin determines floor correction.

## Integration and rebuild

`dev_smart_bufalo` stands at `(812, 72)` on `/devlab`, 24 yards behind the goat.
The footprint was checked on seeds 1, 42 and 20061 over a six-yard radius: flat dry
ground at height 1.7, no water and no static collision displacement. It inherits
the stationary, direct-pull-only, no-loot developer test policy and joins the
equipment-fit studio roster. It has no public camp or bestiary entry.

Presentation height is 2.4 and world movement speed 4.2. Walk/run reference speeds
come from native hoof support velocity. Body-specific gait hysteresis selects run
at 1.75 and returns to walk below 1.45, so a chase uses the proper gait despite the
global humanoid run threshold. Simulation movement and other creatures are unchanged.

```text
blender --background --python-exit-code 1 --python scripts/anim/blender_bake_smart_bufalo.py
node scripts/assets/build_assets.mjs scripts/assets/specs/smart_bufalo.json
node scripts/assets/compress_glb_textures.mjs --dir public/models/creatures
node scripts/build_media_manifest.mjs generate
npm run i18n:gen
node scripts/wiki/build_content.mjs
```

Set `KTX_BIN` to the installed KTX Software bin directory. See
[visual evidence and checks](../screenshots/smart-rig-bufalo/verification.md).

The stride revision gives both front fetlocks the same support angle while
retaining their native lengths. Their hoof paths share a fore/aft center and
match after a half-cycle shift. Walking uses a lateral footfall sequence and
two sagittal body/head nods per cycle, with opposite lateral weight transfer.
The walk enters with the leading front foot near its idle anchor. Horn strikes
add a deeper neck bow and more forward body drive, with a planted supporting
forehoof, staggered hind-hoof steps and rigid horns. See
[stride comparison](../screenshots/bufalo-stride/verification.md).
