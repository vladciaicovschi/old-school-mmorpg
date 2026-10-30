# Imported body surface comparison (2026-10-25)

The screenshots use the actual offline test island and production material
derivation. The before pass restores the saved original `matte`/`authoredAtlas`
flags in the capture session. The after pass uses the edited manifest. No source
GLB, texture or gameplay state is modified for the surface comparison.

Retained paired captures:

- `low-town-before.png` / `low-town-after.png`: Lin and Brandt, low graphics;
  the uniform grey readability film becomes atlas-scaled shading.
- `day-medium-cultist-before.png` / `day-medium-cultist-after.png`: cultist,
  medium PBR, fixed solar noon.
- `day-medium-wolf-before.png` / `day-medium-wolf-after.png`: Wolf V2,
  medium PBR, fixed solar noon.

The target mixer is frozen between each pair. Camera framing and lighting are
the same within a pair; particles and background streaming are not frozen.
Nighttime medium and daytime Lin frames carrying the software-GPU notice were
discarded. The live Lin material measurements are still in the audit JSON.

`smoke.json` records the medium/low live material states. `day-smoke.json`
records the closer noon pass. Both report zero uncaught page errors. The medium
after materials use metalness 0, roughness 1, no metallic/roughness map, with
albedo and normal maps retained. Low Lin keeps its albedo and uses that atlas
for the emissive readability floor. PBR differences are restrained; low's grey
film change is visible. This is a SwiftShader smoke check, not a GPU benchmark.

116 focused material tests pass. The broader regression run has 83 passes and
four existing rogue/player/attachment expectation failures, reproduced with the
old material flags restored in isolated test processes. Types, client build and
security pass. Biome has one existing warning. The full gate stops at unstaged
generated-i18n freshness. Full commands, scope and limits are in
`docs/design/imported-body-materials.md`; logs and capture scripts are under
`tmp/model-matte/`.
