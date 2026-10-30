# Remaining T1 player motion

Implemented locally for fixed Mage, Priest, Druid, Shaman and Rogue bodies.
Browser visual acceptance remains with the user. Swimming is explicitly deferred
until a suitable source clip is supplied.

## Native motion contract

`remaining_player_motion.ts` decorates only these fixed T1 definitions after the
original manifest records are built. `legacyRemainingPlayers` retains the original
records for the separate composed/KayKit branch. No runtime bone-name retarget,
new dispatcher, gameplay mechanic, item grant or network field is introduced.
The original T1 body files, PBR maps, bind hierarchies and death animations stay
unchanged. Obsolete KayKit accessory show-lists are not applied to whole T1 bodies.

| Class | Movement and combat |
| --- | --- |
| Mage, Priest, Druid | Approved calm/ready idle, free-hand walk/run, classic jump, hit reaction, Axe-pack drawn staff idle and joined magic preparation/release |
| Shaman | Calm stowed travel, classic jump, joined spells; native OneHand, Shield and TwoHand ready/gait/jump/strike/hit families from the approved Warrior donor |
| Rogue | Calm stowed travel, dagger-ready guard, free-arm walking/running, classic jump with drawn guard, three native stabbing variants, kick and utility gesture |

Every companion is animation-only and targets that body's own Mixamo hierarchy.
The baker transfers rest-relative rotation deltas, scales root translation by
target proportions and preserves target bind lengths. Source key times are
included alongside regular samples, preserving exact preparation-tail boundaries.
Looping gaits close on their first pose. Jumping and falling clamp the approved
classic jump at its native duration; the foreign `Fall_Flail` no longer drives
these five bodies. This is a jump-hold fallback, not a newly authored panic fall.

Shaman and Rogue intentionally use the shared `Warrior_Travel*` clip names for
their own baked gaits. The existing travel generator therefore preserves native
gaits instead of replacing the arms procedurally. They keep immediate Z swaps;
optional draw/stow reach gestures are not added by this revision.

The character-select stage uses each calm, free-hand idle with equipment carried
off the hands, rather than a frozen attack or armed stance. The same menu policy
covers creation/offline class selection and the Mech cosmetic's native Idle.
Live character sheets and the fitting editor retain their own equipped poses.
Equipment calibration remains attached to existing class/body keys.

## Casting and weapon boundaries

Mage, Priest, Druid and Shaman reuse the approved Warlock duration-fitting
contract: end-aligned Playing with Magic preparation, capped preparation speed,
short anticipation tail, native hostile or upward self/ally release and recovery.
Friendly target relation wins over offensive ability routing. Mage fire spells
retain the separate Fire family. Existing skill VFX and spell colours are unchanged.

Accepted casts and releases temporarily stow held props through the existing
visual overlay. This does not extend Warlock's special persistent authoritative
stow or nearby physical staff-auto mechanics to other classes. Cast clocks,
channels, projectiles, damage and targeting remain owned by the existing sim.

All legacy ability/hand overrides are replaced for the fixed bodies, so an
existing but unbound KayKit clip cannot win over a working native fallback.
Unlisted caster spells use target-based generic native releases. These are motion
fallbacks, not individually authored gestures for every spell or channel.

Shaman weapon profiles intentionally omit their own `cast`: casting falls through
to the common free-hand preparation. Stormstrike remains an actual weapon strike
through the physical damage event path and does not stow its weapon. Dual wield
uses the documented OneHand fallback until dedicated paired-weapon motion exists.

Rogue attacks use the supplied `Stabbing.fbx`, `Stabbing (1).fbx` and
`Stabbing (2).fbx`. Its ready pose retains the source stabbing guard's upper
limbs over the calm breathing motion. Kick comes from its supplied Sword and
Shield pack. Garrote, low blows and finishers currently use selected stabbing
fallbacks; Blind and self toggles use the native power-up utility gesture. They
are not claimed as dedicated wire-strangle, dirt-throw or dodge choreography.
One-hand and dual-dagger equipment share this native guard family.

Druid bear/cat/travel forms remain separate visuals and are not migrated here.
Seated and water-specific motion remain outside this ground/combat revision.

## Rebuild

From `D:/THE_GAME/character-model-slice`, with approved Warrior/Warlock final
donors already present:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/assets/export_rogue_motion_donors.py
node scripts/build_remaining_player_anims.mjs
node scripts/assets/compress_glb_textures.mjs public/models/chars/players/mage_t1_motion_anims.glb public/models/chars/players/priest_t1_motion_anims.glb public/models/chars/players/druid_t1_motion_anims.glb public/models/chars/players/shaman_t1_motion_anims.glb public/models/chars/players/rogue_t1_motion_anims.glb
node scripts/build_media_manifest.mjs generate
```

The Node baker also accepts selected class names as arguments. Reimport Rogue
FBX only when those sources change or the intermediate is missing. The final
texture step intentionally skips animation-only files. Do not edit generated
manifests or simplify the skinned bodies.

## Verification and manual acceptance

```powershell
npx vitest run tests/remaining_player_motion.test.ts tests/remaining_player_motion_visual.test.ts tests/preview_appearance.test.ts tests/t1_player_assets.test.ts tests/paladin_twohand_visual.test.ts tests/warrior_motion_visual.test.ts tests/warlock_cast_visual.test.ts tests/hunter_motion_visual.test.ts tests/cast_duration_core.test.ts tests/cast_duration.test.ts tests/clip_names_core.test.ts tests/weapon_motion_core.test.ts tests/ability_vfx_gesture_release.test.ts tests/anim_state_entity_core.test.ts --maxWorkers=2
npm run check:ts
npm run security:gate
npm run build:bundle
node scripts/gate_select.mjs
```

Native contract tests were red before the migration because every target lacked
a jump. New tests inspect actual shipped channels, finite values, target node
bindings, loop/release seams and native jump timing. Controller tests run actual
CharacterVisual/mixer on the exported target hierarchy, mocking only transport
and render geometry. They exercise all five ground/hit/death lanes, cast target
relations and short/long duration fitting, Z, staff parenting, Shaman physical
strikes/equipment families, Rogue stabbing/kick/utility, and portrait selection.
The body-import tests still pin native PBR assets and original baseline clips;
their expected runtime routes now reflect native companion motion. Stale editor
source pins follow the extracted studio and shared save allowlist.

The broader checkout retains known generated-i18n freshness, shared water and
legacy composed-rig issues. Do not call the full gate green or stage unrelated
generated artifacts to bypass those baselines. Browser tests remain reserved for
the user: inspect front/side calm poses and clothing clearance, drawn/stowed
movement, short hops/long falls, hostile/heal/buff casts and interruptions,
Shaman shield/one-hand/two-hand grips, Rogue dagger guard and utility fallbacks,
plus character-select resting poses. Numerical tests are not visual approval.
