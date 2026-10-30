# Caster animation and hand VFX runbook

Status: living runbook. Warlock reference visually approved by the user on
2026-10-13. The four test-island caster mobs are now migrated as documented in
[Caster mob motion](design/caster-mob-motion.md). Fixed Mage, Priest, Druid,
Shaman and Rogue motion is covered in [Remaining T1 motion](design/remaining-t1-player-motion.md).
Palm preparation VFX now covers every player class; production mob families
outside the explicit caster list remain future work. Local approval is not a commit, release
or CI certification.

Use this runbook when extending the accepted Warlock T1 presentation to another
caster. Re-read the referenced code before changing it: code and shipping assets
are authoritative, not a copied parameter table.

Related references:

- [Warlock implementation and iteration record](design/warlock-t1-motion.md).
- [Rigged-model import workflow](rigged-model-import-runbook.md).
- [Equipment carry editor](design/equipment-carry-editor.md).
- [Contribution QA gate](qa-gate.md).
- Animation authoring: `.claude/skills/blender-anim-pipeline/SKILL.md`.

## Accepted reference

- Use the fixed T1 Warlock body, preserving its materials, skin and proportions.
- Walk and run use complete unarmed Locomotion Pack cycles. Do not replace their
  native shoulder/elbow movement with a procedural running pose.
- Calm idle has elbow clearance, nearly vertical forearms, a slight forward
  elbow bend and subtly opened shoulders. It must not read as a straight A-pose.
- Combat idle retains the native idle elbows with the approved arm spacing;
  the later calm-only pose adjustments do not apply to it.
- Casting is a continuous preparation, anticipation, release and recovery.
  No idle detour or restart of the attack at the moment of release.
- Short casts use an end-aligned slice of preparation, not the entire long
  animation accelerated without a limit.
- Hostile release extends toward the target. Self and ally release goes upward.
- Warlock carry follow-up (2026-10-15): Z can draw/stow the staff. An accepted
  magic cast stows it through preparation/release and leaves it on the back
  after completion or cancellation, until Z or a valid physical auto swing.
  Within effective melee reach the Warlock uses its equipped weapon; outside
  reach the existing magical sidearm auto remains. No low-mana threshold.
  This is the Warlock reference, not a rule already applied to all classes.
- Preparation VFX stays at both palms. Its colour comes from the current skill,
  including the inner core; no fixed purple or pale rim-colour override.
- No continuous whole-figure tint while players cast. Independent aura,
  transformation and impact effects remain separate.
- Keep the already approved spell projectile/release effects unchanged. Magic
  autos now use the displayed palm rather than the former body-centre origin.

These are retargeted Mixamo animations and authored transitions, not WoW assets.

## Sources and build ownership

Source folder in the current workspace:

```text
D:/THE_GAME/bible/models/characters/t1/mixamo_rigged/druid/
```

The Druid folder is an offline donor library. Reading it does not migrate or
modify the Druid runtime character.

| Input | Imported donor | Reference use |
| --- | --- | --- |
| Standalone `Idle.fbx` | `Pack_IdleArmSpace` | Calm/combat idle; user supplied Mixamo Arm Space around 60 to 65 |
| `Locomotion Pack.zip`: `idle.fbx` | `Pack_Idle` | Unmodified idle comparison, not the selected standing source |
| Same ZIP: `walking.fbx`, `running.fbx` | `Pack_Walk`, `Pack_Run` | Complete native unarmed locomotion |
| `Pro Melee Axe Pack.zip`: `standing idle.fbx` | `Pack_StaffIdle` | Native StaffIdle while drawn, both idle and between physical strikes |
| `Pro Magic Pack.zip`: `Standing Idle 03.fbx` | `Pack_PlayingWithMagic` | Playing with Magic preparation |
| Same ZIP: `Standing 1H Magic Attack 01.fbx` | `Pack_ThrowShadow` | Directed hostile anticipation/release |
| Same ZIP: `Standing 1H Magic Attack 03.fbx` | `Pack_ThrowUpward` | Self/ally anticipation/release |
| Same ZIP: `Standing 1H Magic Attack 02.fbx` | `Pack_ThrowFire` | Imported for inspection; not the chosen hostile finish |
| `warrior_militia.glb`: `Warrior_jump` | Retargeted directly | Short physics-compatible jump, not the cinematic base jump |

