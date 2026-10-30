# Equipment carry positioning editor

Open the development build at
`/?weaponfit=1&weaponfitModel=player_warrior`.

The Equipment Fit panel now has an Equipment location selector:

- In hands: existing hand-bone fit.
- At belt: pelvis-local fit.
- On back: chest-local fit.

Select the sword or shield, then use the existing translation/rotation gizmo,
axis sliders/numeric inputs or uniform scale controls. Reset affects only the
selected item's active profile. Copy and Save fit to project include all profiles.
The Warrior T1 subject also has a Main Hand loadout selector: Sword + Shield
or Eastbrook Greatsword (the plain claymore). The latter removes the shield
and preloads its actual `meshy/claymore_sword_1.glb` payload. Direct link:
`/?weaponfit=1&weaponfitModel=player_warrior&weaponfitWeapon=claymore`.

Generic profiles remain independent per visual body and main/offhand slot.
The claymore uses a separate body-plus-model profile, so adjusting it cannot
overwrite the starter sword or another weapon model. All three locations,
uniform scale, draft persistence, Copy and Save fit to project work on that
selected profile. Preview and gameplay resolve the same item-specific hand
and carry overrides before the generic body fallback.

`weapon_fit_studio.ts` owns selection/rebuilds outside `main.ts`. A revision
guard rejects stale asynchronous completions; failed asset loads restore the
previous loadout. The item profile is an explicit allowlisted save identity,
not a caller-supplied output path. `item_attachment_fit.ts` hydrates authored
and local version-2 drafts at startup. Legacy profiles retain their format.

The location selector is a preview mode, not a new equipment or combat rule.
Gameplay still chooses the carry anchor: T1 warrior one-handers use the belt,
two-handers and shields use the back. Other classes keep their current policy.
Editing a back profile does not force a one-handed warrior weapon off its belt.

## Persistence and runtime integration

### Imported mob roster and save repair (2026-10-15)

The model chooser now includes all 15 active subjects from the model-test
island, including Ogre/Murlok native rigs, Acolyte, Necromancer V2, Caster V3,
Rogue V3 and Treant V2. Obsolete KayKit mob choices and retired smart-rig
candidates are not offered. Their assets, manifest definitions and old saved
profiles are retained; transforms are never copied across different skeletons.
New mob labels use the existing localized world-entity names.

`scripts/lib/equipment_fit_payload.mjs` owns the shared explicit roster used
by the chooser, startup hydration and development save allowlist. The seven
armed imported subjects expose their separate hand attachments; adding editable
tags to Ogre/Murlok/Kobold does not change their direct native bone coordinates,
weapon models or rig adapters. Bodies without a separate external weapon remain
previewable, with fit controls hidden rather than saving fictitious hand defaults.

`held_attachment_fit.ts` owns validated body-scoped hand profiles outside the
generated wrapper. Updates preserve existing manifest references; each attachment
assembly also looks up the current body profile, including keys absent from the
authored JSON. Hand and carry drafts hydrate for the complete roster, not only
already-authored keys. Item-specific Hunter/Warrior profiles still take priority.
Titan's dedicated armor writer remains separate from the generic held JSON writer.

Edits save a local browser draft automatically (also flushed on model switch and
page exit). **Save fit to project** writes the authored JSON through the local
development server; restart `npm run dev` after changing its Vite allowlist, then
refresh the game. Preview and newly assembled world models consume these values.
Already-spawned world instances are not modified in place; reload the test island
when checking a fit there. Production builds cannot write project files.

Regression coverage includes the actual save middleware with in-memory file I/O
(no user fits overwritten), all 15 accepted mob identities, rejected keys/payloads,
Titan compatibility, all seven armed models through the real editor controller
and attachment assembler, independent hands/bodies, and authored/local cold starts.
Browser visual checks remain user-owned.

Verification for this repair:

- Scoped Vitest runs: 90 regression checks passed across the 13 equipment-fit
  suites (including the final six-test studio/locale rerun).
- `npm run check:ts`, `npm run build:bundle`, and `npm run security:gate`: passed.
  The full bundle includes all 1864 hashed media assets; no disk-space failure.
- Scoped Biome checks/lints: passed; older non-null assertions remain warnings.
- `npx vitest run --maxWorkers=1 tests/architecture.test.ts` (included in the
  combined scoped invocation): 111 checks passed, one existing raw-control-byte
  guard failed on checkout-wide Windows CRLF. No pure-core registration failure.
- `GATE_SELECT_BASE=HEAD node scripts/gate_select.mjs` (with this worktree's Git
  safe-directory environment): stopped at existing unstaged i18n artifact
  freshness differences, before the full test stage. The shared gate is not green.

The scoped suite names are `held_attachment_fit`, `mob_weapon_fit_studio`,
`mob_equipment_fit`, `mob_equipment_save`, `weapon_fit_studio`,
`equipment_calibration_core`, `equipment_calibration_controller`,
`equipment_carry_preview`, `carried_attachment_fit`, `equipment_fit_payload`,
`item_attachment_fit`, `item_attachment_fit_hydration`, and `warrior_carry_visual`
(each under `tests/` with the `.test.ts` suffix, run with
`npx vitest run --maxWorkers=1`). Read-only persistence/frontend/security/coverage
review found no remaining scoped defect after Titan/locale regression fixes.

