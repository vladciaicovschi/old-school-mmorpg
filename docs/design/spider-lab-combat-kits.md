# Existing spider effects on the appearance trials

The original purple spider and five palette trials now use real lab mob
templates. The color trial replaces its inert comparison mannequin one-for-one
at the same position. Reload the client and use `/dev lab` to rebuild them.
They retaliate only after direct damage, do not socially pull each other, and
retain the lab's modest stats, empty loot and normal control susceptibility.

| Appearance | Existing donor | Transferred effects |
|---|---|---|
| Original purple | Venom Weaver (`rift_venom_weaver`) | Venom: 35% chance, 8 nature damage every 2s for 8s. Web: 20% chance, 2s root. |
| Forest | Sableweb Lurker (`webwood_spider`) | Spider Venom: 35% chance, 2 nature damage every 2s for 10s. Sticky Web: 25% chance, 3s root. |
| Marsh | Mirefen Widow (`mire_widow`) | Exposed Wound: 30% chance, +50% critical damage taken for 8s. |
| Sand | Canopy Weaver (`canopy_weaver`) | Ordinary physical bite; the donor has no special on-hit effect. |
| Frost | Bonechill Widow (`bonechill_widow`) | Ordinary physical bite; the donor has no frost proc despite its name. |
| Broodmother | The Broodmother (`mirefen_broodmother`) | Brood Venom: 35% chance, 3 nature damage per stack every 2s, up to 5 stacks, 12s duration refreshed by another proc. |

`src/sim/content/dev_spider_kits.ts` selects only existing effect objects.
It does not copy donor stats, loot, boss flags, summons or raid mechanics.
The broodmother trial uses the Mirefen boss's stacking poison, not Vysska's
larger encounter kit. All existing production spiders already use the imported
base spider model and retain their original gameplay kits; this change enables
combat on the lab's new appearance trials without changing production balance
or distributing the trial palettes into the world.

`ModelComparison.combatMobId` carries the actual lab mob template ID through
the comparison spawn plan. Preview NPC definitions remain available to the
gallery/fitting catalog, but `/dev lab` spawns exactly one mob instead of that
mannequin. `src/sim/dev_model_lab_spawn.ts` owns subject creation behind the
existing dev command, preserving spawn order, owner IDs, facing and level
clamping. Existing entrance cleanup handles both kinds on rebuild.

`tests/dev_spider_kits.test.ts` drives the real on-hit cascade and aura ticks:
poison damage, root, critical vulnerability, poison stack cap/expiration,
ordinary attacks, one-for-one lab spawning and damage-only isolated pulls.
Browser evidence is in `docs/screenshots/spider-kits/`. Its showcase forces proc
rolls for deterministic inspection only; template probabilities are unchanged.

QA: 87 tests across the kit, asset, gallery, palette, lab, preload, elemental
regression and damage-only aggro suites pass. The three focused lab command
tests also pass, including rebuild/ownership behavior. TypeScript, production
build and security scan pass. The full dev command file additionally reports
two unrelated Wickharbor stair-planning errors in battleground/farming cases.
The full gate still stops at the checkout's i18n freshness Git error (129), and
`ci:changed` cannot resolve its release base. Scoped read-only sim/coverage
review found no blockers. Captures show all six actual mob identities visible,
with real poison damage, roots, critical vulnerability and five poison stacks;
page errors are empty.
