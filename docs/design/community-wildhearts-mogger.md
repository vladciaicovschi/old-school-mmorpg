# Community Wildhearts and Mogger import

Owner-supplied model replacement, 2026-10-28. The original archives under
`bible/models/mobs/comunity` remain unchanged. No paid generation or new runtime
dependency is used. Production template IDs, health, damage, loot, speeds, scale,
mechanic timing and heroic tuning are preserved.

## Role assignment

| Existing identity | Source body | Equipped prop | Combat motion |
|---|---|---|---|
| Vineclaw Stalker | `silent8` | Stone-tipped spear | `Wildheart_SpearThrow` |
| Bloodmane Ravager | `silent1` | Savage axe | `Wildheart_Attack` |
| Sunbone Hexcaller | `silent4` | Free hands | `Wildheart_Cast / Heal` |
| Fanglord Beastmaster | `silent6` | Ancient ram spear | `Wildheart_Attack / support / quake` |
| Zulgar, Voice of the Basin | `cycle8` | Free hands | `Wildheart_Attack / Pulse` |

Mogger uses the separate `community_mogger.glb` body, never the generic Bruiser.
Other Bruisers and Mogger Lackeys retain their current models. Its native slam
supplies full `Mogger_Cast` and `Mogger_GroundPound` studio clips plus the short
`Mogger_GroundPoundRelease` used by the existing instant Ground Pound. The latter
starts just before hand contact and recovers to idle. `Mogger_Order` uses a planted,
forward-facing upper-body call for Bracing Order.

Both difficulties resolve the same replacement visual keys. Old Wildheart rigs
are retained as lazy `dev_legacy_wildheart_*` definitions and keep their original
donor contracts. They are not the production fallback for replaced identities.

## Native assets and motion

`blender_build_wildhearts.py` preserves each source mesh, native Smart Rig and
weights. Evaluated donor poses are transferred through the target rest axes,
including the different A/T stance alignment. Additional native bone chains stay
with their own parents. Source deaths and the female model's full ground slam are
retained; missing idle, travel, melee, reaction, magic and healing motion use
existing project troll and Pro Magic donors. All motions are baked on one final
skeleton, with closed loops, removed horizontal root travel and grounded death.

The Stalker spear throw and optional Ravager axe throw are locally authored:
overarm windup, torso turn, lead-foot contact, wrist release and follow-through.
Release is at 0.55 seconds for the spear and 0.62 seconds for the optional axe.
Shipping weapon axes point forward along +Z at both release frames, about ten
degrees upward. Ravager stays a melee enemy; the axe throw is a studio/future
motion, not a new ranged ability. `ClipMap.studioClips` exposes bonus motions
without selecting them for automatic combat.

Two source skins stretch long hair under very wide swings. Ravager and Beastmaster
therefore use a smaller, low-handed sweep, retaining the native skin instead of
re-weighting it. This remains a source limitation for future exaggerated poses.

All family gait thresholds use runEnter=3.5/runExit=3.0, so ordinary patrol movement
selects Walk. The two largest models have slower walk cycles to avoid the runtime's
minimum playback clamp making their feet outrun their body. Tests measure normal
and heroic patrol/chase speed through the real gait and playback functions.

## Surface and weapon treatment

Bodies use authored atlases and the shared matte material path, with no uniform
entity tint. Small HSV saturation reductions tame bright tattoo pigments while
retaining skin, bone and leather shading. Original images and UVs are unchanged.
The Guide model adapter forwards matte and final native hand transforms to owned
clones, leaving shared source materials and textures intact. Existing Guide
bestiary/dungeon filtering is preserved; this does not add spoiler model entries.

Seven supplied tribal weapons are installed under `models/weapons/community_tribal`.
All are static, grip-origin meshes with a +Y shipping long axis. High-detail static
meshes are reduced to the offline weapon budget; rigged bodies are never simplified.
The final weapon surfaces are diffuse, with original color/normal detail and no
Meshy metallic film. Original roughness/metallic maps remain in their source ZIPs.
Weapons used now: stone-tipped spear, savage axe, ancient ram spear. Arcanum axe,
primitive spear, stone axe and wooden club are available for later assignments.
Native hand fits for the three equipped bodies are available to the existing
weapon fitting studio and its save boundary.

## Cue integration and testing island

`src/sim/community_mob_animation_ids.ts` adds stable presentation IDs only to the
existing nova cues of these templates and their passive lab copies. No RNG draw,
event count, damage calculation or cooldown changes. Ground Pound, Beast Pit Quake
and Wildheart Pulse take priority over coincident support gestures. Their physical
damage and concurrent melee cannot restart a generic swing over the release.

