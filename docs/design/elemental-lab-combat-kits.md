# Existing combat kits on new elemental prototypes

Refresh the client and re-run `/dev lab` to rebuild the owner's test subjects.
The five new elemental bodies retain their existing positions, VFX, rig and
animations. They remain stationary until directly attacked, retaliate normally,
drop no loot and do not pull adjacent test subjects.

`src/sim/content/dev_elemental_kits.ts` selects only existing donor mechanics:

| New lab template | Donor | Transferred mechanics |
| --- | --- | --- |
| dev_fire_elemental | rift_magma_brute | Smoulder, fire damage over time on a landed melee hit |
| dev_ice_elemental | rift_rime_elemental | Rime, frost damage over time on a landed melee hit |
| dev_water_elemental | water_elemental | Ranged frost bolts and the three-second Water Jet channel/slow |
| dev_storm_elemental | stormcrag_elemental | Numbing Chill and Static Charge on landed melee hits |
| dev_stone_elemental | ancient_guardian | Stone Bulwark periodic absorb shield in melee combat |

Donor mechanics retain their existing chances, durations and values. Lab health,
weapon damage, scale, aggression policy and placement remain lab-owned. Existing
production mobs, player pets, raid mechanics and model dispatch are unchanged.
The four melee prototypes retain physical basic swings, with the donor's added
elemental effects or utility; this is not a change to the game's melee schools.

## Water caster adaptation

The original Water Elemental is a mage pet. Copying petRanged onto an unowned
hostile mob was insufficient: the pet AI, owner commands and autocast driver
never run for that mob. `src/sim/mob/water_caster.ts` adds the unowned adapter
for templates with petRanged.jet, reusing the existing pet bolt and jet payloads.
Owned pets continue through their original AI path.

The water prototype holds range, channels Water Jet when ready and launches
bolts between channels. The existing Channel clip owns the visible channel and
the normal attack clip handles bolt releases. The existing cast fields and VFX
events serve browser, server and headless; no wire field or persisted state was
added. The optional Entity.mobWaterJetTargetId is transient cleanup state.

The adapter cancels the beam, damage and slow on interrupt, control, lost line
of sight, range break, source/target death, target change or leash. Shared threat
and taunt maintenance keep running during the channel. Unreachable targets use
the existing chase-stall recovery. Evade/reset/respawn also clear the channel
and cooldown. One read-only review found the initial timer, target-maintenance
and reachability omissions; all three were repaired and regression-tested.

## Verification

Logs are under `tmp/elemental_kits/`. The final eight-suite regression run passed
505 tests, including the new kit suite, island/gallery, damage-only aggression,
owned-pet AI, spell resistance, existing caster AI and world API parity. A later
additional deterministic water replay test is covered by the final kit-only run.
The scoped sim architecture guard passed five tests. TypeScript, the client
bundle, wiki generation, malware gate and scoped Biome checks passed.

The final regression rerun passed all 507 tests, including 22 kit-specific tests.
A real-browser simulation/CharacterVisual/Vfx preview caught an additional
adapter error: the player/PvP `isHostileTo` predicate rejects an unowned mob
attacking a player, prematurely cancelling the channel. The adapter now relies
on the shared AI's live aggro target and explicit validity checks instead.
A regression forces that predicate false while checking the complete channel
and its real damage ticks. The follow-up read-only review found no blockers.

`docs/screenshots/elemental-kits/` contains channel, bolt and repeated-channel
frames, `water-combat.webm`, and runtime evidence. The final browser run shows
two full three-second channels, three intervening bolts, six frost ticks of ten
damage, a visible model and no shader/page errors. It uses the real local sim,
new water visual and existing VFX with a controlled camera, not a full-world
performance capture.

The complete `npm run gate` still stops at i18n freshness in this shared unstaged
checkout. Nothing was staged or committed to bypass that check. No full-gate
pass is claimed. User acceptance of the final in-game presentation remains open.

Commands:

```sh
npx vitest run tests/dev_elemental_kits.test.ts tests/dev_model_lab.test.ts tests/dev_model_comparisons.test.ts tests/mob_damage_only_aggro.test.ts tests/pet_ai.test.ts tests/pet_ranged_resist.test.ts tests/mob_caster_spell.test.ts tests/world_api_parity.test.ts --maxWorkers=1
npx vitest run tests/architecture.test.ts -t 'src/sim architecture invariants' --maxWorkers=1
npm run check:ts
npm run wiki:content
npm run security:gate
npm run build:bundle
npm run gate
```
