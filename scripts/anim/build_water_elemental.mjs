// Liquid derivative: keep the open-hand rig, topology and clips; soften the
// sculpt without changing weights and replace rock shading with translucent
// teal water. Rebuild the fire variant first. No transmission framebuffer pass.
// node scripts/anim/build_water_elemental.mjs [path/to/ktx.exe]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { KHRMaterialsClearcoat, KHRMaterialsIOR } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';
import { Vector3 } from 'three';
import { groundElementalDeath } from './elemental_death.mjs';
import { createGlbIO } from './pose_blend.mjs';

const source = 'public/models/creatures/fire_elemental_prototype.glb';
const original = 'public/models/creatures/ignivar_ashcaller.glb';
const sourceSha256 = createHash('sha256')
  .update(await readFile(source))
  .digest('hex');
const originalSha256 = createHash('sha256')
  .update(await readFile(original))
  .digest('hex');
assert.equal(originalSha256, '0f92aa55d5f031cc2ae1c9368102edde96a3345827592cb3c56351d1b4fd4396');
const work = 'tmp/asset_src/elementals';
await mkdir(work, { recursive: true });
const io = createGlbIO();
const doc = await io.read(source);
const root = doc.getRoot();
const body = root.listMeshes()[0].listPrimitives()[0];
assert.equal(body.getIndices().getCount(), 9712 * 3);

// Weld only for the smoothing calculation, keeping UV seams and skin buffers
// in the exported mesh. Separate weight signatures prevent crossing rigid
// floating parts or smearing a finger into its palm.
const position = body.getAttribute('POSITION');
const joints = body.getAttribute('JOINTS_0');
const weights = body.getAttribute('WEIGHTS_0');
const groups = [],
  ids = [],
  byKey = new Map();
for (let i = 0; i < position.getCount(); i++) {
  const p = position.getElement(i, []),
    j = joints.getElement(i, []),
    w = weights.getElement(i, []);
  const key = [...p, ...j, ...w].map((v) => Math.round(v * 1e5)).join(',');
  let id = byKey.get(key);
  if (id === undefined) {
    id = groups.length;
    byKey.set(key, id);
    groups.push({ p: new Vector3().fromArray(p), neighbors: new Set() });
  }
  ids.push(id);
}
const indices = body.getIndices().getArray();
for (let i = 0; i < indices.length; i += 3) {
  const face = [ids[indices[i]], ids[indices[i + 1]], ids[indices[i + 2]]];
  for (const a of face) for (const b of face) if (a !== b) groups[a].neighbors.add(b);
}
for (let pass = 0; pass < 3; pass++) {
  const next = groups.map(({ p, neighbors }) => {
    if (!neighbors.size) return p.clone();
    const average = new Vector3();
    for (const id of neighbors) average.add(groups[id].p);
    return p.clone().lerp(average.multiplyScalar(1 / neighbors.size), 0.26);
  });
  groups.forEach((g, i) => {
    g.p = next[i];
  });
}
const normals = groups.map(() => new Vector3());
for (let i = 0; i < indices.length; i += 3) {
  const a = ids[indices[i]],
    b = ids[indices[i + 1]],
    c = ids[indices[i + 2]];
  const n = groups[b].p.clone().sub(groups[a].p).cross(groups[c].p.clone().sub(groups[a].p));
  for (const id of [a, b, c]) normals[id].add(n);
}
for (const n of normals) {
  if (n.lengthSq() < 1e-16) n.set(0, 1, 0);
  n.normalize();
}
position
  .setArray(Float32Array.from(ids.flatMap((id) => groups[id].p.toArray())))
  .setNormalized(false);
body
  .getAttribute('NORMAL')
  .setArray(Float32Array.from(ids.flatMap((id) => normals[id].toArray())))
  .setNormalized(false);

const originalDoc = await io.read(original);
const atlas = originalDoc
  .getRoot()
  .listMeshes()[0]
  .listPrimitives()[0]
  .getMaterial()
  .getBaseColorTexture();
await writeFile(`${work}/water_source.ktx2`, atlas.getImage());
execFileSync(process.argv[2] ?? 'tmp/ktx-software-4.4.2/bin/ktx.exe', [
  'extract',
  '--transcode',
  'rgba8',
  `${work}/water_source.ktx2`,
  `${work}/water_source.png`,
]);
const { data, info } = await sharp(`${work}/water_source.png`)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const glow = Buffer.alloc(data.length);
for (let i = 0; i < data.length; i += 4) {
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  const light = (r * 0.3 + g * 0.55 + b * 0.15) / 255;
  const core = Math.max(0, Math.min(1, (r - 1.65 * g - 20) / 75)) * Math.min(1, r / 130);
  // Compress painted relief contrast; the moving overlay supplies flowing
  // detail instead of retaining baked basalt grooves and gold decoration.
  data[i] = 18 + 30 * light + core * 12;
  data[i + 1] = 112 + 32 * light + core * 30;
  data[i + 2] = 154 + 40 * light + core * 25;
  glow[i] = 20 * core;
  glow[i + 1] = 140 * core;
  glow[i + 2] = 180 * core;
  glow[i + 3] = 255;
}
const png = async (pixels) =>
  sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
const material = body.getMaterial();
for (const [texture, pixels, name] of [
  [material.getBaseColorTexture(), data, 'WaterElemental_Surface'],
  [material.getEmissiveTexture(), glow, 'WaterElemental_Core'],
]) {
  texture
    .setImage(await png(pixels))
    .setMimeType('image/png')
    .setName(name)
    .setExtension('KHR_texture_basisu', null);
}
const coat = doc.createExtension(KHRMaterialsClearcoat);
const ior = doc.createExtension(KHRMaterialsIOR);
material
  .setName('WaterElemental_Surface')
  .setBaseColorFactor([1, 1, 1, 0.72])
  .setAlphaMode('BLEND')
  .setDoubleSided(false)
  .setMetallicFactor(0)
  .setRoughnessFactor(0.24)
  .setNormalTexture(null)
  .setOcclusionTexture(null)
  .setMetallicRoughnessTexture(null)
  .setExtension(
    'KHR_materials_clearcoat',
    coat.createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.035),
  )
  .setExtension('KHR_materials_ior', ior.createIOR().setIOR(1.333));
root.listMeshes()[0].setName('WaterElementalBody');
for (const animation of root.listAnimations())
  animation.setName(animation.getName().replace(/^Fire_/, 'Water_'));
root.setExtras({
  elementalVariant: 'water',
  source,
  sourceSha256,
  original,
  originalSha256,
  staffRemoved: true,
  smoothingPasses: 3,
});
groundElementalDeath(doc);
await doc.transform(prune({ keepLeaves: true }));
await io.write(`${work}/water_elemental.glb`, doc);
console.log(`Built ${work}/water_elemental.glb, unchanged body topology/skin.`);
