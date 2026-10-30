# Supplied native Warden, Treant Warrior and Verdant Golem

The source packages remain unchanged under `bible/models/mobs/comunity`.
`scripts/anim/blender_import_community_native.py` and its three thin model entry
points rebuild the derivatives. The geometry-safe specs use Meshopt followed by
scoped KTX2 compression, with maps limited to 2048. Source geometry, skin weights,
UVs and original maps are retained. Runtime surfaces use the matte authored-atlas
path in standard and low graphics.

| Model | Source archive SHA256 | Joints | Triangles | Supplied clips |
| --- | --- | --- | --- | --- |
| Wreck Warden | `633f7cf05452dc630b3ebab366f069b8014f7307534ec624d2f7e1f903a76ca8` | 62 | 103815 | 14 |
| Treant Warrior | `fe3fe7b7b59941a61379a535e9f77b9da1b75b551a9af4263066431df1e16cea` | 28 | 169831 | 11 |
| Verdant Golem | `5103fcb35755e29f2d181ddc3dd01dd78b7c7dc1d3d43a546460a5925cfe5279` | 50 | 103886 | 11 + 9 supplemental |

## Runtime scope

`the_wreck_warden` uses `mob_wreck_warden`. Its original physical melee kit is
unchanged. Its neutral stance is Axe Breathe and Look Around; Alert is combat
idle. The forward shove is the default unarmed strike. The large-turn hook and
weapon combinations remain editor extras.

Treant Warrior is a separate test-island variety, `dev_treant_warrior`, using
`mob_treant_warrior`. Existing Treant V2 and production treant mappings remain
unchanged. Idle 11 and Idle 5 provide its neutral and combat stances, with a
forward shove for melee. The full native abdominal-injury death is retained.

`ancient_guardian` and `waking_warden` use the Verdant Golem body with separate
gait reference speeds for their existing entity scales. Stoneskin, the boss's
Sundering Toll and enrage remain unchanged. Their passive combat trial copies
are beside the bear pad, marked Replaced. Warden and Treant Warrior trials are
beside the ogre and Treant V2 pads respectively.

The shared golem atlas has two reversible selective palettes. Ancient Guardian
uses cooler blue-grey stone with green fissures; Waking Warden uses warmer dark
stone with amber fissures. The source maps and mesh remain shared. The palette
also applies on low graphics and is covered by `tests/verdant_golem_palettes.test.ts`.

## Golem supplemental motion

The `(1).zip` package, SHA256
`6c307ea404bac7f95c1ac2a0eb37462ce77db0953061249aa542df23e2a77ad8`,
supplies Idle 5 on the exact same 50-bone hierarchy, rest matrices, mesh and
weights. It transfers directly and serves as combat idle.

The `additional animations.zip` package, SHA256
`baf6a33ca3cd0dbd91a6e722e15178f0af06a3312afff6f60581bd050a105b4a`,
has a different 23-bone rig and a small preview mesh. Only its motion transfers
to the main 50-bone body, using evaluated world poses and rest-space rotations.
The small donor mesh is discarded. Alert is neutral idle, Slow Orc Walk is
the heavy walk, and Attack supplies the overhead unarmed strike. Attack plays
at 1.4 times source speed to fit the existing melee cadence. Casual Walk and
the other supplied actions remain available in the animation editor.

## Animation rules and verification

All supplied actions are exposed through `studioClips`. No Hit reaction is
present in these packages, so none is generated or mapped. Horizontal root
travel is removed, travel cadence follows measured stance-foot speed, and
loops close offline. Deaths retain their full source fall followed by a corpse
hold. Airborne kicks retain positive height rather than being flattened.

`tests/community_native_ancients.test.ts` checks source seals, unchanged
topology, all action bindings and editor availability, loop closure, actual
scaled locomotion cadence, grounded complete deaths and replacement scope.
`tests/dev_model_comparisons.test.ts` checks gallery availability and placement.
Browser evidence is under `docs/screenshots/community-native-imports`.
Source inventories, bake reports and QA logs are under
`tmp/community-native-clips`.
