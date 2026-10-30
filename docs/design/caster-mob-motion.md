# Lab caster motion

The owner requested the approved Warlock presentation for Cultist, Acolyte,
Caster V3 and Necromancer V2. Acolyte is imported from the supplied
`skeletons/mixamo_rigged/acolite.zip` with its original PBR maps and appears
on a separate test-island pad. Production KayKit caster families are unchanged.

## Sources and rig ownership

`scripts/assets/export_caster_mob_donors.py` imports the acolyte body/native
clips and a mesh-free Pro Magic donor. It never opens a preview window.
`scripts/build_caster_mob_anims.mjs` owns the animation-only shipping companions
listed by `scripts/anim/caster_mob_targets.mjs`. Existing Cultist, Caster V3
and Necromancer body files, their materials and native state clips are unchanged.

Calm idle comes from the approved Warlock TravelIdle. Preparation uses the full
Playing With Magic take. Hostile anticipation samples Standing 2H Magic Attack
01 from 0.8 to 1.2 seconds, then release continues from 1.2 seconds. Both hands
extend toward the target. Friendly anticipation samples Standing 2H Magic Attack
05 from 1.3 to 49/30 seconds, omitting its earlier deep bend; both hands release
above the head. Preparation/release poses match exactly, followed by native
follow-through and a 0.3-second recovery into calm idle.

The shared fitted-cast clock trims the start of preparation for short casts,
caps its speed at 1.35x and reserves the same 0.76 authored / 0.3 real-time
anticipation as the reference. The initial animation-only migration left lab
templates on physical retaliation. The 2026-10-15 follow-up below connects these
same gestures to authoritative ranged spells rather than disguised melee swings.

Caster V3 has native Meshy bind axes despite Mixamo-compatible core bone names.
`humanoid_world_retarget.mjs` transfers world-rest rotation deltas parent-first,
retains target bind translations/scales and maps vertical pelvis motion only.
Unmapped garment/face bones stay at their target rest transforms. It does not
copy Warlock local bind transforms or use runtime IK. The original Caster V3
idle/walk/death/cast clips were static (run varies); this follow-up replaces idle
and magic presentation only, not those unrelated native locomotion/death clips.

## Runtime scope

`caster_mob_motion.ts` opts in only the four lab visuals. The existing
CharacterVisual mixer handles idle, fitted casting, target relation, release,
cancellation and recovery. A bound fitted-release capability admits these mobs
to the event-owned release route. The unclaimed FX path also releases unknown
self/ally cues before the legacy no-nova early exit. Ordinary mobs retain their
id-less throw, and active channels retain their existing policy. Beam ticks do
not restart the release on every pulse. No new particle/light/GPU producer or
hand-glow policy is introduced by this animation-only migration.

