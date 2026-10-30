# Imported troll palette trials

The developer island compares three skin palettes on the existing imported
`npc_dev_troll` model. The original GLB, embedded textures, geometry, rig,
animations, scale and weapon are shared and unchanged. Production trolls and
Wildheart dispatch remain unchanged.

After refreshing the client, run `/dev lab` again. Beside the combat troll
at (764, 0), three inert comparison pairs stand on the reserved strip:

| Trial | Original x,z | Variant x,z | Skin |
| --- | --- | --- | --- |
| Marsh | 780,-8 | 772,-8 | Moss green |
| Sand | 780,0 | 772,0 | Muted ochre |
| Rift | 780,8 | 772,8 | Pale gray-green |

Each pair faces south and labels its original and trial. They have no combat,
loot, quests or vendors. Re-running the command replaces the owner's displays.
The fixed strip consumes no main-gallery cells and moves no existing subject.

## Material path

`troll_palettes.ts` calibrates the cool hue selector against the imported
original atlas, covering its olive highlights and teal shadows. The existing
`armor_dye.ts` shader shifts skin hue and saturation while retaining the source
brightness detail. Warm leather, bone, eyes and pale tattoos remain authored.

`VisualDef.atlasDye` opts a visual into `atlas_dye.ts`. Assembly creates a cached,
isolated material source per original material and static spec. It never changes
the loader's source material or touches later attached weapons. The existing
material cache, far-LOD and compile-preparation paths use that source normally.
The selective atlas flag preserves the same shader on low-tier Lambert and
effect clones. Other outfit dyes retain their existing low-tier fallback.

No extra GLB, texture, sampler, light or draw call is introduced per troll.
Palettes reuse the existing dye shader program with different uniforms.

## Tattoos

An initial separate ink selector also picked cool skin shadows and produced
coloured speckling. It was removed before delivery. Current tattoos remain pale,
as in the original. Changing only their colour cleanly requires a painted UV
mask or a replacement atlas; this trial does not claim to isolate the ink.
The selector is specific to this atlas and is not a general automatic skin mask.

## Evidence

`docs/screenshots/troll-palettes/` contains front, back, three-quarter and
animated views on standard and low tiers. They use the actual CharacterVisual,
imported compressed asset, material derivation and shared frozen idle. Browser
runtime JSON records a live skinned mesh for every variant and no page or shader
errors. These are controlled material previews, not full-world performance tests.

Verification commands and logs are recorded in `tmp/troll_skin_audit/`:

```sh
npx vitest run tests/troll_palettes.test.ts tests/dev_model_comparisons.test.ts tests/dev_model_lab.test.ts tests/dev_commands.test.ts tests/tinted_material.test.ts tests/material_clone_hooks.test.ts tests/architecture.test.ts tests/localization_fixes.test.ts --maxWorkers=1
npm run check:ts
npm run security:gate
npm run build:bundle
npm run gate
```

The full gate stops at i18n freshness in this unstaged shared checkout. Nothing
was staged to bypass that requirement. Scoped checks and final results are
reported separately; a stopped full gate is not reported as a pass.

Final local results:

- The initial four scoped palette/gallery/material suites passed all 48 tests.
- The broader eight-suite run passed 252 tests, skipped three and failed three.
  Two failures are unrelated Wickharbor entrance-stair placement errors in the
  battleground and farming dev-command tests. The third is the repository-wide
  control-byte guard rejecting existing Windows CRLF source files.
- A separate `/dev lab` command-only run passed, including owner isolation and
  deterministic rebuilds. The palette, gallery, material, island and localization
  suites passed in the broader run.
- TypeScript, the client bundle, the malware gate and scoped Biome checks passed.
  Biome retains two pre-existing non-null assertion warnings in the large asset
  and visual manifest files. `ci:changed` cannot resolve its Git diff in this
  environment; the explicit nine-file Biome invocation covers this task instead.
- Standard and low-tier Chrome captures completed without shader or page errors.

The scoped read-only render/material review found no blockers. No production
model replacement, commit, staging or remote action was performed.
