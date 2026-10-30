# Imported body materials

The recent Meshy/Mixamo NPCs, developer mobs and smart-rig animals use the
explicit `IMPORTED_BODY_SURFACE` profile in the character manifest. It opts
into the existing `matte` and `authoredAtlas` material paths. Troll palettes
inherit it from their shared body. The native production ogre and scuttler
variants receive the same treatment as their review models.

The imports carry metallic/roughness textures with glTF's default scalar
factors of one. The ordinary body roughness clamp leaves those response maps
active, producing a varnished appearance on skin, cloth, fur and bone. The
matte path uses metalness zero, roughness one, and removes the two response
maps from derived materials. Albedo, normal maps, animation and authored
emission remain available. Source GLBs and shared source materials are unchanged.

On low graphics, Lambert already has no PBR specular response. `authoredAtlas`
scales its readability floor through the painted atlas, preserving dark texels
instead of adding a uniform grey film. Existing authored emission is preserved.
The same profile is applied to articulated rigs and their baked far meshes.

The profile is explicit per body, not a URL heuristic or a global shader change.
The 47-key acceptance roster is in `tests/helpers/imported_body_visuals.ts`.
Separate held equipment keeps its authored response. Stock kit players/NPCs and
archived pre-replacement bodies retain their appearance. Retired imported
treant/rogue candidates use the profile when explicitly inspected.

Ice and water elemental materials intentionally use physical clearcoat/IOR and
remain outside this profile. Fire, storm and stone elementals already use matte
materials and keep their previous setup. This change adds no material class,
shader hook, pass, light, context, per-frame work or loading dependency.

No `envMapIntensity: 0` workaround is used: the pinned Three renderer replaces
that uniform with `scene.environmentIntensity` for scene environment lighting.

## Verification (2026-10-25)

The new regression suite exercises all 47 bodies through `applyMaterials` and
`tintedFarMaterials` on standard and low graphics. It checks the missing sheen
response, preserved albedo/normal detail, atlas-scaled low readability floor,
source immutability, and deliberate elemental/stock exclusions. Before the
profile, 82 of its 95 cases fail; afterwards all 95 pass.

Commands and evidence:

```sh
node node_modules/vitest/vitest.mjs run tests/imported_body_surfaces.test.ts tests/authored_surfaces.test.ts tests/tinted_material.test.ts --maxWorkers=1
node node_modules/vitest/vitest.mjs run tests/visual_manifest.test.ts tests/meshy_npc_assets.test.ts tests/starting_point_npc_assets.test.ts tests/troll_palettes.test.ts tests/tinted_material_lifecycle.test.ts tests/character_visual_material_release.test.ts tests/dev_model_comparisons.test.ts --maxWorkers=1
npm run check:ts
npm run security:gate
npm run build:bundle
npm run gate
```

The focused material suites have 116 passes. The broader run has 83 passes and
four failures in pre-existing rogue clip/player tint and troll/ogre attachment
expectations. All four reproduce in an isolated Vitest run that restores the
saved old surface flags in memory (`tmp/model-matte/baseline.config.ts`); the
control never writes the live manifest. These fields are untouched by the
surface profile. TypeScript,
security and the client build pass; scoped Biome reports one existing manifest
non-null assertion warning. The full gate still stops at unstaged generated-i18n
freshness differences. Nothing was staged to bypass it.

A fresh read-only frontend review checked the full roster, cache separation,
near/far and low paths, source preservation and elemental exceptions without
finding a defect. Logs and the repeatable comparison script are in
`tmp/model-matte/`.

Browser comparison also passes on medium PBR and low Lambert graphics. Live
material snapshots confirm metalness zero, roughness one, no response maps,
and retained albedo/normal maps for Lin, the cultist and Wolf V2. Low Lin gains
the atlas-scaled emissive floor; its visible grey film is removed. The PBR
difference is subtler under the existing scene lighting. Intentional lighting,
normal detail and painted highlights are retained, so this is not an unlit look.
There were no uncaught page errors. The console still reports unrelated existing
training-dummy/walking-staff preload misses and unavailable localhost API proxies.

Inspected before/after images and both live material audits are in
`docs/screenshots/imported-model-matte/`. The daytime run pins the existing
day/night clock to noon and freezes the model mixers between paired captures;
the camera and lighting are shared within each pair. Late-streaming background
objects and cosmetic particles may differ. Frames with the software-GPU toast
were discarded. These are headless SwiftShader smoke comparisons, not hardware
performance measurements or a claim of final artistic acceptance.