The exporter also reads the Druid base FBX named by `BASE` in
`scripts/assets/export_warlock_motion_donors.py` from the Locomotion archive.

Ownership map:

| Stage | Owner |
| --- | --- |
| FBX import, normalization and intermediate donor | `scripts/assets/export_warlock_motion_donors.py` using `scripts/anim/blender_bake_meshy_titan.py` |
| Offline retarget, pose correction, transitions and clip bake | `scripts/build_warlock_ability_anims.mjs` |
| Shared pose sampling, normalized accessor decoding, interpolation | `scripts/anim/pose_blend.mjs` |
| Target hierarchy, rest-delta retarget and joint aiming | `scripts/anim/rig_pose.mjs` |
| Base body | `public/models/chars/players/warlock_t1.glb` |
| Shipped mesh-free animation donor | `public/models/chars/players/warlock_ability_anims.glb` |
| Runtime clip/ability/target routing | `src/render/characters/manifest.ts`: `VISUALS.player_warlock` |

The Node baker above owns the accepted result. Do not substitute an earlier
prototype exporter or manually edit the final GLB. Raw packs and `tmp/` outputs
are not a substitute for keeping the shipped donor and its build sources.

## Rebuild the Warlock reference

Run from the repository root, currently
`D:/THE_GAME/character-model-slice`, with the existing installed dependencies.
Use the installed Blender executable; on this workstation the invocation is:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/assets/export_warlock_motion_donors.py
```

Wait for successful completion before baking. This writes the mesh-free
`tmp/warlock_motion/mixamo_donors.glb`. Reimport when raw inputs change or this
intermediate is absent; an idle-pose correction alone only needs the next stage.

```powershell
node scripts/build_warlock_ability_anims.mjs --preview
node scripts/assets/compress_glb_textures.mjs public/models/chars/players/warlock_ability_anims.glb
node scripts/build_media_manifest.mjs generate
```

Check each command's exit status before proceeding. `--preview` also writes
`tmp/warlock_motion/preview.glb` with the body for inspection. The production
donor remains mesh-free. A texture-compression skip is expected for this donor,
which has no textures; compression errors are not an acceptable skip.

Never simplify a skinned body. Preserve meshopt compatibility and KTX2 textures
when rebuilding any body asset. Regenerate the media manifest, never hand-edit it.
VFX-only changes do not require rebaking the animation GLB.

Carry logic changes alone need no animation rebake. The drawn StaffIdle
follow-up adds one native Axe Pack donor through the same rebuild above;
all 15 previously approved clips remain numerically identical. `sim/weapon_stow.ts`
commits accepted Warlock magic to the existing authoritative `weaponStowed`
bit, at the accepted-cast point in `combat/casting_lifecycle.ts`. Refused spells
do not change it. `combat/auto_attack.ts` leaves it unchanged when merely
arming auto-attack (including Attack on Ability Use), and draws only for an
actual valid melee swing. `combat/form_swing.ts` supplies the Warlock-only
target-aware reach decision; other casters retain their old ranged profiles.
`VISUALS.player_warlock` no longer forces `stowByDefault`, but keeps the
temporary `stowHeldPropsWhileCasting` overlay during free-hand releases.
The physical attack route clears that overlay immediately if it interrupts
release, so the first staff-strike pose actually holds the staff. No new wire,
save fields, VFX or cast delays were added.

Manual staff check: equip a staff on the Warlock, press Z on dry ground, check
front/side idle and movement, then cast at a distant target. The staff should
remain on the back afterward. Press Z to draw again; approach a target and
enable auto-attack (right click) to check physical staff strikes. Repeat at
range to check the unchanged magical auto. Test with full and empty mana;
mana alone must never arm or select a melee attack. Browser testing stays
with the user. Drawn standing uses native Axe Pack StaffIdle; stowed standing
and all locomotion retain the approved free-hand/travel clips. Inspect the
grip rather than claiming browser approval from headless checks.

## Pose calibration, not universal rig constants

The approved Warlock baker uses these offline adjustments:

| Setting | Current value and scope |
| --- | --- |
| Additional upper-arm spread | Left +8 degrees / right -8 degrees around world Z, on both idles |
| Upper-spine correction | +1 degree around world X on `Spine1`, calm idle only |
| Clavicle correction | Left -1 degree / right +1 degree around world Y, calm idle only |
| Calm forearm direction | Normalize native elbow-to-wrist direction, multiply X by 0.1, add 0.18 to Z, renormalize and rotate toward it |
| Root translation | In-place; preserve target bind lengths and planted feet |

The spine/clavicle values are the final absolute offsets over the source.
Relative to the earlier arm-guide revision, they moved the spine 1 degree and
clavicles 2 degrees backward. Do not interpret the constant names as proof of
an anatomical direction. On this target, +Z is forward, confirmed by foot/toe
landmarks. Other rigs can have different axes and rest orientations.

Mixamo's Arm Space slider is not measured in these physical rotation degrees.
Do not claim that +8 degrees equals a 60-to-65 slider value.

Previous unsuccessful iterations are not the baseline: do not restore a fixed
signed elbow offset or spread the whole straight arm further. Judge the front
and side silhouettes together. Retain native wrist/finger articulation and
breathing; do not translate joints or freeze the legs to hide a blend problem.

## Cast timeline and authoritative timing

The reference keeps the complete Playing with Magic source, approximately
11.266666 seconds, plus an authored 0.76-second anticipation tail. `_Loop`
is a compatibility name: fitted preparation plays once, it is not a loop.

```text
end-aligned Playing with Magic slice
  -> attack anticipation
  -> authoritative release event / same pose
  -> native attack follow-through
  -> 0.3-second recovery into calm idle
