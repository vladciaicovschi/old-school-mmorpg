# Wickharbor vessel imports

`upstream.json` pins the accepted modular sailship and the owner-confirmed
ordinary rowboat from the external boat library. `prepare_sources.mjs` rejects
a source whose SHA-256 no longer matches and stamps a fingerprint of the
importer, contract, metadata, static spec, optimizer and pnpm lockfile into each scene.

From the game checkout:

```powershell
node scripts/assets/wickharbor_vessels/prepare_sources.mjs
node scripts/assets/build_assets.mjs scripts/assets/specs/wickharbor_vessels.json
$env:KTX_BIN='D:/THE_GAME/artifacts/wickharbor-integration/ktx/bin'
node scripts/assets/compress_glb_textures.mjs public/models/wickharbor_vessels/sailship.glb public/models/wickharbor_vessels/rowboat.glb
node scripts/build_media_manifest.mjs generate
```

The importer accepts the external boats directory as its first argument;
by default it uses `../bible/models/ambient/boats`. Authoring recipes and the
accepted Blender checkpoint remain in that library. The accepted hull and
equipment remain intact; a pinned rig patch applies the v21 refinement.
Rowboat color factors darken the original
wood; roughness is fixed high, metallic and the supplied metallic-roughness
map are disabled, and the native albedo, UV and subdued normal map remain.

`tests/wickharbor_vessel_assets.test.ts` parses shipping GLBs and checks
provenance, geometry, draft, materials, KTX2, meshopt and manifest/preload
ownership. `tests/props_material_normal_scale.test.ts` covers source normal
strength surviving the runtime material conversion. Fleet placement is owned
by `src/sim/wickharbor_vessels.ts`, with checks in its paired test.

## Brigantine rig refinement v21

The accepted v20 scene, source GLB and both standalone rig studies remain
immutable. `build_rig_refinement.py` authors a separate derivative under
`../bible/models/ambient/boats/sailing-refined-v21/`. It raises the existing
after mast, replaces the gaff suspension, offsets cloth from wood, fits mast
bindings to the taper, supplies working yard lines, and recuts the lower jib
for foredeck headroom. The hull, cargo, railings and other retained equipment
are checked by geometry/UV/transform signatures before exporting a patch.

The patch replaces only `masts`, `rigging`, `sails` and `fittings`. Both base
and cosmetic importers apply this patch before applying cargo/railing styles.
`merge_vessel_patch.mjs` owns shared-atlas reuse for both patch families.
`rig_refinement.json` pins source hashes, the patch, role triangle counts and
the clearance checks. Its records are part of both shipping fingerprints.

After deliberately changing the authored rig, inspect its report and renders,
then regenerate the source contracts and all affected assets in order:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/assets/wickharbor_vessels/build_rig_refinement.py
node scripts/assets/wickharbor_vessels/record_rig_refinement.mjs
node scripts/assets/wickharbor_vessels/record_variant_sources.mjs
node node_modules/@biomejs/biome/bin/biome format --write scripts/assets/wickharbor_vessels/rig_refinement.json scripts/assets/wickharbor_vessels/variant_sources.json
node scripts/assets/wickharbor_vessels/prepare_sources.mjs
node scripts/assets/wickharbor_vessels/prepare_variants.mjs
node scripts/assets/build_assets.mjs scripts/assets/specs/wickharbor_vessels.json
node scripts/assets/build_assets.mjs scripts/assets/specs/wickharbor_sailship_variants.json
$env:KTX_BIN='D:/THE_GAME/artifacts/wickharbor-integration/ktx/bin'
node scripts/assets/compress_glb_textures.mjs --jobs 2 public/models/wickharbor_vessels/sailship.glb public/models/wickharbor_vessels/rowboat.glb public/models/wickharbor_vessels/sailship-blue.glb public/models/wickharbor_vessels/sailship-ochre.glb public/models/wickharbor_vessels/sailship-russet.glb
node scripts/build_media_manifest.mjs generate
```

`tests/wickharbor_rig_refinement.test.ts` inspects the shipping geometry for
actual cloth height, the taller after mast, retained body topology, hull
envelope and draft. The variant test requires identical shared rig geometry within each rig family.

## Cosmetic sailship variants

`sailship_variants.json` defines three muted sail palettes, fore/aft rail
styles and compact cargo manifests. `build_variants.py` reads the accepted
editable scene, retains all eight end posts, replaces only rail panels and
cargo with native pack parts, and checks deck support and passage clearance.
It writes patches and offline renders to the external `sailing-variants-v2/`
directory. It never saves over the accepted scene. Use `-- --no-render` after
the Blender script argument to rebuild patches without repeating renders.

Rebuild deliberately, then inspect the report and renders before re-pinning:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/assets/wickharbor_vessels/build_variants.py
node scripts/assets/wickharbor_vessels/record_variant_sources.mjs
node node_modules/@biomejs/biome/bin/biome format --write scripts/assets/wickharbor_vessels/variant_sources.json
node scripts/assets/wickharbor_vessels/prepare_variants.mjs
node scripts/assets/build_assets.mjs scripts/assets/specs/wickharbor_sailship_variants.json
$env:KTX_BIN='D:/THE_GAME/artifacts/wickharbor-integration/ktx/bin'
node scripts/assets/compress_glb_textures.mjs --jobs 2 public/models/wickharbor_vessels/sailship-blue.glb public/models/wickharbor_vessels/sailship-ochre.glb public/models/wickharbor_vessels/sailship-russet.glb
node scripts/build_media_manifest.mjs generate
```

