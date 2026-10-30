# Native Smart Rig spider

The owner supplied `bible/models/mobs/comunity/spider.glb`, SHA-256
`3306d9b84af333472b29caaa8cb36483a7ff1c4d68db766a1aac28f268b06e9f`.
It contains a Smart Rig and no animation. The import preserves its geometry,
skin weights, bone names and original PBR maps. No rerig or simplification runs.
Source authorship/license information was not embedded; the import makes no
new claim about the community model's ownership.

`scripts/anim/blender_bake_smart_spider.py` authors native offline motion, using
the existing CC0 Quaternius spider as the motion reference. That reference is
`public/models/creatures/spider.glb`; the supplied Quaternius animal FBX archive
contains ungulates/canines but no spider. Its walk uses alternating tetrapods
over 0.833 seconds, little body bob, and its attack draws back, lifts the front
legs and strikes forward. The new clips follow that vocabulary on the supplied
anatomy. Its faster sprint is a separate cycle for the game's pursuit speeds.
No Quaternius bone rotations are copied onto anonymous Smart Rig joints.

The baked vocabulary is `Spider_Idle`, `Spider_CombatIdle`, `Spider_Walk`,
`Spider_Run`, `Spider_Bite`, `Spider_Lunge`, `Spider_Hit`, `Spider_Death`.
Six-segment offline FABRIK preserves each native leg length. Idle toes stay
planted, locomotion alternates supporting groups with foot clearance, and
death collapses the abdomen and folds the legs before holding a grounded pose.
All clips use the existing `VisualDef`/`ClipMap` path, with no runtime IK.

`VISUALS.mob_spider` replaces the living spider family, including existing
named/boss spiders, with the new body. Existing template scales, colors, combat
skills and loot remain authoritative. Eggs and egg sacs keep their separate
models. `dev_legacy_spider` retains the Quaternius reference lazily for review.
The new body's resting height is 0.85, chosen for its broad footprint rather
than copying the old model's tall bounding box.

Use `/dev lab` to rebuild the test island. `dev_smart_spider`, named
`Spider (Replaced)`, stands on the combat pad at x=836, z=48. It retaliates only
after damage and has no loot. The existing spider gallery row points to the
installed model beside that pad, without allocating another gallery row.

## Rebuild

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/anim/blender_bake_smart_spider.py
node scripts/assets/build_assets.mjs scripts/assets/specs/smart_spider.json
$env:KTX_BIN=(Resolve-Path tmp/ktx-software-4.4.2/bin).Path
node scripts/assets/compress_glb_textures.mjs public/models/creatures/smart_spider.glb
node scripts/build_media_manifest.mjs generate
```

The spec uses the geometry-safe `character` pipeline. Shipping geometry uses
Meshopt; textures use embedded KTX2/Basis at their original 2K resolution.
`tests/smart_spider_asset.test.ts` samples the shipping skin and clips, including
loop seams, support feet, forward strike/recovery, corpse ground clearance,
source fingerprint and family/egg dispatch. Screenshots and runtime evidence
live under `docs/screenshots/smart-spider/`.

## Validation

The scoped asset, lab, comparison, texture, preload, override and gait suites
pass. A further pursuit regression samples the shipping toe displacement with
the real playback limiter at the fastest existing spider speed. TypeScript,
production build and security scan pass. Browser evidence uses the real lab
spawn command and a production Widowsilk Spinner at speed 8.5: chase, both
attacks and death remain visible without page errors. Standard and low material
previews are included.

The shared full gate stops at i18n freshness (Git exit 129). `ci:changed` cannot
resolve the release base in this checkout. The broad character ClipMap suite
also reports pre-existing hunter field coverage, missing modular player clips,
foreign warlock-to-modular bindings and the old multipart NPC expectation;
none of its reported failures names the new spider. Those unrelated surfaces
were preserved. The architecture suite passes its other checks but its raw
control-byte check rejects existing CRLF source files across the checkout.