```

- Hostile anticipation samples Attack 01 from source time 0 to 0.76 seconds;
  release continues from 0.76, without restarting Attack 01.
- Self/ally anticipation samples Attack 03 from 0 to 1.05 seconds, resampled
  into the same authored tail. Release continues from 1.05, with the hand raised.
- The transition out of Playing with Magic blends over the first 0.16 source
  seconds of the anticipation tail. The final preparation pose and first
  release pose match exactly for every family.
- `CastDurationMixer` and `fittedCastTime` use existing `castTotal` and
  `castRemaining`. Snapshot interpolation, late entry, pushback and cancellation
  are presentation concerns; do not change simulation or network timing.
- Runtime settings: `tailSeconds: 0.76`, `tailPlaybackSeconds: 0.3`,
  `maxPreparationSpeed: 1.35`.
- Reserve real anticipation time `T = min(0.3, castTotal * 0.25)`.
  For native preparation length `L` and available real preparation `P = total - T`,
  choose rate `min(L/P, 1.35)` and start at `max(0, L - P*rate)`.
- The 1.35x limit applies to preparation, not the separately fitted anticipation
  or native release. Short casts trim the beginning; long casts use more source
  motion. All slices converge on the same finish.
- Carry the actual playback rate into outgoing crossfades. Do not briefly
  accelerate the cancelled clip at the old full-animation rate.
- The authoritative spell event owns release/projectile creation. A visual
  clock reaching its end must not invent a successful spell or duplicate VFX.
- Preserve recovery interruption by movement, jumping or a new cast, without
  confusing a lingering pre-release online snapshot for a fresh cast.
- Friendly target mode takes precedence over offensive ability routing.
  Preserve event target IDs after casting state has already cleared.

Implementation seams: `characters/cast_duration_core.ts`, `cast_duration.ts`,
`anim_state_entity_core.ts`, `cast_target_mode.ts`, `visual.ts`, and
`ability_vfx/painter.ts`, all under `src/render/`.

Instant casts, channeled spells and empowered abilities need separate policy
checks. Do not add an artificial cast delay to an instant, loop preparation on
each beam tick, or make an existing channel/projectile sequence fire twice.

## Palm VFX calibration and boundaries

`src/render/ability_vfx/hand_glow.ts` uses the shared anatomical anchor in
`characters/cast_palms.ts` after the animation sample. Each side places glow at:

```text
lerp(hand world position, HandMiddle1 world position, 0.6)
```

This is a shift into the palm along its anatomy, not a fixed world-forward
offset. Mixamo, Quaternius and KayKit hand-slot conventions are supported. Missing
finger bones fall back to the wrist; missing hands leave the existing ceremony.

Current `cast_hand_glow_core.ts` envelope, with clamped progress `p` and quality `q`:

```text
outer size = (0.18 + 0.09*p) * 1.296 * (0.8 + 0.2*q)
core size  = outer size * 0.36
outer alpha = 0.32 + 0.23*p; brightness = 1.8
core alpha  = 0.40 + 0.25*p; brightness = 2.2
```

The 1.296 multiplier records the accepted +20% enlargement followed by +8%.
Both layers use the incoming skill's main VFX colour from the registry, not
`rimColorOf` or a hardcoded class colour. Gloom Bolt's current bespoke VFX is
green; no purple override was retained after the user's clarification.

Four sprites total reuse the existing prewarmed overlay cloud. No new lights,
shader variants, per-cast materials, scene objects, pool capacities or post pass.
There is no strobe or orbit animation. Keep scratch vectors/plans reusable and
cache bone lookups by weak visual-root keys, not long-lived entity IDs.

Only refreshed live windups draw the palm glow. Completion, interruption,
death and presentation culling stop the refresh. Check actual bone-ancestor
visibility, not `isFar` alone: the articulated rig can remain visible while the
far bake is still linking. Release the callback on engine disposal.

Current scope:

- `createCastHandGlow` covers the fixed and composed keys derived from
  `ALL_CLASSES`, plus explicitly migrated caster mobs. The original
  `createWarlockHandGlow` name remains a compatibility alias.
- `AbilityVfx.syncEntity` suppresses cast-only body tint for those players and
  caster mobs. Independent aura/transformative rims remain unchanged.
- Missing/hidden/frozen hands keep the existing windup fallback; the root-keyed
  weak cache does not retain entity IDs. No new GPU objects or pool limits.

## Magical auto-attacks (2026-10-19)

`caster_auto_attack.ts` consumes only player `spellfx/projectile` cues carrying
the existing authoritative `wand: true` flag. It launches exactly one existing
projectile with an optional copied right-palm origin. Ordinary ability events,
Hunter ranged shots and physical staff hits do not enter this route. Damage,
auto cadence, target, projectile speed and server event timing are unchanged.

`CharacterVisual.playMagicAutoAttack` starts only the native hostile release,
not the full preparation or generic melee swing. It will not restart an active
cast/attack release; the wire legitimately delivers a wand bolt and a queued
cast boundary in one tick. A newly accepted cast interrupts an auto release
immediately. Drawn props temporarily stow through the existing visual overlay
and return according to the unchanged authoritative carry flag afterward.

Mage, Priest, Druid and Warlock native hostile releases reuse the existing
disjoint shot/locomotion layer, preserving moving legs and gait phase. No new
GLB or per-frame retarget is required. Unsupported forms fail soft: an absent
release does not play a staff attack, and an absent palm keeps the body anchor.

The launch samples the currently displayed palm immediately, not a future
hand-forward pose. There is no artificial windup/delay. Naturalness of this
visual timing remains a user browser-acceptance check.

## Port one target at a time

1. Record the exact target `VisualDef`, rig, bind pose, hand/finger names,
   dimensions, equipment policy and existing cast/release dispatch. Preserve a
   before snapshot of its own animations and leave unrelated targets unchanged.
2. Identify compatible donors. Matching names do not prove matching bind poses.
   Retarget deltas on the target's rest hierarchy; do not copy the Warlock GLB's
   transforms onto an unrelated skeleton. Recheck normalized quaternion accessors.
3. Bake a target-specific animation-only donor and preview through the existing
   pipeline. Preserve that target's death, hit, locomotion and other state clips
   unless explicitly migrating them. Do not add a second animation dispatcher.
4. Start with the reference preparation/release anatomy and duration fitting.
   Recalibrate pose offsets and source release timestamps on the new rig; exact
   preparation/release seams are required, copied numeric values are not.
5. Wire only that target's `animUrls` and `ClipMap` mappings using actual ability
   IDs. Preserve target-relation priority and server-owned release events.
6. Explicitly opt into palm VFX and cast-only body-tint suppression. Supply a
   tested bone mapping/palm anchor when Mixamo names are absent. Reuse the pooled
   overlay and existing readiness gate; keep a safe fallback for missing bones.
7. Decide equipment carry per target. Detached weapons can use existing carry
   anchors/calibration. A staff baked into the body mesh is a different asset
   problem; an attachment flag cannot stow it. Never silently remove a mob's prop.
8. Add tests on the actual exported rig and real mixer, then request manual
   visual approval. Move to the next class or family only after acceptance.

| Target when extending | Reuse first | Revalidate instead of copying blindly |
| --- | --- | --- |
| Mage | Duration clock, continuous directed casts, palm VFX infrastructure | Elemental skill colours, instant/channel exceptions, wand/staff and idle silhouette |
| Priest | Shared preparation fitting, upward self/ally finish, palm anchors | Heal/buff/offensive routing, holy/shadow identity, channel behaviour and clothing clearance |
| Cultist family | Hostile anticipation/release seam and selective palm VFX | Family-specific rig mapping, available cast clock, AI telegraphs and equipment |
| Skeleton mage family | Display-only timing, palette and VFX pooling | Different rest axes/proportions, absent fingers, fixed/baked weapons and readable enemy windup |

For mobs, preserve readable enemy telegraphs at every graphics tier. Check the
actual mob cast-state feed and release path before opting into player-style
timing. Do not alter AI, authoritative cast length, damage or targeting merely
to fit an animation. Roll out by individual visual/family, not every humanoid.

## Verification and acceptance

Structural and controller checks for the reference:

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/warlock_motion.test.ts tests/warlock_cast_visual.test.ts tests/warlock_t1_assets.test.ts tests/anim_pipeline_warlock_nightkin.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/cast_duration_core.test.ts tests/cast_duration.test.ts tests/anim_state_entity_core.test.ts tests/cast_target_mode.test.ts tests/held_prop_visibility.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/cast_hand_glow_core.test.ts tests/cast_hand_glow.test.ts tests/ability_vfx_frame_cost.test.ts tests/ability_vfx_cast_gate.test.ts tests/ability_vfx_gesture_release.test.ts tests/ability_vfx_longbuff_painter.test.ts tests/gloom_bolt_vfx.test.ts
npm run check:ts
npm run security:gate
node scripts/gate_select.mjs
```

