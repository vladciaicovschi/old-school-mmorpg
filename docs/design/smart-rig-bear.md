# Smart Rig bear test import

The owner supplied `bible/models/mobs/animals/bear.glb` with a 34-joint Meshy
Smart Rig and no animations. `public/models/creatures/smart_bear.glb` preserves
the original skin weights, 103,783 triangles and PBR material. Texture maps are
finalized at 2048 pixels with Meshopt geometry and KTX2 textures. The original
source remains untouched in the Bible.

## Motions

| Clip | Purpose |
| --- | --- |
| Bear_Idle | Breathing with all four paws planted |
| Bear_CombatIdle | Lower, alert stance |
| Bear_Walk | Four-beat walk with rolling weight transfer and lifted paw recovery |
| Bear_Run | Gallop with a hind-leg push and fore-leg reception |
| Bear_SwipeLeft / Bear_SwipeRight | High outside windup, fast diagonal rake, follow-through and paw replacement |
| Bear_DoubleSlam | Crouch, rear onto both hind paws, then rake down with both front paws |
| Bear_Hit | Short recoil with support paws planted |
| Bear_Death | Collapse onto the flank and remain down |
| Bear_Roar | Head/chest raise for the existing roar emote preview |

These are locally authored animal motions, not downloaded mocap.
`scripts/anim/blender_bake_smart_bear.py` maps the anonymous bones using their
actual positions and solves the paw targets offline. There is no runtime IK,
new animation dispatcher, rerig or transfer of humanoid animations.

Fixed knee/elbow bend planes prevent flips as limbs extend. Foot pitches are
limited to the airborne part of the stride. The death authoring pass measures
the evaluated skinned mesh against the floor before baking each pose. Gait
reference speeds use actual paw velocity during support, including the stance
fraction, rather than total stride divided by cycle duration.

The expressive-motion revision gives both swipes a slow, high outside windup
through phase 0.32, a rounded diagonal sweep through phase 0.62,
and a slower follow-through before replanting the paw. Each segment uses a
cubic curve, so the main sweep has no intermediate stop. Forward reach and
body lunge are reduced; the elbow opens outward, the shoulder turns across,
and the wrist turns the claws along the arc. A counter-turn of the head
reinforces the weight transfer. The other
three paws remain planted throughout the clip. The walk raises airborne paws
to 0.20 source units, adds a small outside recovery arc, and rolls the trunk
over its supports with opposing shoulder/head movement. The gallop gets more
visible compression and shoulder movement. Clip durations, support stride
speeds and runtime walkRef/runRef remain unchanged.

The attack rotation uses the existing per-instance sequence: left, right,
left, right, double slam, then repeat. The 1.2-second double slam transfers
weight backwards, lifts and tilts the chest with both hind paws fixed, pauses
briefly at the top, then drives both front paws forward and down together.
It returns to the same four-paw support pose. This only changes presentation;
combat damage, attack cadence and hit resolution keep their existing rules.

## Rebuild

