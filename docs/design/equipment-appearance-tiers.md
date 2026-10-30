# Independent equipment and chest-driven appearance

Current contract, 2026-10-14. Supersedes the one-slot warrior armor trial.

All classes use the complete twelve-slot paperdoll in Character and Inspect.
Helmet, necklace, shoulders, chest, both hands, gloves, belt, legs, boots and both
rings equip independently. Every worn item and its per-copy rolls/enchantments
continue to feed the shared stat and set-bonus calculation. Choosing a full-body
visual never removes other equipment or merges its stats into the chest.

## Appearance rule

`ArmorItemDef.appearanceTier` is explicit cosmetic content metadata. Only the
equipped chest item's value is read, and the item must really be chest armor.
Rarity, level, stats, other slots and `wholeBodySuit` do not determine the model.

- T1, missing/unknown chest, missing/invalid tier: `player_<class>`, the approved T1 body.
- Higher tier N: `player_<class>_tN`, only if that production-ready visual is registered.
- Missing class/tier model: the class's T1 body. Never borrow another class's outfit.
- Explicit developer body overrides, Combat Mech and shapeshift forms retain precedence.
- World visuals and full self/inspect turntables share this rule. Small class portrait
  chips remain class-based; the character-selection roster does not yet carry chest gear.

Existing item IDs and stats remain intact for saved characters. The three legacy
warrior chest IDs now declare tiers 1 (recruit), 2 (militia), and 3 (knight), but they
remain ordinary chest-slot items, not exclusive armor sets.

## Why higher tiers currently fall back to T1

The old `player_warrior_militia` and `player_warrior_knight` visuals are experimental
rigs, not production-ready tier bodies. Their Sword and Shield clips lack the approved
T1 weapon-motion profiles and belt/back carry policy. Direct donor reuse is unsafe:
compared with T1, the upper arm is 38.7% longer on militia and 64.5% longer on knight;
hand bind rotations differ by 22 to 41 degrees, and knight lacks 24 donor finger bones.
The T1 donor writes translation/rotation/scale on every bone, so it would overwrite
their target proportions. They remain lazy experimental visuals and are NOT registered
under the new tier keys. Until compatible tier bodies are authored or properly
retargeted, all three chest tiers correctly render the approved T1 model.

To enable a higher appearance, register `player_<class>_tN` in `VISUALS` with compatible
motion, held-weapon fit, carry and asset/preparation policy, then tag the appropriate
chest item(s) with `appearanceTier: N`. Add clip/bone/preload tests and perform the
owner's browser checks before treating that model as production-ready. Do not alias an
incompatible legacy suit to the tier key simply because its bone names match.

## Save compatibility

The destructive warrior whole-body migration and its global free suit grants are
removed. New warriors use their ordinary class-defined starter chest. Existing saves
keep equipment, bags, item-instance payloads and the inert optional
`wholeBodyArmorRevision` field. No schema, network or IWorld changes are needed.
Previously bagged armor stays in the bags and can be re-equipped manually: the old
migration did not retain enough history to safely infer which copies to auto-equip.

## Verification

Focused suites cover all slot rows, independent equip/stats, exact save/load/reload
preservation for absent/0/1 legacy stamps, chest-only tier selection, malformed and
unavailable-tier fallback, local/peer identity, preview gear forwarding, and live
factory routing including Mech/forms. Browser tests remain with the owner.

### Delivery checks, 2026-10-14

The combined focused run passed all 282 tests in 15 files:

```text
npx vitest run tests/warrior_whole_body_equipment.test.ts tests/armor_tier_core.test.ts tests/char_view.test.ts tests/char_window.test.ts tests/inspect_view.test.ts tests/inspect_window.test.ts tests/inspect_instances.test.ts tests/warrior_suit_selection.test.ts tests/character_visual_override.test.ts tests/equipment_proficiency.test.ts tests/quaternius_character_body.test.ts tests/items.test.ts tests/persistence_round_trip.test.ts tests/starter_items.test.ts tests/equipment_instances_wire.test.ts --maxWorkers=2 --reporter=json --outputFile=tmp/armor-tier-final-tests.json
```

- `npx vitest run tests/armor_tier_core.test.ts --maxWorkers=2`: 5 passed after the final independent wrong-kind fixture refinement.
- `npx vitest run tests/architecture.test.ts -t 'src/sim|src/ui pure-core|src/render pure-core' --maxWorkers=2`: 86 passed; 26 outside the selected concerns skipped.
- `npm run check:ts`: passed.
- `npm run security:gate`: passed, zero high findings.
- `npm run wiki:content`: passed; generated content refreshed.
- `npm run build:bundle`: passed, including media manifest and backdrop-survival checks.
- Scoped `npx biome check --write` on the touched source/test files: no errors; existing lint warnings remain.
- `node scripts/gate_select.mjs`: stopped at the pre-existing i18n freshness differences from uncommitted work. A green full gate is not claimed.

An additional broad asset-contract run (`tests/character_clipmaps.test.ts` and
`tests/visual_manifest.test.ts`) still found seven failures in pre-existing
rogue/warlock/Quaternius clip, bone and tint expectations. No character asset or those
visual definitions were changed by this equipment task, and those unrelated asset
repairs are not included here. The focused equipment/view/factory/wire checks above
are green. Read-only simulation/persistence, frontend and decisive-coverage reviews
were completed; the legacy rig compatibility issue they identified is handled by
the explicit T1 fallback, not by unsafe donor reuse.
