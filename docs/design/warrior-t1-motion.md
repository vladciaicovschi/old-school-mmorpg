# Warrior T1 native motion

Status: implemented locally; visual acceptance remains with the user. This
revision targets only `player_warrior` / `t1_warrior.glb`. Warlock, the legacy
composed body and Recruit/Militia/Knight suits retain their own contracts.

## State and equipment mapping

| Presentation | Motion source |
| --- | --- |
| Stowed idle | Approved Warlock calm idle, retargeted offline to the Warrior's own rest hierarchy |
| Stowed walk/run | Druid folder's native Locomotion Pack, not procedural arm replacements |
| All jumps | Approved Warlock classic jump timing/body motion, with native idle grips retained for armed families |
| Drawn sword and shield | Warrior Pro Sword and Shield idle, walk, run, inspected grounded slashes, block, hit and casting |
| Drawn one-handed weapon without shield | Warrior Pro Melee Axe pack's standing family |
| Drawn two-handed weapon | Warrior Great Sword family |
| Dual-wield | Explicit OneHand motion fallback; no dedicated dual-wield mocap in this revision |
| No mainhand | Unarmed travel/idle/jump; strikes still use a documented OneHand fallback |

The three weapon packs live under
`D:/THE_GAME/bible/models/characters/t1/mixamo_rigged/warior/`.
Locomotion Pack is under the sibling `druid/` folder. All three weapon archives
include the matching Quilted Wayfarer base FBX. Raw archives stay outside public.

`scripts/assets/export_warrior_motion_donors.py` evaluates the supplied FBX clips
on the normalized Warrior donor hierarchy via the existing Blender retargeter.
It removes the mesh and writes `tmp/warrior_motion/mixamo_donors.glb`.
`scripts/build_warrior_motion_anims.mjs` transfers rest-relative deltas to the
shipping target, keeping its bind lengths. The accepted calm idle comes from
the shipped Warlock donor and base rig; these are offline build dependencies,
not extra Warrior runtime animation sources.

The result is `public/models/chars/players/warrior_t1_motion_anims.glb`, with
native target-rig clips only. Body geometry, PBR textures and calibrated held/
carry transforms are unchanged. The original T1 death clip remains in use.
Gaits loop on their starting pose. Jumps use the approved `WarlockT1_JumpClassic`
at its original duration, transferred through rest-relative deltas. Armed
families retain their native idle shoulder/arm/hand/finger transforms while the
classic jump drives the torso, root and legs. This avoids double-looking lift
from unrelated pack takes while keeping weapons held. Jumps clamp while still
airborne. The original pack jumps remain available as unused `*_PackJump` clips.

## Grounded ordinary attacks

Do not infer choreography from FBX filenames. The original sword/shield
`slash (2)` turns through more than a full revolution and its generic `attack`
is a jump strike. Great Sword `slash (2)` is also a full spin. Their replacements
in ordinary A/B slots are native `slash` and `slash (3)` from each
matching weapon pack, with no procedural flattening of the motion. Both
`slash (5)` takes start and remain in a deep crouch. Ordinary C now uses
`sword and shield attack (4).fbx` for Shield and `great sword attack.fbx`
for TwoHand. Both were checked for upright hip clearance, planted feet and
less than a half-turn of pelvis rotation. The
`slash (4)` takes also spin and are deliberately not selected. OneHand rotates
horizontal and downward strikes only; its backhand turns too far for this cycle.

The acrobatic takes remain in the donor under explicit `SpecialSpin`,
`SpecialJumpAttack`, `SpecialBackhand` and unused `AttackE` names for future
ability-specific authoring. They are not bound by any current weapon profile.
Per-profile ordinary ability strikes resolve to the same grounded variants.
These changes affect presentation, not attack clocks, damage or simulation.

For sword and shield, ordinary attacks use `AttackA` 65 percent, `AttackB`
17.5 percent and `AttackC` 17.5 percent. These correspond to the actual archive
filenames `sword and shield slash.fbx` (base high-to-low strike),
`sword and shield slash (3).fbx` (reverse cross/upward strike), and
`sword and shield attack (4).fbx` (upright weapon-arm strike). The numbered archive
names do not establish official Mixamo labels such as downward or cross.
Selection uses presentation-only randomness, not the simulation's combat RNG.
TwoHand now uses A/B/C at 60/17.5/17.5 percent and an upright spin slice at
5 percent. The source `TwoHand_AttackB` is a longer crouching combo; only its
late upper sweep at 1.94..2.90 seconds is retained, with 0.18-second idle lead-in
and 0.28-second idle recovery. The original low/jumping portions stay excluded.
`scripts/anim/upright_weapon_spin.mjs` owns this offline slice; no runtime pose
flattening or simulation changes. The same motion is transferred onto Paladin's
own rig (see [Paladin two-hand motion](paladin-twohand-motion.md)).
OneHand retains ordinary round-robin selection.

`tests/warrior_motion.test.ts` requires each normal attack's minimum hip
clearance above the feet to exceed 65 percent of that family's idle clearance.
This catches sustained crouches that the old vertical-excursion-only check
could not distinguish from a standing attack.

## Runtime seams