Check `character_clipmaps` and architecture contracts for every new migration;
new pure cores need registration. Scope formatting to changed files. Gate and
build requirements remain those of `docs/qa-gate.md`, not a smaller custom gate.

Manual acceptance belongs to the user for this workstream. Do not run browser
tests without revisiting that instruction. Explicitly leave browser steps for
the user if the shared gate would reach them; never bypass checks and call the
full gate green. Review:

- Front and side calm idle: natural shoulders, elbows, wrists and robe clearance.
- Walk/run: native arm swing, stable feet and no weapon teleport.
- Short/normal/long casts, including 0.5, 1.5, 3, 6 and 12 seconds where supported.
- Self, ally and hostile preparation, exact release handoff and return to idle.
- Movement cancellation, jump, death, immediate recast, late/lingering snapshots.
- Palm centres at different wrist rotations, correct skill colour, subtle growth,
  no unwanted body tint and no added projectile/release flash.
- Missing bones, replacement visuals, hidden rigs, far-bake transitions, crowded
  scenes, minimum graphics and reduced-motion mode.

The user approved the final Warlock appearance in-game. Automated tests prove
structural/timing behaviour, not aesthetic quality or hardware frame pacing.
Latest local implementation checks passed targeted tests, typecheck and security;
the shared gate stopped at existing i18n freshness. Other observed checkout
blockers are recorded in the Warlock design record, not waived for future work.

