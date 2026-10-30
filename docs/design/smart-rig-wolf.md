# Smart Rig wolf test import

The owner-supplied `bible/models/mobs/animals/wolf.glb` is a 43-joint Smart Rig
wolf without animation. Its source SHA-256 is
`27137214a7002978b3c8400bc213a0b37a92b038cbfd63ac6bb1ad9b5bcd7a2d`.
The shipped `public/models/creatures/smart_wolf.glb` preserves the original
103,959 triangles and three PBR maps. Skin weights retain the native rig, with
a local correction separating the upper muzzle from the jaw and ear controls.
Meshopt geometry and 2048px
KTX2 textures keep the animated asset within the native creature size budget.

## Authored motions

| Clips | Motion |
| --- | --- |
| Wolf_Idle / Wolf_CombatIdle | Breathing and an alert lower stance with planted paws |
| Wolf_Walk | Four-beat walk with paw recovery and weight transfer |
| Wolf_Trot | Diagonal pairs; available in the preview studio |
| Wolf_Run | Gallop with hind-leg propulsion and front-leg reception |
| Wolf_BiteLeft / Wolf_BiteRight | Side-specific preparation, jaw snap and body reach |
| Wolf_Lunge | Stronger forward bite with both front paws lifting |
| Wolf_Hit | Brief supported recoil |
| Wolf_Death | Flank collapse with a held final pose |
| Wolf_Howl | Head raise and jaw opening, bound to the existing roar emote |
| Wolf_AlertLook | Head turn, ear movement and tail response |

`scripts/anim/blender_bake_smart_wolf.py` authors the native rig at 60 fps.
Three-segment offline limb solving preserves the digitigrade hocks and paw
orientation, with fixed anatomical bend planes. No runtime IK or humanoid
retargeting is used. Support velocities determine the walk/run reference
speeds; foot pitches are restricted to swing. The death pass measures the
evaluated skinned mesh against the floor. The original source remains untouched.

## Integration

The developer model island (`/devlab`) places `dev_smart_wolf` at `(812, 24)`
beside the existing animal subjects. It inherits the isolated stationary,
direct-damage-only, no-loot test policy. The weapon-fit studio also includes it.
Runtime movement uses walk and run; trot is a presentation preview. Attacks
choose randomly through the existing dispatcher: left bite 40%, right bite
40%, lunge 20%. Consecutive repetitions are allowed. This cosmetic choice
does not consume the simulation's combat RNG.

The accepted bear attacks and movement are unchanged by this addition. A later
flank-collapse adjustment lets the upper front and hind paws soften down under
gravity after the torso falls, with a delayed wrist release. The same correction
applies to the bear's death pose. See
[death-pose evidence](../screenshots/quadruped-death/verification.md).

## Rebuild and evidence

From the worktree, run the baker with Blender, followed by:

```powershell
node scripts/assets/build_assets.mjs scripts/assets/specs/smart_wolf.json
# Set KTX_BIN to the installed KTX Software bin directory.
node scripts/assets/compress_glb_textures.mjs public/models/creatures/smart_wolf.glb
node scripts/build_media_manifest.mjs generate
npm run i18n:gen
```

`tests/smart_wolf_asset.test.ts` checks topology, provenance, compression,
bindings, loop seams, paw clearance and continuity, cadence, bite reach/jaw
timing, recovery, floor contact, death settlement and island registration.
See [verification](../screenshots/smart-rig-wolf/verification.md) for check
outcomes and [overview](../screenshots/smart-rig-wolf/overview.png) for poses.

The motion-flow revision uses the owner's Quaternius wolf as a reference for
timing, front-foot bracing and weight transfer. Native walk/trot/gallop strides
are broader, scapulae articulate, the neck and tail follow the trunk with a delay,
and bites include a lifted front step and longer recovery. Both relaxed death
clips remain exactly as accepted. See
[reference and native authoring](animal-motion-reference.md) and the newer
[before/after evidence](../screenshots/animal-motion-flow/verification.md).

The subsequent contact revision levels the muzzle through the upper neck during
all bites and releases it after the chest starts returning. See the newer
[contact comparison](../screenshots/animal-contact/verification.md).

`scripts/anim/repair_smart_wolf_muzzle.mjs` fixes the source's upper muzzle weights
after the baker exports. The nose cap remains attached to the skull, with smooth
transitions above the lower lip and into the cheeks. The source mesh positions,
topology, UVs, textures, bind matrices and all animation channels stay unchanged.
The operation is idempotent and also accepts the final compressed GLB. See
[nose deformation evidence](../screenshots/wolf-nose/verification.md).
