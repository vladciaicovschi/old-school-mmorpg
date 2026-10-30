# Elemental gallery links — 2026-10-24

The offline Chrome/SwiftShader smoke rebuilt `/dev lab` twice and verified:

- 237 owner-scoped subjects on both rebuilds; 205 gallery bodies, 156 missing.
- Exactly one new gallery body per element: stone, fire, ice, water and storm.
- Each live body resolves to its matching `npc_dev_*_elemental` visual and is ready.
- Zero old elemental gallery bodies; zero uncaught page errors.

`smoke.json` records exact identities, counts and coordinates. The inspected
`stone-water.png` and `fire-storm.png` captures show the actual loaded scene and
readable replacement labels beside the combat prototypes. No loading curtain
was hidden to obtain these captures.

The console still contains the existing unrelated training-dummy preload error
and unavailable localhost API proxy messages. They do not affect these models.
This is a visual smoke check, not a GPU performance benchmark.

Focused checks: 72 tests pass, three existing skips; three command tests selected
with `--testNamePattern 'lab'` pass. TypeScript, client build, localization/wiki
generation and security pass. Scoped Biome has three existing command-test
warnings. `npm run gate` stops at unstaged generated-i18n freshness differences.
Logs and the repeatable capture script are in `tmp/lab-elemental-links/`.
