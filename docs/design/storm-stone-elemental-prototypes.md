# Storm and stone elemental lab prototypes

This records the initial asset baseline. Current body-effect settings and
follow-up QA are documented in [Stronger elemental effects](elemental-vfx-boost.md).

Two staff-free derivatives of Heart of the End / Ignivar Ashcaller now stand on
separate pads in `/dev lab`: `Storm Elemental Prototype` at (836, 0), and
`Stone Elemental Prototype` at (836, -48). They also appear in the mob fitting
studio. These are passive damage-only test subjects; existing world mobs and
the original raid boss are unchanged.

Both retain the 9,712-triangle body, 51-joint skin and six clips of the corrected
fire derivative, including its relaxed former staff arm and open fingers.
Storm uses cool charcoal rock, silver-violet trim and blue-white crack emission.
Stone uses rough earthy gray rock with almost unlit seams, a taller 2.8-unit
body and a lower hover offset. Normal maps preserve the original rock relief.
Both are opaque, without transmission or offscreen passes. All shipping maps
are KTX2 and geometry uses Meshopt with no skinned simplification.

Storm adds 14 animated bone-to-bone connections as one preallocated crossed
ribbon mesh (392 triangles), plus one core glow billboard. No lights, textures,
shared material writes or live geometry allocations are introduced. Model-local
anchors are sampled after the final mixer/additive pose and death grounding.
The Three-free `storm_arc_core.ts` writes caller-owned buffers and handles
vertical or coincident endpoints. Reduced motion freezes cosmetic movement;
anchors still follow animation. Near visibility, death fade and revival apply
to both draws. Disposal releases only their owned geometry/materials.
Stone adds no runtime effect draws.

Rebuild after the fire derivative:

```powershell
node scripts/anim/build_storm_stone_elementals.mjs
node scripts/assets/build_assets.mjs scripts/assets/specs/storm_stone_elementals.json
$env:KTX_BIN=(Resolve-Path tmp/ktx-software-4.4.2/bin).Path
node scripts/assets/compress_glb_textures.mjs public/models/creatures/storm_elemental_prototype.glb public/models/creatures/stone_elemental_prototype.glb
node scripts/build_media_manifest.mjs generate
```

The atlas builder pins the original source SHA256 and records it in GLB extras.
It accepts an optional path to `ktx.exe`; authoring defaults to temporary
KTX-Software 4.4.2. Original source assets are preserved.

Validation: 51 focused tests pass across both assets, ribbon math, ownership,
fire/ice/water regressions, island terrain, studio and authored materials.
Another 18 tinted-material lifecycle checks and the six render pure-core
architecture checks pass (75 tests total). TypeScript and production
build pass. Scoped Biome passes with one inherited non-null warning in the
weapon skin URL registry. `security:gate` passes (9,162 files, zero high findings).
`ci:changed` passes but selects zero files in this uncommitted continuation;
the explicit scoped Biome invocation provides the formatting/lint evidence.
The full `npm run gate` stops at i18n freshness because generated artifacts
differ from the staged/committed copies; no files were staged to bypass this.

Browser evidence under `docs/screenshots/storm-elemental/` and
`docs/screenshots/stone-elemental/` covers standard and low materials, front/back,
idle, movement, cast, channel and death. Both retain textured 9,712-triangle far
meshes. Storm death/revival and live clocks are checked. No page or shader errors
occurred in the preview captures. The real offline world also loads both
subjects on their authored dry pads: Storm_Idle with live visible arcs and
Stone_Idle, both opaque, without page errors. `island.png` and
`island-smoke.json` record the live-world checks for each variant.
The Vite log still reports the existing offline API proxy failures and a
`mob_training_dummy` prewarm asset miss; neither concerns these two prototypes.
The original Ignivar GLB SHA256 remains unchanged. These are visual smoke checks, not hardware
performance measurements. Fresh read-only render review found no blocking issues.

Verdict: **READY WITH NOTES** for isolated lab prototypes; full gate remains
blocked by the pre-existing staged-i18n freshness condition.
