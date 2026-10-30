# Paladin T1 two-hand motion

Implemented locally; browser visual acceptance remains with the user.

## Scope and motion

`player_paladin` keeps its original T1 body, textures, bind hierarchy and drawn
one-hand/shield animations. A real two-handed mainhand selects the new
`PALADIN_TWOHAND_MOTION` profile, independent of the weapon's skin or apparent
size. Equipment rules remove the offhand shield when the maul is equipped.

The companion `public/models/chars/players/paladin_twohand_motion_anims.glb`
contains 15 animation-only clips, retargeted offline from the already inspected
Warrior donor: two-hand idle/walk/run, classic jump, three grounded strikes,
rare upright spin, cast, hit and block; plus free-hand idle/walk/run and jump.
Rest-relative rotation deltas and scaled root motion preserve Paladin's own bind
lengths. The original Paladin GLB is not modified.

Stowing uses baked free-hand gaits, not an empty two-hand grip. Shared
`Warrior_Travel*` names are intentional: the existing carry-gesture generator
preserves those baked gaits. Paladin keeps its immediate Z attachment swap; the
generator's optional reach gestures are not wired to this profile's top-level
draw/stow fields. Jumping clamps at the approved 0.833333-second end pose while airborne.

Ordinary 2H attacks on both Warrior and Paladin use A/B/C/spin with weights
60/17.5/17.5/5 percent. The spin is the upright upper sweep of the native
great-sword combo, not its crouching or jumping portions; see the shared source
window and checks in [Warrior motion](warrior-t1-motion.md). This is visual RNG,
not a crit rule: attack clocks, damage, crit chance and deterministic sim remain
unchanged. One-hand/shield does not receive the spin in this revision.

Explicit Paladin abilities select target-rig 2H strike/cast fallbacks rather than
foreign one-hand/shield gestures. These are compatible motion fallbacks, not new
bespoke choreography for every ability. Block is retained in the donor for future
routing; equipping a maul does not grant shield blocking.

## Test inventory and equipment editor

On local DEV/offline Paladin startup, `development_weapon_test_kit.ts` grants
one existing `ironshod_maul` to the bag. It does not auto-equip it, change starter
equipment, grant it online or add production starter loot. Remove this temporary
grant after acceptance. The item already has localization and maps to
`models/weapons/meshy/dwarven_warhammer_2h_1.glb`.

In the equipment editor select Paladin, then the two-hand maul loadout. Its
position, rotation and scale use the independent profile key
`player_paladin@models/weapons/meshy/dwarven_warhammer_2h_1.glb`. Hand and back
transforms stay separate. This exact key is included in the authoring endpoint
allowlist; local version-2 drafts hydrate at cold start. Returning to the starter
loadout restores the original weapon/shield editor path.

## Rebuild and checks

From `D:/THE_GAME/character-model-slice`:

```powershell
node scripts/build_warrior_motion_anims.mjs
node scripts/build_paladin_twohand_anims.mjs
node scripts/assets/compress_glb_textures.mjs public/models/chars/players/paladin_twohand_motion_anims.glb
node scripts/build_media_manifest.mjs generate
npx vitest run tests/paladin_twohand_visual.test.ts tests/upright_weapon_spin.test.ts tests/paladin_weapon_test_kit.test.ts tests/weapon_fit_studio.test.ts tests/weapon_fit_loadouts_core.test.ts tests/equipment_fit_payload.test.ts tests/item_attachment_fit_hydration.test.ts tests/warrior_motion.test.ts tests/warrior_motion_visual.test.ts tests/weapon_motion_core.test.ts tests/clip_names_core.test.ts tests/equipment_calibration_controller.test.ts tests/warrior_carry_visual.test.ts --maxWorkers=2
npm run check:ts
npm run security:gate
npm run build:bundle
node scripts/gate_select.mjs
```

Raw FBX reimport is unnecessary unless Warrior source packs/intermediates change.
The no-texture donor is intentionally skipped by texture compression. Tests use
actual shipped animation channels and native target hierarchy through the real
CharacterVisual mixer; only asset transport and render geometry are mocked.
They cover weighted strikes, classic jump timing/retarget, equipment swaps,
shield removal, Z travel/ready transitions, DEV-only bag grant, editor loadout,
save allowlist and cold-start hand/back draft restoration.

The selective gate currently stops at the checkout's pre-existing generated-i18n
freshness mismatch. Do not stage unrelated artifacts or bypass that check.
Known wider legacy/modular asset and CRLF architecture baselines are outside this
revision. Browser testing is intentionally reserved for the user: maul grip,
Z draw/stow, movement/jump, attacks/rare spin, return to stance, ability gestures
and editor hand/back save/reload. Numerical tests are not visual acceptance.
