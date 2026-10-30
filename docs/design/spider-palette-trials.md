# Spider color and size trials

The test island displays the original spider beside five appearance trials.
They share `public/models/creatures/smart_spider.glb`, its rig, animations,
geometry and original compressed PBR maps. The source GLB is unchanged.

`src/render/characters/spider_palettes.ts` defines independent shell and accent
selectors for the existing selective atlas dye shader. The broad shell selector
covers low-saturation dark texels; the narrow violet selector recolors eyes and
fissures. Original shading/detail stays in the sampled texture. This uses the
same bounded material cache and standard/Lambert/effect clone hooks as the troll
trials, without a new shader system or copied texture assets.

| Trial | Shell | Accents | Relative size | Island position x,z |
|---|---|---|---|---|
| Original | Charcoal | Violet | 100% | 844,40 |
| Forest | Moss green | Amber | 90% | 828,40 |
| Sand | Ochre | Orange | 80% | 828,48 |
| Marsh | Dark green | Bright green | 105% | 828,56 |
| Frost | Pale blue | Cyan | 110% | 836,56 |
| Broodmother | Dark red-brown | Red | 130% | 844,56 |

The original combat subject remains at 836,48. Use `/dev lab` after reloading
the client to rebuild the lineup. The five color trials now spawn as passive
combat mobs instead of their preview mannequins, with the transferred kits
documented in `docs/design/spider-lab-combat-kits.md`. They do not replace any
production mob appearances yet.
The gallery's `labOffset` places them inside the reserved spider pad, without
consuming additional general gallery floor cells or moving the troll trials.

Each visual scales `height`, `walkRef` and `runRef` together, sharing the
installed clip map. Only static, explicit `npc_dev_spider_*` keys can select the
trial appearances, via explicit gallery or dev mob identities. The base
`mob_spider` palette and all world dispatch remain unchanged.

Verification: `tests/spider_palettes.test.ts` covers palette/scale contracts,
source/clip sharing, production exclusion and exact separated gallery placement.
The existing troll tests cover dye clone isolation and standard/low tier hooks;
the spider asset tests continue to cover animation and skin integrity. Browser
captures in `docs/screenshots/spider-palettes/` show every appearance on standard
and low graphics, with material/rule inventory in `runtime.json`.

QA results: the scoped palette/asset/gallery/dye suites pass (34 tests), and lab,
preload, override and gait regressions pass (39 tests). TypeScript, production
build and security scan pass. Biome has no errors. The full gate stops at the
existing i18n freshness Git failure (exit 129); `ci:changed` cannot resolve a
release base in this checkout. Read-only frontend/coverage review found no
remaining scoped defects. Browser inventory shows the original and all trials
visible on both material tiers, with no page errors.
