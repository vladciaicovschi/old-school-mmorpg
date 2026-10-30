# Warlock T1 motion

Operational rebuild and migration checklist:
[Caster animation and hand VFX runbook](../caster-animation-runbook.md).

The fixed T1 body uses Mixamo unarmed locomotion and free-hand spell gestures.
The 2026-10-15 carry follow-up removes the permanent back lock: Z draws/stows
the staff; accepted magic casts stow it through preparation/release and leave
it on the back until Z or a physical auto swing. Warlock auto-attacks use the
equipped weapon in effective melee reach and the existing magic sidearm
outside it, independently of mana. Other classes keep their current sets.

The change reuses the authoritative `weaponStowed` field and existing staff
strike clips, with no GLB rebake. `tests/warlock_staff_combat.test.ts` covers
accepted/refused/cancelled/instant spells, Z, post-cast engagement, full/empty
mana, melee/ranged dispatch and blocked swings. `tests/warlock_cast_visual.test.ts`
also checks actual hand/back attachment parents through cast recovery and an
immediate release-to-physical-strike transition. The caster runbook above owns
manual acceptance and migration guidance.

Carry follow-up verification (no browser):

```powershell
npx vitest run tests/warlock_staff_combat.test.ts tests/warlock_cast_visual.test.ts tests/held_prop_visibility.test.ts tests/weapon_stow.test.ts tests/form_swing.test.ts tests/ranged_shot.test.ts --maxWorkers=2
npx vitest run tests/combat_auto_attack.test.ts tests/combat_casting_lifecycle.test.ts tests/wand_swing_between_queued_casts.test.ts tests/druid_wand.test.ts tests/weapon_stow_mount_overlay.test.ts tests/weapon_stow_single_writer.test.ts tests/warlock_motion.test.ts tests/warlock_t1_assets.test.ts tests/caster_mob_visual.test.ts --maxWorkers=2
npm run check:ts
npm run security:gate
npm run build:bundle
node scripts/gate_select.mjs
```

The two batches passed 54 and 161 tests; TypeScript, scoped Biome, malware gate
and bundle build passed. Selective gate with `GATE_SELECT_BASE=HEAD` ran artifact
generation/SFX checks and stopped at the same pre-existing unstaged generated
i18n freshness differences. The full gate/parity goldens and browser acceptance
are not claimed green. A bounded read-only review found no blocking issue.

First run Blender with `--background --factory-startup --python
scripts/assets/export_warlock_motion_donors.py`. It reads the Druid folder's
`Locomotion Pack.zip`, `Pro Magic Pack.zip`, `Pro Melee Axe Pack.zip` and the
separately supplied `Idle.fbx`, evaluates the FBX motions on their
own armatures and writes the mesh-free intermediate
`tmp/warlock_motion/mixamo_donors.glb`. Neither the Druid model nor its runtime
configuration is changed.

`node scripts/build_warlock_ability_anims.mjs --preview` then rebuilds the animation-only
clips in `public/models/chars/players/warlock_ability_anims.glb` and a full model at
`tmp/warlock_motion/preview.glb`. The base model and its original textures are preserved.

| Clips | Purpose |
| --- | --- |
| TravelIdle | Supplied Idle.fbx with upper-arm clearance and nearly vertical, slightly forward forearms following the user's front/side guides |
| ReadyIdle | The approved 8-degree arm spread with its original native elbows, unchanged by the calm-pose correction |
| StaffIdle | Native Pro Melee Axe Pack `standing idle.fbx`, looped; used only while the staff is drawn, both calm and between physical strikes |
| TravelWalk, TravelRun | Complete unarmed Locomotion Pack cycles, including shoulders and elbows |
| CastShadow, CastFire, CastDrain | Complete native Playing with Magic, joined to directed Pro Magic throw |
| CastSelf, CastAlly | The same preparation, joined to Standing 1H Magic Attack 03's upward release |
| JumpClassic | Retargeted short militia jump |

Drawn-idle follow-up (2026-10-15): `ClipMap.drawnIdle` is an optional standing
override, registered by `clipNamesOf` and checked against the shipped rig.
The pure `drawnIdleClip` selector admits idle/combatIdle only, and refuses a
manual or temporary cast-stowed prop. It does not change walks, runs, jumps,
spell timing or approved free-hand poses. Same-state initialization/carry
updates refresh the selected base action. A movement interruption of cast
recovery clears the transient cast-stow latch, so a subsequent Z can really
draw the staff and choose StaffIdle.