- `weapon_motion_core.ts` selects profiles from actual item definitions using
  `weaponHand` and `isShieldItem`, never weapon-skin size or appearance. A
  two-handed mainhand wins over a stale shield/non-weapon offhand during an
  equipment swap. Two actual weapons remain dual-wield, including Titan Grip.
- `warrior_t1_motion.ts` owns the native clip table and per-profile abilities.
  `ClipMap.weaponMotions` is opt-in; other bodies keep existing routing.
- `CharacterVisual.baseAction` gives stowed travel precedence, then applies
  the drawn equipment profile. Idle, walking, running, jumping/falling and
  casting resolve inside the same state machine, not a new dispatcher.
- An equipment change refreshes a non-one-shot base action even if the base
  state did not change. Dead/one-shot protection remains intact.
- Per-profile ability overrides take precedence over the generic class map;
  ordinary attacks, spin attack sources and hit reactions also use the profile.
- `clip_names_core.ts` is the extracted action collector: every nested profile
  clip and the optional travel jump must be registered, not merely loaded.
- `addWarriorTravelClips` retains already-baked travel clips while still
  generating the existing back/hip/dual-hip carry gestures for these rigs.
- The roster preview holds the actual equipment family's native idle. It no
  longer borrows Paladin motion for any arbitrary offhand item.
- The previous Warrior definition is kept as `LEGACY_WARRIOR_VISUAL` for the
  existing composed/KayKit path. It does not inherit the new Mixamo profiles
  or donor. Existing legacy-rig issues are not repaired by this revision.

Weapon carry stays as documented in
[Warrior weapon carry](warrior-weapon-carry.md): one-handers at the belt,
two-handers and shields on the back, immediate draw on resolved attacks and
existing carry/editor calibration. Animation changes do not alter equipment
rules, attack timing, damage or simulation state.

## Honest ability fallbacks

The imported locomotion/combat families cover weapon types, not every named
Warrior ability. Shield Slam currently uses the native shield block/guard;
Pummel uses a short native strike; Heroic Leap uses the classic jump. These are
working, target-bound fallbacks, not dedicated bash, punch or leap-slam takes.
The supplied great-sword pack contains other candidates for later authoring.
Dual-wield and fist attacks also need dedicated sources for accurate choreography.

The old T1 map referenced missing KayKit attacks and a foreign heroic-leap donor.
Those references are not retained as if they worked on the fixed Mixamo body.
The existing generic water lane remains outside this motion revision; it is
not a newly retargeted swim implementation.

## Rebuild

From the repository root, currently `D:/THE_GAME/character-model-slice`:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/assets/export_warrior_motion_donors.py
node scripts/build_warrior_motion_anims.mjs --preview
node scripts/assets/compress_glb_textures.mjs public/models/chars/players/warrior_t1_motion_anims.glb
node scripts/build_media_manifest.mjs generate
```

Check each exit status. Reimport Blender donors only if raw packs changed or
the intermediate is missing. Varying runtime profile selection needs no rebake.
`--preview` writes `tmp/warrior_motion/preview.glb`; the production donor stays
mesh-free. Texture finalization skips this no-texture donor, with zero failures.
Do not simplify the skinned body or edit generated manifests manually.

## Verification

```text
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/preview_appearance.test.ts tests/warrior_motion_visual.test.ts tests/warrior_motion.test.ts tests/weapon_motion_core.test.ts tests/clip_names_core.test.ts tests/warrior_carry_visual.test.ts tests/warrior_render_contract.test.ts tests/warrior_travel_clips.test.ts
npm run check:ts
npm run security:gate
node scripts/gate_select.mjs
```

Focused suites exercise real shipped keys/bone hierarchy through the actual
CharacterVisual/mixer, with only transport and render geometry mocked: profile
idle/movement/jump/attack, same-state gear swaps, stowed exploration, native arm
motion, fall clamp, death, carry anchors and preview selection. The carry fixture
uses the current editor-authored per-slot calibration rather than stale prototype
offsets. Warlock's motion/controller regression tests also pass.

Attack tests sample actual target-rig feet, pelvis height and unwrapped pelvis
yaw to reject jumping strikes/full spins in the grounded A/B/C slots. The
separate `upright_weapon_spin.test.ts` checks the deliberate rare spin: 5 percent
selection, hips above 93 percent of idle height, grounded foot contact, upper
weapon sweep, full turn and exact idle joins on both target rigs. The live mixer test
checks complete repeated ordinary strike rotations and the shield probability
boundaries. Jump tests compare sampled lower-body poses against an independent
rest-relative transfer of the approved
Warlock clip, preserve its timing, and verify armed grip transforms stay stable.

The broader checkout remains non-green: the CRLF control-byte architecture scan,
legacy modular donor mismatches and Quaternius multipart expectation. The stale
weapon-skin family classifier was updated for the imported Meshy models. The previous missing
`presentationPoses` ClipMap coverage was included while adding nested profile
coverage. The selective gate still stops at i18n freshness; no staging bypass.

Browser tests are intentionally reserved for the user. Inspect front/side calm
idle; stowed and drawn walking/running; shield and two-hand grips; short jumps
and long falls; changing gear while standing/moving; attacks and return to stance;
carry draw/stow; and the roster preview. Numerical tests are not visual approval.
