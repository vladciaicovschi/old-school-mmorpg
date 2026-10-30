# Fire elemental prototype

`/dev lab` creates **Fire Elemental Prototype** (`dev_fire_elemental`) on the
eastern combat pad at x=812, z=0. It is passive until damaged, unarmed, and also
available in the model/weapon fitting studio for clip playback. Re-enter the lab
after reloading to rebuild an existing lineup.

This is a first fire variant of Heart of the End, not a global elemental rollout.
The raid continues to use the untouched `ignivar_ashcaller.glb`.

The derivative removes the separate 958-triangle staff primitive before runtime
LOD/shadow baking. It retains the 9,712-triangle body, all 51 joints and floating
stones. Its painted atlas becomes charcoal basalt, with a separate emissive map
for the original orange fissures/core. It has no new point lights. Five owned
bone-attached fire billboards and 24 rising embers animate independently, stop
moving under reduced motion, hide with the near rig, fade on death, and restore
on reuse. Static fissures remain emissive on the corpse and far mesh.

`Fire_Idle` and `Fire_Move` retain the source torso/stone motion and lower the
staff arm using the mirrored relaxed arm. Cast, ChannelStart, Channel and Death
remain source clips; this prototype's retaliation uses Cast at natural speed.
All six clips remain in the GLB; the mapped clips appear in the studio.

Rebuild from the pinned shipped source (no source deletion):

```powershell
node scripts/anim/build_fire_elemental.mjs tmp/ktx-software-4.4.2/bin/ktx.exe
node scripts/assets/build_assets.mjs scripts/assets/specs/fire_elemental.json
$env:KTX_BIN=(Resolve-Path tmp/ktx-software-4.4.2/bin).Path
node scripts/assets/compress_glb_textures.mjs public/models/creatures/fire_elemental_prototype.glb
node scripts/build_media_manifest.mjs generate
```

The builder uses KTX-Software 4.4.2 to decode the old atlas; Sharp processes its
pixels without changing UVs. The standard character pipeline preserves skinning,
compresses geometry with meshopt, and all embedded maps ship as KTX2. Credits
inherit the contributor handoff's project-only terms.

Follow-up: the former staff fingers now use a genuinely open pose throughout all
six clips (6-degree middle and 4-degree tip flexion), preserving the knuckle fan.
The original bind pose was already curled around the staff. The ice prototype
inherits this correction; see `docs/design/ice-elemental-prototype.md`.

The low-tier Lambert material conversion preserves active authored emissive
masks, including their color and intensity. The generic readability floor still
applies to a missing or disabled mask. This prevents the fissures from turning
black on low graphics while retaining the source material untouched.

Visual evidence: `docs/screenshots/fire-elemental/`. Headless screenshots verify
rendering and state transitions, not frame-time performance on a target device.

## Validation (2026-10-23)

Verdict: **READY WITH NOTES** for the isolated prototype. Fresh read-only frontend
review found no blocking issue. Source SHA-256 remains unchanged. Runtime preview
loads five flame meshes, all mapped clips, staff-free 9,712-triangle near/far/shadow
geometry, and produces no browser/GLSL errors. Death/revive captures verify owned
particle fade and restoration.

- `npx tsc --noEmit`: passed after the final source changes.
- Scoped `npx biome check` across the touched code/test/spec files: passed, with
  inherited non-null-assertion warnings in the existing manifest/assets helpers.
- `npm run build`: passed, 2,034 hashed media assets emitted.
- `npm run security:gate`: passed (9,147 files, zero high findings after priors).
- Offline `/dev lab` smoke after the loading cover released: passed. The spawned
  entity at (812, 1.7, 0) uses `npc_dev_fire_elemental`, `Fire_Idle` and all five
  flame meshes; no page errors. `island.png` and `island-attack.png` are captures
  through the normal world renderer, with the latter invoking `playAttack()`.
  The final low-tier capture confirms `MeshLambertMaterial` retains
  `FireElemental_Fissures` and the authored emissive intensity (2.4).
- `npm run i18n:gen`: passed. `npm run ci:changed`: passed but checked zero files
  against its default origin/main; the explicit scoped Biome check is the lint evidence.
- Targeted asset/VFX, lab/terrain, authored-surface, studio-roster, LOD compile-gate
  and visual-pool tests: eight files passed. With the two broader guard suites,
  the run reports 174 passed / seven failed across 181 tests. All seven failures
  are outside this prototype: one architecture raw-control-byte/CRLF sweep and six
  existing global ClipMap coverage/resolution/modular-rig contracts.
- After correcting low-tier emission, the seven focused material/asset/VFX/lab/
  terrain/studio/authored-surface files passed all 42 tests. The added material
  regression pins the mask/intensity, source immutability and inactive-mask floor.
  The final material-only rerun passed all 12 tests; TypeScript and the production
  build passed again after the final low-tier correction.
- `npm run gate`: stopped at i18n freshness because generated localization files
  differ from the staged/committed copies in this worktree. No staging was done
  to bypass it; this is not a clean full-gate result.