The animation companion now has 16 clips. A decoded pre/post comparison proved
all 15 prior clips have identical channel/time/value arrays (maximum delta 0),
with StaffIdle the only addition. The base body and textures were not rebuilt.
Browser assessment of the held staff grip remains user-owned.

Drawn-idle verification commands:

```powershell
npx vitest run tests/warlock_cast_visual.test.ts tests/warlock_motion.test.ts tests/clip_names_core.test.ts tests/weapon_motion_core.test.ts tests/held_prop_visibility.test.ts tests/warlock_staff_combat.test.ts tests/warrior_carry_visual.test.ts tests/caster_mob_visual.test.ts --maxWorkers=2
npx vitest run tests/character_clipmaps.test.ts -t 'checks every ClipMap field|drawn Warlock' --maxWorkers=1
npm run check:ts
npm run security:gate
npm run build:bundle
node scripts/gate_select.mjs
```

The scoped field/both-tier binding checks, TypeScript, scoped Biome (existing
non-null assertion warnings), malware scan and bundle build passed. The broad
`character_clipmaps` attempt also exposes existing missing clips, incompatible
swim/modular donor bones and the Quaternius multipart expectation on other
models; those unrelated failures were not suppressed. The new drawn-idle field
is covered by that guard, and its exact Warlock clip/node binding passes on
both graphics tiers. Selective gate again stops at existing unstaged i18n
freshness. No browser testing or full-green gate certification is claimed.
A final bounded read-only review verified the recovery-latch fix with no
additional findings.

All cast families keep the compatible `_Loop` and `_Release` names, but
preparation now plays ONCE. The entire `Standing Idle 03` (Playing with Magic)
is retained in the donor; runtime selects an end-aligned time window rather than
baking duplicate assets for every cast duration. There is no wrist re-centering,
gesture amplification, frozen-leg replacement or procedural charge pose.
Root translation stays in place, as with the other runtime Mixamo motions.

`castDurationFit` opts Warlock into a display-only clock following the entity's
existing `castTotal` and `castRemaining`. `applyEntityAnimOverrides` passes those
facts without growing the renderer coordinator or changing the simulation/wire.
`CastDurationMixer` interpolates unchanged snapshots between the simulation's
20 Hz updates, seeks late snapshots and follows cast pushback. Ordinary rigs and
release one-shots retain native playback.

The selected native preparation is fitted into the cast window, reserving the last
0.3 seconds (at most a quarter of a very short cast) for attack anticipation.
This tail samples `Standing 1H Magic Attack 01` up to its forward-release pose.
For self and ally casts it instead samples `Standing 1H Magic Attack 03` up to
the upward-release pose at source time 1.05 seconds. Its anticipation is
resampled into the same authored tail length, so cast timing and speed-capped
preparation slicing do not change. Self and ally intentionally share this
upward gesture, while hostile spells retain the approved forward gesture.
The matching release clip starts on exactly that pose and continues the native
attack to completion, then blends back to the corrected idle. There is no second
attack restart or idle detour between charging and throwing. The old suffix-loop
adapter and its tests were replaced by the duration-fit modules and tests.

Warlock opts into `maxPreparationSpeed: 1.35`. For preparation length `L` and
available real time `P`, its rate is `min(L/P, 1.35)` and its source window starts
at `L - P*rate`, ending at `L`. Thus short casts take only the last part of Playing
with Magic and sufficiently long casts use it all. Every duration arrives at
exactly the same anticipation pose and the approved release seam. The existing
anticipation/release timing is unchanged; the speed cap applies to preparation.
The outgoing action retains that actual rate during cancellation fades too.
Defs without a preparation speed cap keep their previous full-clip behavior.

The simulation's spell event still owns release. An expired visual clock holds
the release pose rather than inventing a spell. Movement, jumping or a fresh
cast can interrupt attack recovery. A lingering pre-release online snapshot is
not mistaken for a fresh cast. Cancellation leaves preparation without throwing.
Friendly target gestures
take precedence over school-specific offensive gestures. Release events carry the
target ID so the relationship survives an already-cleared casting snapshot.