Run from the project root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python-exit-code 1 --python scripts/anim/blender_bake_smart_bear.py
node scripts/assets/build_assets.mjs scripts/assets/specs/smart_bear.json
$env:KTX_BIN = (Resolve-Path tmp/ktx-software-4.4.2/bin).Path
node scripts/assets/compress_glb_textures.mjs public/models/creatures/smart_bear.glb
node scripts/build_media_manifest.mjs generate
```

The Blender output under `tmp/asset_src/animals/smart_bear/` is also a full-rig
preview with all ten clips. The adjacent report records source provenance,
gait parameters and the maximum unreachable IK target correction.

## Test in the game

Reload and run `/dev lab`. `dev_smart_bear` occupies the free combat pad at
world position **788, 24**. It stays idle until directly attacked, then uses
normal movement, threat, attacks, hit reactions and death. Existing production
bear templates are unchanged. Re-running `/dev lab` rebuilds the lab subjects.

The existing model/weapon fitting studio includes `Smart Rig Bear`, with an
unarmed default loadout and all ten clips available for animation preview.

## Verification

`tests/smart_bear_asset.test.ts` checks the shipped skin/mesh and compressed
textures, target bindings and unit quaternions, loop seams, idle support,
four-paw locomotion, motion continuity, support velocity versus playback refs,
three-paw support throughout a swipe, high diagonal rake direction on both
sides, visible walk clearance and body weight shift, intermediate elbow/knee
continuity, and actual deformed mesh vertices during death.
The lab and studio tests cover registration, direct-pull policy, dry/collider-free
placement and preview coverage. Warlock motion tests guard the shared offline
pose helper after it was generalized to rigs without Mixamo hands.

Evidence for the revised motions through the real `CharacterVisual` controller
and original materials is in `docs/screenshots/smart-rig-bear/expressive-motion/`:
`before-after.png` compares the poses, `walk.gif` and `swipe.gif` show complete
cycles at authored cadence, and `runtime.json` records playback and recovery.
The original first-pass screenshots remain in the parent directory.

The initial runtime check confirms idle, running, both single-paw clips available,
recovery back to idle and a held corpse. The three expressive-motion assertions
failed on the original asset and pass on the rebuilt one. The selective gate
stops at pre-existing i18n freshness differences in this working tree. The
global `character_clipmaps` suite also reports existing unrelated hunter,
paladin, modular-rig and multipart-NPC mismatches; none names the bear.

Revision validation: seven focused suites pass (115 tests), `npx tsc --noEmit`
passes, the Vite production bundle builds, scoped Biome passes, and the malware
gate passes. Exact commands and limits are recorded in
`docs/screenshots/smart-rig-bear/expressive-motion/verification.md`.

The double-slam follow-up adds a tenth clip. Its evidence is in
`docs/screenshots/smart-rig-bear/double-slam/`: `slam.gif` shows the complete
1.2-second motion with the whole rear-up silhouette in frame; `rear-up.png`
and `release.png` are key poses. `runtime.json` records ten real `playAttack`
calls and asserts the left/right/left/right/double sequence twice, without
browser errors. Eight focused suites pass (134 tests), including raised chest,
paired paw travel, hind support, limb continuity, recovery and actual skinned
mesh floor clearance for the new slam.

The rounded-swipe pass keeps the same ten clips, attack rotation and durations.
`docs/screenshots/smart-rig-bear/rounded-swipes/` contains both revised paw
animations (`left.gif`, `right.gif`), the prior right swipe (`before.gif`),
and windup/arc/follow-through stills. Eight focused suites pass (136 tests),
including continuous limb travel, a bowed cross-body trajectory and no pause
in the central sweep. Exact validation commands and limits are in that
folder's `verification.md`.

The flat-paw adjustment rolls the active wrist inward by 30 degrees around
its turned longitudinal axis during the main sweep, then levels it before
replanting. Both sides are mirrored. Evidence and validation are in
`docs/screenshots/smart-rig-bear/flat-paw/`; the rounded trajectory, cadence,
and the other eight clips retain their preceding authoring.

The rounded-double pass keeps both accepted single-paw clips exactly as
authored, including the mirrored flat-paw turn. The double strike opens both
paws outside the shoulders, briefly loads at the top, then sweeps down and
inward on cubic arcs during phases 0.44 to 0.68. The chest follows the same
timing. Both wrists turn their broad undersides into contact and level before
replanting. The clip still lasts 1.2 seconds and retains fixed hind supports.
Evidence is in `docs/screenshots/smart-rig-bear/rounded-double/`.

The later double-reach trial was reverted at the owner's request because
it visibly expanded the belly during rearing. The shipped asset and baker
are restored to the accepted rounded-double version above, including its
phase 0.68 strike timing. The rejected trial's evidence remains under
`docs/screenshots/smart-rig-bear/double-reach/` for reference only.

The flank-collapse correction releases the upper front and hind legs after
the body rolls, with a soft joint bend and delayed wrist relaxation. It changes
only `Bear_Death`; the accepted attack and gait channels retain exactly their
previous values. See [death-pose evidence](../screenshots/quadruped-death/verification.md).

The later motion-flow pass matches strike/recovery tangents, keeping the paw
moving through follow-through rather than stopping at each segment boundary.
Support-matched swing curves soften contact, and the trunk/head counterbalance
with small phase offsets. The accepted rounded diagonal shape and flat wrist
presentation remain; death poses are preserved exactly. See
[motion reference and authoring](animal-motion-reference.md).