## Rebuild and check

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/assets/export_caster_mob_donors.py
node scripts/assets/build_assets.mjs scripts/assets/specs/caster_mobs.json
node scripts/assets/compress_glb_textures.mjs public/models/chars/npcs/dev_skeleton_acolyte.glb
node scripts/build_caster_mob_anims.mjs
node scripts/assets/compress_glb_textures.mjs public/models/chars/npcs/CultistMagic_motion.glb public/models/chars/npcs/AcolyteMagic_motion.glb public/models/chars/npcs/CasterV3Magic_motion.glb public/models/chars/npcs/NecromancerMagic_motion.glb
node scripts/build_media_manifest.mjs generate
npx vitest run tests/caster_mob_motion.test.ts tests/caster_mob_visual.test.ts tests/cast_gesture_capabilities_core.test.ts tests/ability_vfx_gesture_release.test.ts tests/renderer_spellfx_dispatch_order.test.ts tests/dev_model_lab.test.ts tests/meshy_npc_assets.test.ts --maxWorkers=2
npm run check:ts
npm run security:gate
npm run build:bundle
node scripts/gate_select.mjs
```

Set `KTX_BIN` to the installed Khronos executable directory if needed on Windows.
For donor-only rebuilds, pass `-- --donors-only` to Blender. Animation-only
texture compression skips are expected; the acolyte body must remain KTX2.

Manual acceptance belongs to the user. Reload, run `/dev lab`, compare front/
side idle and robe clearance, attack each caster separately, and inspect its
preparation, directed release and projectile impact. Walking past the lineup
does not aggro it. Check hostile/friendly 0.5/1.7/3/12-second casts in the
preview, release handoffs, cancellation and recovery. Browser tests were not run.

## Authoritative spell AI follow-up (2026-10-15)

Cultist, Acolyte, Necromancer V2 and Caster V3 now opt into a timed `petSpell`
with `castTime` and an existing bolt ability identity. Each prepares for 1.7
seconds, with modest template damage and a role-specific range/cadence (below).
The existing passive/damage-only aggro,
isolated pads, tether and stationary idle are retained. Other mobs, pets and
legacy thrown/instant `petSpell` attacks keep their previous runner.

`src/sim/mob/caster_spell.ts` owns the opt-in lifecycle behind the existing
combat-profile dispatcher. It publishes real cast fields and castStart/Stop
events, stands still in range, and never falls back to melee. Preparation cancels
on silence, matching school lockout, total control, invalid/changed target,
range/line-of-sight loss, evade or lifecycle reset. Root alone allows casting;
Tongues lengthens preparation. Interrupts use the existing ability-aware shared
interrupt path. Blocked line-of-sight chases still use the unreachable-target
evade detector, even when geometrically inside spell range.

Release emits the ability-tagged projectile and schedules damage/resist through
the shared homing projectile queue. Damage resolves at impact, with the normal
hostile spell-hit floor and ranged tuning multiplier. Dead/despawned endpoints
fizzle. No new wire fields, IWorld API, models or GPU producers were needed:
the existing cast snapshots, joined mob release and Gloom Bolt VFX consume the
same identity. Simulation remains shared by offline, server and headless hosts.

Tests: `tests/mob_caster_spell.test.ts` exercises the real mob dispatcher,
interrupt ability, projectile impacts, lifecycle resets, target changes,
range/LoS, control, cadence, legacy imp path and repeated full Sim.tick traces.
`tests/caster_mob_visual.test.ts` also covers the actual 1.7-second duration on
all four shipped rigs. Browser visual acceptance remains user-owned.

Verification for this follow-up: the seven-suite combat/real-rig batch passed
82 checks; the additional six-suite projectile/gesture/evade batch passed 73
checks (the caster suite overlaps and adds a damage-tuning regression).
`npm run check:ts` and `npm run build:bundle` passed. The selective gate ran
the artifact generators and stopped at the existing unstaged i18n freshness
differences, not a caster failure. No full parity/golden regeneration or browser
tests were run. A bounded read-only architecture review checked the opt-in seam,
existing snapshot fields and joined release path; its final review turn hit the
usage limit, so it is not recorded as a completed final review.

## Distinct ordinary-caster kits (2026-10-15)

`src/sim/content/dev_caster_kits.ts` assigns one small utility trait per imported
lab caster, rather than giving every caster every old melee trait:

| Subject | Bolt / base damage / range / cadence | Additional trait |
|---|---|---|
| Cultist | Gloom Bolt / 5-8 / 24 yd / 3.2 s | 20% on-hit Weakening Hex: 10% less damage output for 6 s |
| Acolyte | Wildbolt / 5-8 / 22 yd / 3.4 s | 15% on-hit Curse of Frailty: 6% more damage taken for 6 s |
| Necromancer V2 | Gloom Bolt / 5-8 / 24 yd / 3.2 s | 20% on-hit Mana Burn: 20 mana, never rage/energy |
| Caster V3 | Cinderbolt / 6-9 / 24 yd / 3.6 s | Elemental Warding: flat 3 shadow damage retaliation against player spell hits |

Damage still uses the existing NPC level scaling and hostile ranged multiplier.
Ability IDs (`shadow_bolt`, `wrath`, `fireball`) supply existing localized names,
cast-bar identity and school-colored projectile/gesture routes, not player ranks,
talents, damage-over-time riders or mana costs.

Source donors were checked in ordinary original content: `drowned_cantor`
uses Drowned Dirge (shadow, 5-8, 20 yd, every 2.4 s), `reedbound_acolyte`
uses Rotwater Vial (nature, 5-8, 22 yd, every 2.6 s), and Fire Demon
(`warlock_imp`) uses Ashbolt (fire, 8-11, 24 yd, every 2 s). Their simple
projectile patterns inform the slower, interruptible lab bolts. Gravecaller
Cultist's melee curses were reduced from 20% output reduction / 15% incoming
amplification over 10 s; Broodsworn Necromancer's 80-mana burn and 9-damage
ward were reduced to 20 and 3. The common elite Wildheart Hexcaller's much
higher Sunvenom Hex damage was not copied. Malric's boss Mindfracture,
healing channel, and Grand Necromancer add-wave mechanics were excluded.
No original production templates changed in this follow-up.

`src/sim/mob/caster_hit_affixes.ts` runs only the spell-compatible curse/mana
subset after a timed bolt deals positive damage. Full resists, complete absorbs,
dead endpoints and friendly/owned sources cannot apply it. It never invokes
the full melee/boss affix cascade. Repeated same-template curses refresh rather
than stack. The weakened ward uses the existing shared damage retaliation path
and the already localized Elemental Warding display name rather than the old
unmatched Spectral Ward name;
it does not bounce or reflect the entire incoming spell.

`tests/dev_caster_kits.test.ts` pins the four different kits, utility probabilities,
impact timing, actual damage modifiers, refresh behavior, resource-type guard,
drain clamp, resist/absorb immunity and spell-only ward. The real-rig mixer test
also checks joined preparation/release for all three assigned bolt identities.
For manual acceptance, reload `/dev lab` and pull the four subjects separately;
use a mana class for Necromancer and compare magic versus physical hits on
Caster V3. Proximity aggro remains disabled. Browser acceptance stays user-owned.

Verification: `npx vitest run --maxWorkers=2` over `dev_caster_kits`,
`mob_caster_spell`, `caster_mob_visual`, `dev_model_lab`, `mob_damage_only_aggro`,
`mob_combat`, `mob_pursuit_all`, `pet_ranged_resist`, `projectile_travel` and
`ability_vfx_gesture_release` passed 132 tests. The separate
`dev_caster_kit_names` check passed after explicitly loading the lazy Spanish
locale; `localization_fixes` also passed (three existing skips).
`npm run check:ts`, scoped `npx biome check`, `npm run security:gate` and
`npm run build:bundle` passed. `node scripts/gate_select.mjs` with
`GATE_SELECT_BASE=HEAD` ran artifact generation/SFX checks and again stopped at
the existing unstaged generated-i18n freshness differences across the worktree.
No browser tests, remote mutations or commits were performed.

## Palm-bound preparation (2026-10-19)

The four authored caster visual keys now share the existing prewarmed Warlock
hand-glow path. The renderer samples both Mixamo palms after their animation and
world transforms, using the current ability colour and cast progress. No scene
objects, lights or materials are allocated for the effect. Missing or hidden
hands keep the existing generic windup fallback. The painter suppresses only the
casting contribution to body emissive for these four mob templates; independent
transformative aura rims and hit feedback retain their behavior.

`tests/cast_hand_glow.test.ts`, `cast_hand_glow_core.test.ts`,
`ability_vfx_cast_gate.test.ts` and the real shipping-rig palm test in
`caster_mob_motion.test.ts` cover this route. See `animal-attack-expression.md`
for the shared revision and visual evidence.
