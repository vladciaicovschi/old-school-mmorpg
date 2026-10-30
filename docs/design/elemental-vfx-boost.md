# Stronger elemental body effects

The current water, stone, lightning and death behavior is described in the
[feedback refinement](elemental-feedback-refinement.md). This page records the
earlier stronger-effects baseline.

The subsequent [helmet light pass](elemental-helmet-glow.md) adds a core-colored
visor glow to all five variants, with one additional owned draw each.

The five Heart of the End derivatives on `/dev lab` now have more visible
cosmetic effects. Their shipping GLBs, rigs, textures and animation clips are
unchanged by this pass.

| Variant | Change |
| --- | --- |
| Fire | Nine flame sockets instead of five; larger flames with stronger alpha; 128 sparks instead of 24, distributed around the whole body. |
| Ice | Nine larger centered mist clouds with softer, denser normal-blended fog; 112 falling frost particles instead of 24. |
| Water | Nine shorter flowing ribbon groups with an additional stream strand; 96 splash droplets instead of 24; stronger moving surface caustics and rim highlights. |
| Storm | 32 connections instead of 14, including front/back surface paths; threefold maximum ribbon width, nine segments per path and bright impulses travelling along each arc. Larger core glow. |
| Stone | New muted, normal-blended dust on nine animated sockets and 80 angular debris particles. No luminous dust or added lights. |

The water stream height and alpha were reduced after visual review of the
initial boost, while preserving the increased density and surface movement.
Mist remains translucent and the body silhouette stays readable.

All GPU objects are still constructed before the character compile gate.
Four variants use nine shared-geometry billboard draws and one Points draw;
water additionally retains its one shared-skin caustic overlay. Storm retains
two effect draws: one 1,152-triangle ribbon network and one core billboard.
Its dynamic position buffer is 41,472 bytes, allocated once. There are no new
lights, textures, framebuffer passes, skeletons or per-frame buffer allocations.
These are fixed budgets; browser captures are not hardware performance claims.

Reduced motion hides travelling particles and freezes shader/arc phases while
the sockets continue following the current model pose. Near visibility, death
fade, revival and exactly-once disposal remain covered by the owner lifecycle.
Tests additionally exercise stone dust cleanup and front/back arc offsets under
animated bone movement and a nonuniformly scaled/transformed model.

Validation: 71 focused tests pass across the effects, material lifecycle,
five assets, lab, studio and authored surfaces; six render pure-core guards
also pass. TypeScript, production build and scoped Biome pass (the manifest
retains its pre-existing weapon-skin non-null warning). `security:gate` passes
with zero high findings. `ci:changed` selects zero files in the uncommitted
continuation, so scoped Biome provides the actual lint coverage.
The full gate still stops at the existing staged/committed i18n freshness
comparison. No files were staged to bypass it. A fresh read-only render review
found no blocking resource, shader, coordinate or lifecycle issues.

Before/after, standard/low materials and animation evidence live under
`docs/screenshots/elemental-vfx-boost/<variant>/`. `before.png` preserves the prior
capture; the remaining files show this pass. Front/back and idle/move/cast/
channel/death captures are included, with runtime mesh/particle metadata.
All five subjects were also checked in the real offline world on their lab
pads, with no page errors. Live-world captures and metadata are `island.png`
and `island-smoke.json` in each variant directory. Storm's visible near-body
effects and advancing clock are confirmed after the editor camera settles;
checking immediately after a teleport can still observe the old camera's
far-LOD state. The test harness now waits for the camera change before asserting.
The offline Vite run retains the existing API-proxy warnings and training-dummy
prewarm miss, unrelated to the elemental effect paths.

Verdict: **READY WITH NOTES**, with the existing i18n freshness gate limitation.
