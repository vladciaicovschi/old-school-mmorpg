# Ice elemental prototype

`/dev lab` adds **Ice Elemental Prototype** (`dev_ice_elemental`) at x=812, z=-24,
beside the fire prototype at x=812, z=0. Reload and re-enter the lab to refresh an
older lineup. Both are passive until damaged and available in the fitting studio.

The ice variant preserves the staff-free body's topology, skin weights and rig.
The old warm atlas supplies masks for pale frost ornament and luminous cyan
cracks. Frosted opaque ice uses clearcoat and an ice IOR on standard graphics;
low graphics retain the painted blue/white surface and localized emissive mask.
There is no screen-space transmission, new light or extra render target.

Three small clusters on the shoulders/head add a crystalline silhouette. These
are ordinary bone-parented meshes, included in normal far/shadow baking. The
near rig keeps its body and the crystal clusters intact. Cool wisps and drifting
diamond-shaped frost particles share the existing owned VFX lifecycle: prepared
before reveal, hidden with the near rig, reduced-motion aware, faded on death,
restored on reuse, and disposed by the visual owner.

Crystals use indexed geometry and sample one bright frost texel from the shared
body atlas. This keeps their UVs through optimization, so far/shadow merging
retains the body's atlas instead of dropping UVs from the entire bake. The
shipped-asset test checks indices and UV presence after the standard pipeline.

The fire builder now opens the former staff hand in every clip: middle joints
use 6 degrees of local X flexion and tips 4 degrees, preserving the knuckle fan,
thumb, wrist, translations and scales. The old bind pose itself was a closed
grip, so merely resetting fingers to bind could not fix it. The ice variant
inherits these corrected clips. Casting/death keep their original body motion.

Rebuild fire first, then ice, so both variants inherit the same corrected hand:

```powershell
node scripts/anim/build_fire_elemental.mjs
node scripts/assets/build_assets.mjs scripts/assets/specs/fire_elemental.json
$env:KTX_BIN=(Resolve-Path tmp/ktx-software-4.4.2/bin).Path
node scripts/assets/compress_glb_textures.mjs public/models/creatures/fire_elemental_prototype.glb
node scripts/anim/build_ice_elemental.mjs
node scripts/assets/build_assets.mjs scripts/assets/specs/ice_elemental.json
node scripts/assets/compress_glb_textures.mjs public/models/creatures/ice_elemental_prototype.glb
node scripts/build_media_manifest.mjs generate
```

KTX-Software 4.4.2 at the builder's default temporary path is an authoring
dependency, or pass its `ktx.exe` path explicitly. Both shipped GLBs use meshopt
and KTX2, and preserve the original raid source. New source code/assets stay in
the existing character-model worktree; no source deletion, staging or publishing.

Regression tests: `tests/fire_elemental_asset.test.ts`,
`tests/ice_elemental_asset.test.ts`, `tests/elemental_body_vfx.test.ts`, the lab,
terrain, authored-surface and fitting-studio suites. Headless captures are visual
smoke evidence only, not hardware frame-pacing measurements.

## Validation

The focused asset, hand-pose, cold/fire VFX, lab/terrain, studio, authored-surface
and material suites pass all 47 tests. TypeScript passes after regenerating the
new English entity key. The production build passes. Scoped Biome passes with
an inherited non-null-assertion warning in the existing manifest helper.

`npm run gate` stops at the existing i18n freshness check because generated
localization artifacts differ from staged/committed copies in this worktree.
Nothing was staged to bypass it. `npm run security:gate` passes; `ci:changed`
passes but reports zero files against its default base, so the explicit scoped
Biome check is the useful lint evidence. Fresh read-only frontend/GPU/content
review found no scoped blocker. Verdict: **READY WITH NOTES** for the prototype.

Runtime evidence lives under `docs/screenshots/ice-elemental/`, including the
old fire hand, corrected fire hand, standard/low ice surfaces and clip silhouettes.
Both standard and low runtime captures have no browser/GLSL errors, preserve all
three crystal clusters, and retain UVs and 9,796 triangles in the far and shadow
bakes. The offline `/dev lab` smoke creates both subjects at their authored pads,
selects their corrected idle clips, and captures them through the normal world
renderer without page errors (`island-smoke.json`, `island-ice.png`,
`island-fire.png`). Standard ice uses MeshPhysicalMaterial; low uses Lambert with
the same cold crack map. Hardware frame-time quality is not measured here.