`/dev lab` displays the five Wildheart replacements at their existing rows.
Mogger is next to the original ogre combat pad. These are passive-until-pulled
copies, labelled Replaced, using the original kits and sizes. Lab copies have no
loot or add summons to keep tests isolated; production encounters retain both.

## Source seals

| Body | Source SHA256 | Native joints | Native triangles |
|---|---|---:|---:|
| cycle8 | `5b85871d6f22fc2bcf8bf2d9fef0f3abee101199e4bc55765ae57275b9986d2c` | 82 | 103884 |
| silent1 | `c8cff32fa402626f47a1b6c4995d7255f5a75fbd743e1ce6ba97ef426ae2803c` | 83 | 103812 |
| silent4 | `65763de144403e09da7f2c2d0a01c0e9f16cd50dc44d2e23be6d7b77e312778e` | 85 | 103557 |
| silent6 | `3f494a60844f768a242d9ddd18d511610f24d04c2b9673ec1fe83037c26f598d` | 66 | 103911 |
| silent8 | `f240975c2e5e2d31d0c454f3b29040fbeadd1f2c5a66b1e3761ed0d6ded5cadf` | 28 | 104034 |
| Mogger | `fd269fd0cb9685b65751a8ee6ae6196c780adc3ca8df178d695a30087e757e66` | 24 | 19110 |

| Weapon | Source SHA256 |
|---|---|
| ancient_ram_spear | `fb55e1186c302da1863b4c6f0793cd061fc33243063131b4375231ebe9bcf30e` |
| arcanum_axe | `f96133f1eda210e93d3d2a564627af1b0c125c0735bd0bf8aa09215dbf6eac80` |
| primitive_spear | `744b5aced4989156bfa8373a4cff49be175678501d113690fb2e4a2b111c040e` |
| savage_axe | `0ed7b1ea949041b9cbd83f7a3e42274ebae402cba14d6eb375f7b42af741c08e` |
| stone_axe | `64bf122015eed9eccf1d938e8a850353d7106507a92cc577073adeeb028f7fcc` |
| stone_tipped_spear | `1e448d52ca0060ea1e2db504c71bf166b3a1c4e939b932851ac9e45860b1d9cf` |
| wooden_club | `a5818bcf415ff0f980b929fca41f29f82b65c814db309e33ba8343cebe6f5fca` |

## Rebuild and evidence

Authoring scripts:

- `scripts/anim/blender_build_wildhearts.py`
- `scripts/anim/blender_build_community_mogger.py`
- `scripts/assets/export_community_tribal_weapons.py`

Run Blender 5.2 headless with `--threads 4`; point TEMP/TMP at a task folder under
`tmp`. Then run `scripts/assets/build_assets.mjs` with the corresponding
`community_wildhearts.json`, `community_mogger.json` and
`community_tribal_weapons.json` specs. Finish with the scoped
`compress_glb_textures.mjs` step, KTX_BIN pointing to the local KTX tools, and
`npm run build`. Shipping meshes use Meshopt and embedded KTX2 textures.

Regression suites: `community_wildhearts_asset`, `community_mogger_asset`,
`community_tribal_weapons`, `community_mob_animation_events`, `clip_names_core`,
`guide_spirit_materials` and `dev_model_comparisons`. The focused final run passes
109 tests, including source seals, native geometry, bound clips, grounded held
corpses, actual patrol/chase cadence, guide ownership and coincident cue priority.
Legacy Wildheart donor tests still protect their retained comparison definitions.

`docs/screenshots/wildheart-rollout` contains original/replacement views, standard
and low material captures, attack/throw/cast/death frames, runtime facts and real
Sim combat evidence routed through `Renderer.handleEvent`. All six identities land
hits and finish their own death; the recorded supported mechanics trigger their
named clips. The evidence harness stubs decorative VFX, not combat or animation
dispatch, and only accelerates initial mechanic timers in that harness.

Repository-wide QA notes: full gate stops at the existing i18n freshness Git
exit 129; ci:changed cannot resolve a release base. Broader visual tests retain
unrelated player motion/tint failures and older spirit/spider material inventory
mismatches. The scoped import must not be represented as a clean full-repo gate.

Final verification: TypeScript, scoped Biome and production build exit 0. The five simulation architecture checks pass. Security scan reports zero high findings. All thirteen supplied source archive hashes are unchanged. Fresh independent review found one mechanic-priority conflict, fixed and pinned by a failing-then-passing regression. Final browser captures and combat logs contain no page errors.