The importer combines each pinned patch with the accepted GLB and applies its
linen color factor. Shared pack atlases reuse the accepted encoded textures;
only absent small-cargo maps get a 1024px cap. The separate variant fingerprint
includes its recipe, recorder, configuration, patch metadata, importer, static
spec, base source contract, optimizer and lockfile. Base ship and dinghy
fingerprints are independent and their shipping files remain unchanged.

`tests/wickharbor_sailship_variants.test.ts` compares all unchanged geometry
roles byte-for-byte, checks matching bounds/draft, pins provenance and material
factors, and checks KTX2, meshopt, atlas uniqueness, size and preload ownership.

## Mixed fleet rigs

`fleet_compositions.json` maps the seven used keys to three brigantines, two
ketches and two brigs. Every vessel uses the same railing panel source at bow
and stern. Blue and russet styles use simple railings; linen and ochre use
cross railings. Cargo manifests and muted sail colors remain independent of rig.
The existing ochre key now selects a brig. The three new keys use the established
wickboats deferred preload and preparation paths on both graphics profiles.

`build_fleet_rigs.py` reads the immutable v2 studies and replaces their old jibs
with the verified high-cut v21 pair. It checks independent cloth and rope
intersections, supported foredeck body clearance, helm headroom and unchanged
body signatures. It saves new editable scenes, role patches and offline renders
to `fleet-rigs-v1/`. The selected-rig importer replaces masts, rigging, sails,
fittings and framing, then applies the selected cargo/railing patch. Other body
groups and the ordinary dinghy remain unchanged.

Rebuild mixed derivatives in this order. Format metadata before preparation,
because exact recipe and contract bytes form the source fingerprint:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/assets/wickharbor_vessels/build_fleet_rigs.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/assets/wickharbor_vessels/build_variants.py
node scripts/assets/wickharbor_vessels/record_variant_sources.mjs
node node_modules/@biomejs/biome/bin/biome format --write scripts/assets/wickharbor_vessels/fleet_rigs.json scripts/assets/wickharbor_vessels/variant_sources.json
node scripts/assets/wickharbor_vessels/prepare_variants.mjs
node scripts/assets/build_assets.mjs scripts/assets/specs/wickharbor_sailship_variants.json
$env:KTX_BIN='D:/THE_GAME/artifacts/wickharbor-integration/ktx/bin'
node scripts/assets/compress_glb_textures.mjs --jobs 2 public/models/wickharbor_vessels/sailship-blue.glb public/models/wickharbor_vessels/sailship-ochre.glb public/models/wickharbor_vessels/sailship-russet.glb public/models/wickharbor_vessels/ketch-blue.glb public/models/wickharbor_vessels/ketch-ochre.glb public/models/wickharbor_vessels/brig.glb
node scripts/build_media_manifest.mjs generate
```

`wickharborShipProfile` accounts for whole-asset XZ recentering: shorter aft
spars shift the unchanged hull relative to the extracted prop origin. Tests
measure the shipping hull against its conservative per-key envelope and sample
real terrain, piers and other hulls. No prop-origin special case or runtime
geometry construction is added.