### Rusted melee loadouts (2026-10-15 follow-up)

The active Skeleton Minion and Skeleton Warrior now use `rusted_sword_1.glb`
and `rusted_sword_2.glb` respectively. Their oak shields, animation packs and
saved body fits remain unchanged. The active Troll uses the arsenal's jagged
third blade (`rusted_sword_3.glb`) as a cleaver, attached to the right hand via
the standard Mixamo adapter. Its explicit meter-scale fallback fit is editable;
authored/local fits take priority. No caster or baked-weapon body was changed.
All three rusty blades keep their authored PBR surface rather than metal polish.

Verification: `npx vitest run --maxWorkers=1 tests/rusted_mob_weapons.test.ts
tests/mob_weapon_fit_studio.test.ts tests/mob_equipment_fit.test.ts
tests/authored_surfaces.test.ts` passed all 26 checks. `npm run check:ts`,
`npm run build:bundle`, scoped Biome and `npm run security:gate` passed.
The selective gate was rerun and remains blocked at the same unstaged i18n
freshness differences. Read-only frontend/coverage review found no blocker.
Actual grip placement is user-owned browser QA; no browser was launched.

### Existing carry format details

The existing version-2 storage format retains its original 15 hand/armor targets
and adds `mainhand_hip`, `offhand_hip`, `mainhand_back`, `offhand_back`.
Old drafts migrate with the live body's carry defaults. Exports explicitly mark
hand, pelvis, chest and armor-local coordinate spaces.

The preview reparents the same held objects, detaching the gizmo before anchor
changes. Reopening a panel restores the selected location and its edits even
after another subject used the shared preview. Unsupported anchors are disabled.

Local drafts update a stable runtime carry registry. Newly assembled visuals
and weapon swaps read these profiles. The development-only save endpoint writes
the additional carry keys into `held_attachment_fit.generated.json`, preserving
existing hand data and carry keys on legacy saves. The legacy Titan armor-save
branch stores its carry keys in the same JSON rather than dropping them from
its generated armor module. No generated TypeScript wrapper was hand-edited.

## Verification

Focused unit checks:

```sh
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/equipment_calibration_core.test.ts tests/equipment_calibration_controller.test.ts tests/equipment_carry_preview.test.ts tests/carried_attachment_fit.test.ts tests/equipment_fit_payload.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/warrior_carry_visual.test.ts
npm run check:ts
```

These cover independent profiles, old-format migration, active-profile reset,
copy/save/restore, stale gizmo callbacks, reactivation, stable runtime references,
authored/local draft hydration, endpoint payload validation/merging and real
CharacterVisual attachment consumption. Cold full-visual imports can exceed the
fixture setup timeout under concurrent browser/build load; the isolated runtime
suite passes without that contention.

Final focused results: 30 unit tests plus 9 runtime visual tests passed;
TypeScript and the malware gate passed. CSS validity and focus guards passed
(23 assertions across the CSS check group); the separate token-resolution test
still detects existing undeclared tokens in the dirty stylesheet corpus.
That initial build issue was subsequently fixed; the current client bundle
build passes.

Initial carry-editor browser checks (before the claymore selector) switched all three locations and confirmed
that editing the belt X coordinate leaves hand and back values unchanged.
Desktop and touch portrait/landscape screenshots are in
`docs/screenshots/equipment-carry-editor/`. The browser run does not overwrite
authored calibration values with test edits.
The new selector measures 40px high with 16px input text on both touch viewports.

The mandatory selective gate was attempted with `GATE_SELECT_BASE=HEAD` because
this local checkout has no release/remote base. It remains blocked at i18n
freshness across the already dirty worktree. New control labels were added only
to the English catalog and regenerated through `npm run i18n:gen`; release locale
fills remain a maintainer task. No changes were staged, committed or pushed.

## Claymore and upright-strike follow-up verification

The item selector, profile isolation, direct-link restore, stale-load guard,
failed-load rollback, real held/stowed swaps, and cold-start authored/local
draft hydration are covered by focused unit tests. `warrior_motion.test.ts`
checks the replacement strikes stay upright, grounded and below a half-turn.
Only Shield AttackC and TwoHand AttackC differ numerically from the prior
shipping animation file; all other clips are unchanged. Shield strike weights
remain 65/17.5/17.5 percent.

```sh
npx vitest run tests/weapon_fit_studio.test.ts tests/item_attachment_fit.test.ts tests/item_attachment_fit_hydration.test.ts tests/equipment_fit_payload.test.ts tests/equipment_calibration_controller.test.ts tests/warrior_motion.test.ts tests/warrior_carry_visual.test.ts --maxWorkers=2
npm run check:ts
npm run security:gate
npm run build:bundle
node scripts/gate_select.mjs
```

Focused tests, TypeScript, the security gate and client build pass. The
selective gate still stops at existing unstaged i18n freshness differences.
Fresh read-only frontend/security review found no blockers. Browser acceptance
for this follow-up is reserved for the user; no browser was launched.
