# Kobold and murlok model rollout

The imported island bodies now render the matching world populations. Production
and lab entities resolve to the same visual key, so Weapon Positioning saves,
attachment scale, bone selection and local transforms remain shared.

| Body / fit key | World templates |
| --- | --- |
| `npc_dev_kobold` | `tunnel_rat`, `grix_the_tunnelking`, `deeprock_kobold`, `ironvein_foreman`, `ironvein_sapper` |
| `npc_dev_meshy_murlok` | `mudfin_murloc`, `deepfen_murloc`, `mirejaw_the_ravenous`, `mirejaw_frenzy`, `sloomtooth_the_drowned`, `glimmermere_wader`, `moonspawn`, `rift_tide_thrall`, `rift_boss_tide`, `mere_lurker`, `the_meredark` |

Kobolds retain the rusted pickaxe; murloks retain the rusted pitchfork. Source
archives and existing imported GLBs are retained. Grix currently shares the new
kobold body, with his existing template scale and gameplay unchanged.

Actual frogs (`bogtoad`, `drowsy_croaker`, `bog_bloat`) retain the frog body.
Unrelated sprites, gnomes and other burrowers retain their existing fallback.

## Lab status convention

When promoting another island body to world use, append `(Replaced)` to its English
lab template name and expose the corresponding localized status in the name.
The Russian names requested by the owner are `Кобольд (заменен)` and
`Морлок (заменен)`. Preserve stable template IDs, lineup positions and fit keys.
Do not mark a body merely because its source was imported: mark it when its world
population has actually been switched. Regenerate i18n after changing names.

## Evidence

- `tests/kobold_murlok_rollout.test.ts`: every promoted template, negative species
  cases, shared fit keys, Russian labels and shipped clip binding.
- `docs/screenshots/kobold-murlok-rollout/`: browser captures and actual
  CharacterVisual state transitions, including attack recovery and clamped death.
- The kobold's supplied hit reactions are enabled. The existing Meshy murlok pack
  has no dedicated hit-reaction clip; the rollout retains its available native set.

After updating the local game, reload and run `/dev lab` to recreate the labeled
test subjects. Existing already-spawned subject names are refreshed by rebuilding
the lineup; gameplay templates and save IDs do not change.

## Validation

- `npx vitest run tests/kobold_murlok_rollout.test.ts tests/dev_model_lab.test.ts tests/mob_weapon_fit_studio.test.ts tests/entity_i18n_guards.test.ts`: 51 passed.
- `npx vitest run tests/meshy_npc_assets.test.ts -t 'kobold|murlok'`: 2 passed, 27 unrelated cases not selected. Updated those two attachment pins to include the existing editable mainhand slot.
- `npx tsc --noEmit`: passed.
- Scoped Biome check: no errors, one pre-existing manifest non-null warning.
- `npm run wiki:content` and `npm run build:bundle`: passed.
- `npm run ci:changed`: exited successfully but selected zero files; the explicit scoped check is the useful lint evidence.
- `npm run gate`: stopped at i18n freshness because generated artifacts differ from staged/committed copies. Nothing was staged to bypass the check.
- The broader initial test run also found existing stale troll/ogre attachment pins in `meshy_npc_assets.test.ts` and the repository-wide CRLF/control-byte architecture guard failure. These unrelated cases were not modified or suppressed.
