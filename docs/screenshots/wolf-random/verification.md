# Random wolf attacks

Both Smart Rig wolves select left bite, right bite and lunge independently on
each basic attack with relative weights `[2, 2, 1]`: 40%, 40% and 20%. Repeated
sides and repeated lunges are possible. The previous fixed five-attack cycle
is removed for these two models.

`ClipMap.attackWeights` wires the base clip list into the existing weighted
presentation picker. Skin and equipped-weapon overrides retain their own
selection policy. Unweighted rigs still cycle. The simulation, damage, attack
frequency, GLB geometry and animation channels are unchanged.

Validation on 2026-10-19:

```powershell
node node_modules/vitest/vitest.mjs run tests/character_attack_selection.test.ts tests/weapon_motion_core.test.ts tests/smart_wolf_asset.test.ts tests/smart_wolf_v2_asset.test.ts tests/warrior_motion_visual.test.ts tests/hunter_motion_visual.test.ts --maxWorkers=2
npm exec -- tsc --noEmit
node scripts/malware_scan.mjs --gate
```

All 105 tests in six files pass. The new suite calls the real CharacterVisual
attack dispatcher and checks arbitrary roll order, consecutive identical sides,
40/40/20 intervals, unweighted cycling, weapon ownership, ability priority and
death guards. Type checking and the Vite client build pass; the latter uses an
owned temporary output directory and `copyPublicDir: false`. Scoped Biome has
only the manifest's pre-existing non-null assertion warning. Security passes
with no HIGH findings after priors. A separate read-only review found no
actionable regressions in the selection seam.

The [browser runtime record](runtime.json) exercises the final compressed wolf
through CharacterVisual. Controlled rolls produce repeats and a non-cyclic
order; thirty subsequent attacks use the real presentation RNG. All clips
remain valid and recover to idle without browser errors.

The required `GATE_SELECT_BASE=HEAD node scripts/gate_select.mjs` was rerun with
the worktree safe-directory setting. It still stops at `i18n freshness` because
regenerated artifacts differ from the staged/committed copies in the existing
working tree. Nothing was staged to bypass the check, so the overall gate is
still red despite passing scoped validation.
