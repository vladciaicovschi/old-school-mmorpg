# Water elemental prototype

`/dev lab` adds **Water Elemental Prototype** (`dev_water_elemental`) at x=812,
z=-48, beside the ice/fire prototypes on the eastern row. Reload and re-enter
the lab to rebuild an older lineup. The subject is passive until damaged,
unarmed, has no loot, and is also available in the fitting/animation studio.

The derivative uses the staff-free fire rig and its corrected open-hand clips.
The original raid source and previous elemental variants remain intact. It keeps
the body topology, skin weights and bones. Three offline smoothing passes use
coincident-position and weight signatures, so UV seams stay together without
joining separate floating pieces or changing the skin buffers. Normals are
recomputed and the old stone normal, AO and metallic/roughness maps are removed.

The new teal atlas reduces baked relief contrast. An inner cyan emission mask
and alpha-blended surface make a translucent water body. Clearcoat and a water
IOR add standard-tier surface glints; the existing body roughness clamp remains.
Low tier uses Lambert but keeps opacity, depth state and the inner emission map.
This is alpha transparency with procedural highlights, not physical refraction;
there is no screen-space transmission pass or additional framebuffer.

`WaterSurfaceVfx` adds one owned caustic SkinnedMesh per body before the existing
whole-visual compile gate. It shares body geometry, the same Skeleton and bind
transform. The shader moves caustic bands and a restrained Fresnel highlight.
It never changes the shared body material, allocates a new skeleton texture,
or disposes shared geometry/bones. Five flowing ribbons and a droplet cloud use
the existing elemental effect lifecycle. Reduced motion freezes their clock
and hides particles; near/far visibility, death fade, reuse and cleanup apply
to the caustic overlay as well. All added effects are cosmetic, without lights.

Rebuild after the fire variant:

```powershell
node scripts/anim/build_water_elemental.mjs
node scripts/assets/build_assets.mjs scripts/assets/specs/water_elemental.json
$env:KTX_BIN=(Resolve-Path tmp/ktx-software-4.4.2/bin).Path
node scripts/assets/compress_glb_textures.mjs public/models/creatures/water_elemental_prototype.glb
node scripts/build_media_manifest.mjs generate
```

The builder accepts an optional path to `ktx.exe`; its default authoring tool is
KTX-Software 4.4.2 in the temporary tool directory. Shipping output uses meshopt
and KTX2. Tests cover the shipped rig/materials/clips, owner resource identity
and cleanup, VFX lifecycle, lab/terrain, studio and authored-surface contracts.
Headless screenshot evidence is visual smoke, not a hardware performance claim.

## Validation

Verdict: **READY WITH NOTES** for the isolated lab prototype. Fresh read-only
frontend/GPU/content review found no blocking issue, including the shared skin
ownership, static sort-sphere seed and combined effect-owner lifecycle.

- Focused Vitest run over water surface/asset, elemental VFX, fire/ice asset,
  lab/terrain, studio, authored-surface and tinted-material suites: 55 tests pass.
- `npx tsc --noEmit`: passes after generation of the new entity key.
- `npm run build` and the final `npm run build:bundle`: pass; the media manifest
  includes the new GLB. Original Ignivar source SHA-256 remains unchanged.
- Scoped Biome: passes with one inherited warning in the existing manifest
  helper. `npm run ci:changed` passes but checks zero files against its default
  base, so the explicit scoped check is the lint evidence.
- `npm run security:gate`: passes, no high findings after path priors.
- `npm run gate`: stops at the existing i18n freshness check because generated
  localization artifacts differ from staged/committed copies. Nothing was
  staged to bypass it; this is not a clean full-gate result.

`docs/screenshots/water-elemental/` contains standard/low front/back views,
locomotion/cast/channel/death silhouettes and a flow-frame comparison. Both
runtime captures have no page/GLSL errors, confirm the caustic overlay shares
body geometry and skeleton, preserve alpha 0.72 on Physical and Lambert, and
retain 9,712 triangles plus UVs in the far model. The source and overlay both
use seeded sort spheres; the overlay does not draw in shadows or the far model.
The offline `/dev lab` smoke confirms the water subject at its authored pad,
playing `Water_Idle` with a live caustic clock and the same geometry/skeleton
identity (`island-smoke.json`, `island.png`), without page errors.
