# Loading artwork refresh

Historical delivery record, 2026-10-13. The shipping images and runtime catalog remain the source of truth.

Repainted all 11 active `public/textures/loading/*.webp` backgrounds and the legacy
`public/loading-screen.jpg` using built-in OpenAI image generation with local project-owned
references. The imagegen skill guided reference-based repainting, visual review and optimized
export. No image-generation API or CLI fallback was used.

The [complete final prompt and ordered reference set](loading-art-refresh.json) records each
asset separately. Art direction follows [the project style guide](nhance-inspired-asset-style-guide.md):
natural adult T1 character proportions, broad readable forms, hand-painted PBR materials,
restrained magic and coherent cloth/leather/steel/wood. Scene layouts remain recognizable.
All active illustrations omit baked text, logos and loading UI. The standalone legacy plate
retains its parchment center and edge portraits.

## Delivery

- Active files: 1600x900 opaque sRGB WebP, 159,496 to 276,838 bytes.
- Legacy file: 1538x1023 opaque sRGB JPEG, 309,037 bytes.
- Existing filenames, catalog, rotation logic and overlay CSS are unchanged.
- Production content-hashed URLs were regenerated with `node scripts/build_media_manifest.mjs generate`.
- Source attribution is maintained in the loading-art row of `CREDITS.md`.

Local working material, outside the shipping public tree and not versioned:

- `tmp/loading-art-refresh/originals/`: pre-refresh backups of all 12 images.
- `tmp/loading-art-refresh/masters/`: selected full-resolution generated PNGs.
- `tmp/loading-art-refresh/contact-sheet.jpg`: overview of the 11 compressed active images.
- `tmp/loading-art-refresh/export-report.json`: export sizes, settings and old/new SHA-256 hashes.
- `tmp/loading-art-refresh/export.mjs`: batch conversion used for this delivery. It validates
  every output before replacing shipping files; rerunning requires the local masters and backups.

The prompt record references the maintainer's sibling `../bible` concept library; it does not
claim these local PNGs or historical originals are part of a clean checkout.

## Verification

- `npx vitest run tests/loading_backdrop_core.test.ts tests/client_shell.test.ts tests/server_unavailable.test.ts --maxWorkers=2`: 3 suites, 128 tests passed.
- `npm run check:ts`: passed.
- `npm run security:gate`: passed, 8,975 files, zero high findings after priors.
- `npx biome check --write tests/loading_backdrop_core.test.ts docs/design/loading-art-refresh.json`: passed after formatting.
- `node scripts/gate_select.mjs`: stopped at existing `i18n freshness` differences from prior uncommitted work.
- `npm run build:bundle`: stopped at the existing missing `__I18N_LOCALE_CHUNKS__` sentinel in `index.html`.

The image test now decodes every file, checks format/dimensions/opacity/color space and
distinct bytes, and proves that each manifest hash matches the current image contents.
The pre-existing catalog/existence/size/rotation tests remain intact. A fresh read-only frontend
review found no actionable issues. All compressed images were visually reviewed locally.

Browser validation is deliberately left to the maintainer as requested: check background
cover cropping and loading text/progress contrast on desktop and narrow/mobile screens.
No browser was launched for this task. A green full-repository gate is not claimed.

## Handedness follow-up, 2026-10-13

The maintainer requested a check of weapon hands. The foreground warrior in
`hollow-crypt-party.webp` had the shield beside his sword arm; the warrior in
`eastbrook-mine-duel.webp` had sword and shield reversed. Both were corrected with
built-in image generation as localized precise-object edits: sword in the character's
anatomical right hand, shield on the left forearm. The compressed shipping images were
visually rechecked, including all three skeleton warriors in the crypt. Other armed
scenes (town square, Fenbridge arrival, caldera and legacy portraits) needed no changes.

The final correction prompts and inputs are recorded under `handednessCorrection` in
the JSON prompt set. Pre-correction masters/WebPs and the earlier export report are
retained locally in `tmp/loading-art-refresh/before-hand-correction/`. Hash comparison
of the two export reports proves that only these two shipping images changed.
The contact sheet and media manifest were refreshed. Both corrected WebPs remain
1600x900, opaque, sRGB and below 300 KB (169,656 and 216,926 bytes respectively).

`npx vitest run tests/loading_backdrop_core.test.ts --maxWorkers=2`: 5 tests passed.
`npx biome check docs/design/loading-art-refresh.json`: passed. Browser checks remain
with the maintainer. No gameplay/runtime code or dependency changes were required.

The maintainer then requested an active shield block in the kobold scene. A second
localized built-in image edit rotated the warrior into a three-quarter front view,
with the left-arm shield raised between his head/chest and the kobold's pickaxe and
the right-hand sword held back for a counterattack. This supersedes the first mine-duel
handedness-only pose. The final WebP is 226,412 bytes; other images are unchanged from
the handedness follow-up. Its final prompt is under `koboldGuardCorrection`; the
intermediate pose is backed up locally in `tmp/loading-art-refresh/before-kobold-guard/`.
The compressed final image was visually checked, the manifest/contact sheet refreshed,
and all 5 loading-backdrop tests passed again. The repeated selective gate still stops
at the pre-existing i18n freshness differences, before any browser step.