## Reference fingerprints

SHA256 read from the accepted local assets on 2026-10-13. These identify the
reference inputs/output, not universal expected hashes for other classes or a
promise of byte-identical rebuilds across exporter versions.

```text
Idle.fbx
0636F07B4204737F6D25C74FF1900DA3D58ACC4CC625818D9373403F0EF49BD3
Locomotion Pack.zip
D7ECB463B9F76B805227BBE9E23FD560C58991F33F5DCF3C1205DC3ADB3B4F29
Pro Magic Pack.zip
19A1EE956EDB8A6AA194699394B626EECD22DEB30A4C6CD93B1A6598C60EC7DE
public/models/chars/players/warlock_t1.glb
8E9226607CAE6DC9C4EFD3622A6323937185D70D697ADCE578F386C9315A3368
public/models/chars/players/warlock_ability_anims.glb
2032B33DDBBC71860306C48870FC86F54CFF06356AFD9CF70D7B56DB5ECF4FCF
```

Keep source packs backed up outside `tmp/`. A changed source hash, clip mapping
or pose/VFX policy requires rechecking the reference before extending it.

## Local verification, 2026-10-19 auto/palm follow-up

Focused regression batch: PASS. Tests first reproduced missing auto release and
whole-body tint on the real controller/painter paths. The fixture uses shipped
bones and clip tracks with the real CharacterVisual mixer, mocking transport
and mesh geometry only. Palm-origin ownership, hidden/frozen/alias fallbacks,
renderer dispatch and current skill colours have direct tests.

