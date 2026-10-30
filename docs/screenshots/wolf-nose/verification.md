# Wolf muzzle deformation repair

The original upper nose shared substantial weights with the lower jaw, and part
of the bridge also followed the ears. Opening the jaw bent the upper nose. The
repair transfers those influences to the native skull locally, keeping the nose
cap whole and feathering behind its base, above the lower lip and into the cheeks.
The nose cap includes its lower black surface; a boundary through that surface
would stretch the nose vertically when the mouth opens.

`scripts/anim/repair_smart_wolf_muzzle.mjs` owns the correction. The Blender baker
calls it after export, before the ordinary asset optimizer. It also works on the
shipping Meshopt/KTX2 GLB and skips an already repaired asset. Both raw and
compressed paths were checked. The Bible source remains untouched.

Compare [before](before-sequence.png) and [after](after-sequence.png) at the same
bite phases, or watch the [final bite](after.gif). The renderer uses the final
compressed asset. Its body reach, delayed neck return and jaw opening are retained.

`preservation.json` confirms identical animation channels for every clip, mesh
positions, normals, tangents, UVs, triangle indices, bind matrices and texture
bytes. Only local joint influences/weights and repair metadata change. The
operation adjusts 2,852 of 101,835 vertices and keeps four normalized influences.

`tests/wolf_muzzle_skin.test.ts` checks the actual deformed nose surface, including
its lower part, over 41 phases of each attack. Pairwise nose distances must remain
within 2%, while lower-lip vertices move independently and the jaw retains its
opening. All three cases failed on the old weights and pass after repair.

The combined run passed 58 tests:

```text
npx vitest run tests/wolf_muzzle_skin.test.ts tests/animal_contact_pose.test.ts tests/smart_wolf_asset.test.ts tests/smart_goat_asset.test.ts tests/animal_motion_flow.test.ts tests/quadruped_death_pose.test.ts --maxWorkers=2
```

The added geometric lower-lip assertion also passed separately in the three
muzzle cases. `floor.json` checks every deformed vertex at 41 phases of both
lateral bites, Lunge, Howl and Death. All remain within the existing 0.025 floor
contact tolerance. Texture finalization found no uncompressed textures, and the
media manifest was regenerated.

Scoped Biome, `npm run check:ts`, `node scripts/malware_scan.mjs --gate` and a
production Vite bundle with public copying disabled passed. `runtime.json`
records the normal attack cycle and browser errors. The canonical
`GATE_SELECT_BASE=HEAD node scripts/gate_select.mjs` remains blocked at pre-existing
i18n freshness differences. No files were staged to bypass the check.