These are authored blends and retargeted Mixamo motions on the Warlock rig,
not extracted WoW animations. No cast arm IK or new animation dispatcher is
required. The standing idle retains the supplied motion with an additional
8-degree outward world-space rotation on each upper arm. Calm idle additionally
reorients each forearm toward vertical with a small forward component, rather
than spreading the entire straight arm into an A-pose. The source's lateral
forearm component is reduced to a tenth and its normalized forward component
increased by 0.18 before renormalizing. Forward is +Z, checked against the
donor's foot-to-toe direction. This preserves the existing elbow clearance and
small native sway. The upper-spine and mirrored clavicle offsets are each now
1 degree: relative to the approved arm-guide pose, this moves the upper spine
1 degree and clavicles 2 degrees backward. The first-frame shoulder landmarks
move back roughly 6 mm while the forearm guide constraints remain intact. Combat idle keeps
its original elbows and posture. Wrist/finger local rotations remain untouched,
and no joint is translated. These are additive physical angles, not a conversion to
Mixamo's 60-to-65 slider setting. Recovery ends on the widened idle.
Combat idle, walk, run, jump and all cast preparation channels were verified identical to
the previous shipped donor by decoded-channel hashes.
The same module retargets matching Mixamo bone deltas while keeping target rest lengths.

The pose sampler decodes normalized accessors before blending. In the compressed
source, a unit quaternion can be encoded as int16 values up to 32767. Treating those
integers as floats was corrupting the earlier authored motions.

## Hand-bound preparation glow

`ability_vfx/hand_glow.ts` replaces the generic body-centred windup sprites
for the fixed `player_warlock` rig with a soft glow and compact core at each
animated palm, 60 percent of the way from the wrist to the middle-finger base.
The anchor follows wrist rotation rather than a fixed world-forward offset;
rigs missing finger bones retain the wrist fallback. Both layers use the
current ability's main colour, without the pale rim tint whitening the core.
The glow is 20 percent larger than the initial trial, followed by another
8 percent increase. Warlock's sustained cast no longer feeds a whole-body
rim; other classes and independent transformative aura rims are unchanged. The bounded
`cast_hand_glow_core.ts` envelope gently grows with live cast progress. There
is no flicker, orbit motion, release flash, new projectile or timing change.
Self/ally and hostile casts use the same preparation surface.

The engine calls the helper only for refreshed windup stamps. Completion,
interruption, death and presentation culling stop those stamps. Missing bones,
other classes and hidden articulated rigs retain the existing fallback.
Anchors include the displayed rig's yaw, scale and current mixer pose; bone
lookups are weak-key cached. Actual ancestor visibility, not far-LOD intent,
decides whether the hand position can be drawn.

Both hands together use four sprites in the existing prewarmed overlay cloud.
No scene objects, materials, textures, lights, shader variants or pool limits
are added. The helper reuses its scratch vector and envelope; terminal engine
disposal releases its callback. Browser evaluation remains with the user.

Non-browser follow-up commands:

```text
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/cast_hand_glow.test.ts tests/cast_hand_glow_core.test.ts tests/ability_vfx_frame_cost.test.ts tests/ability_vfx_gesture_release.test.ts tests/warlock_cast_visual.test.ts tests/ability_vfx_cast_gate.test.ts
npm run check:ts
npm run security:gate
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/architecture.test.ts -t 'render pure'
node scripts/gate_select.mjs
```

The focused tests, render-pure architecture checks, typecheck and security gate pass. The selective gate still
stops at existing i18n freshness. The monolith-budget diagnostic also reports
existing oversize coordinators; this wiring does not increase renderer lines.

## Animation verification

Calm-pose follow-up: `tests/warlock_motion.test.ts` compares calm and combat idle
throughout the actual shipped clips. It pins elbow clearance, wrists beneath
and slightly forward of elbows, the subtle backward shoulder/head displacement,
identical planted feet and a seamless idle
loop. The existing release-to-idle checks now end on the adjusted calm stance;
the cast gestures and their preparation/release seams stay unchanged. Browser
review remains delegated to the user, as requested.
The earlier numeric world-Z check was not sufficient to infer the anatomical
direction visible on this model. The test now measures the front/side silhouette
constraints rather than treating a signed joint offset as proof of a natural
pose. No visual approval is claimed from this test.