```powershell
npx vitest run tests/caster_auto_attack.test.ts tests/cast_palms.test.ts tests/cast_hand_glow_core.test.ts tests/cast_hand_glow.test.ts tests/ability_vfx_cast_gate.test.ts tests/remaining_player_motion_visual.test.ts tests/warlock_cast_visual.test.ts tests/vfx.test.ts tests/cast_gesture_capabilities_core.test.ts tests/renderer_spellfx_dispatch_order.test.ts --maxWorkers=2
npx vitest run tests/remaining_player_motion.test.ts tests/clip_names_core.test.ts tests/hunter_motion_visual.test.ts tests/paladin_twohand_visual.test.ts tests/warrior_motion_visual.test.ts tests/caster_mob_visual.test.ts tests/ability_vfx_gesture_release.test.ts tests/ability_vfx_frame_cost.test.ts tests/ability_vfx_longbuff_painter.test.ts tests/cast_hand_glow.test.ts tests/shot_locomotion.test.ts tests/warlock_staff_combat.test.ts tests/wand_swing_between_queued_casts.test.ts tests/druid_wand.test.ts --maxWorkers=2
npx vitest run tests/wand_swing_between_queued_casts.test.ts --maxWorkers=1
npx vitest run tests/architecture.test.ts -t 'src/render pure-core|curated bare-named' --maxWorkers=1
npm run check:ts
npm run security:gate
npm run build:bundle
node scripts/gate_select.mjs
```

The broader regression batch passed except one queued-wand sim test timing out
under concurrent checks; its unchanged full suite passed alone with its original
timeout and assertions. Targeted architecture guards, typecheck, scoped Biome
(existing non-null warnings only), security gate and bundle build passed.

The shared gate still fails at generated-i18n freshness against staged/committed
copies in the accumulated worktree. The separate monolith-budget diagnostic
also retains existing overages in Hud, Renderer, Sim and World; ceilings were
not raised. Fallback spell-gesture composition was moved behind its existing
core seam so this follow-up does not grow Renderer. No simulation source edits,
commits, staging or browser tests were performed for this follow-up. Independent
read-only frontend/coverage review found no blocking scoped correctness issue.