Arm Space/upward-release follow-up: the standalone `Idle.fbx` has an additional
shoulder spread while retaining the nearly straight native elbows.
`tests/warlock_motion.test.ts` pins the file's duration/provenance, increased
hand clearance, near-straight elbow angles, shared upward self/ally release,
unchanged forward hostile release and exact preparation/release seams.
`tests/warlock_cast_visual.test.ts` drives self/ally casts with both short and long
durations through the real mixer, checks the hand above the head and cancellation
into walking. The focused follow-up command
`node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/warlock_motion.test.ts tests/warlock_cast_visual.test.ts tests/warlock_t1_assets.test.ts tests/anim_pipeline_warlock_nightkin.test.ts tests/held_prop_visibility.test.ts`
passes, as do `npm run check:ts` and `npm run security:gate`. Texture finalization
and media-manifest generation were re-run. The broad contract suites retain
their existing failures listed below, and the gate again stops at i18n freshness.

End-aligned slicing follow-up: preparation used to squeeze about 11.27 seconds
into each cast. It now takes only the portion that fits under the 1.35x cap.
For a 1.5-second cast, the final 1.62 source seconds fill the 1.2-second preparation
window; for a 3-second cast, the final 3.645 source seconds fill 2.7 seconds.
The existing 0.3-second anticipation follows both. No GLB, idle, locomotion,
simulation or release pose changes are needed for this slicing policy.

`tests/warlock_motion.test.ts` reads the shipped GLBs and checks finite unit rotations,
lowered hands in locomotion, standing robe clearance, native preparation key poses,
identical preparation/release seams, friendly-versus-hostile silhouettes and recovery to idle. Target and VFX tests also
cover friendly gesture priority and preserving the event target.

The previous version's browser check through the real `CharacterVisual` controller and original materials
confirmed a six-second hostile loop, release, return to run, and distinct self/ally
loops and releases. Captures are in `docs/screenshots/warlock-t1-motion/`.

For this Locomotion/Pro Magic revision, browser testing is intentionally left to
the user. `tests/warlock_cast_visual.test.ts` drives the real `CharacterVisual`
and mixer with the shipped bone hierarchy and animation keys, replacing only
network loading and render geometry. It covers a long cast, release, recovery
to running, cancellation/restart, self casts, death and sparse animation ticks.
It also checks short/normal/long casts, repeated casts and lingering online snapshots,
the end-aligned start frame, continuous preparation speed and the unchanged release deadline.
`tests/cast_duration.test.ts` checks actual mixer samples and one-pass clamping;
`tests/cast_duration_core.test.ts` covers duration fitting, interpolation, pushback
and invalid inputs, including capped outgoing fades and unchanged uncapped behavior.
`tests/anim_state_entity_core.test.ts` pins the existing entity
clock's transfer into presentation and clearing stale values.

Non-browser verification commands and outcomes for this revision:

```text
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/warlock_motion.test.ts tests/warlock_cast_visual.test.ts tests/cast_duration.test.ts tests/cast_duration_core.test.ts tests/anim_state_entity_core.test.ts tests/warlock_t1_assets.test.ts tests/anim_pipeline_warlock_nightkin.test.ts tests/cast_target_mode.test.ts tests/ability_vfx_gesture_release.test.ts tests/character_anim_state.test.ts tests/held_prop_visibility.test.ts
  PASS (all focused suites)
npm run check:ts
  PASS
npm run security:gate
  PASS (zero high-severity findings)
node scripts/assets/compress_glb_textures.mjs public/models/chars/players/warlock_ability_anims.glb
  PASS (mesh-free donor has no textures to convert)
node scripts/build_media_manifest.mjs generate
  PASS
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/character_clipmaps.test.ts tests/architecture.test.ts
  FAIL (existing whole-checkout CRLF control-byte scan, uncovered presentationPoses field,
        legacy modular/T1 donor mismatches and Quaternius multipart expectation)
node scripts/gate_select.mjs
  FAIL at i18n freshness (run outside the sandbox because Turbo is access-restricted there)
```

The gate used `GATE_SELECT_BASE=HEAD` because no release base is available in
this worktree. No unrelated generated files were staged to bypass freshness.
The new duration-fit field joins the ClipMap gate's non-clip configuration inventory.
Browser checks were never reached or invoked separately.

The previous production bundle attempt stopped at the missing
`__I18N_LOCALE_CHUNKS__` sentinel in `index.html`. A successful production bundle
or browser verification of this latest revision is not claimed.
