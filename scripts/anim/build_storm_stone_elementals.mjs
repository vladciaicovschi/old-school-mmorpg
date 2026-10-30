// Two opaque rock derivatives of the staff-free elemental. Retain the original
// atlas relief and the corrected open-hand rig; storm arcs are owned runtime VFX.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';
import { groundElementalDeath } from './elemental_death.mjs';
import { createGlbIO } from './pose_blend.mjs';

const source = 'public/models/creatures/fire_elemental_prototype.glb';
const original = 'public/models/creatures/ignivar_ashcaller.glb';
const sha = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
const sourceSha256 = await sha(source),
  originalSha256 = await sha(original);
assert.equal(originalSha256, '0f92aa55d5f031cc2ae1c9368102edde96a3345827592cb3c56351d1b4fd4396');
const work = 'tmp/asset_src/elementals';
await mkdir(work, { recursive: true });
const io = createGlbIO();
const atlas = (await io.read(original))
  .getRoot()
  .listMeshes()[0]
  .listPrimitives()[0]
  .getMaterial()
  .getBaseColorTexture();
await writeFile(`${work}/rock_source.ktx2`, atlas.getImage());
execFileSync(process.argv[2] ?? 'tmp/ktx-software-4.4.2/bin/ktx.exe', [
  'extract',
  '--transcode',
  'rgba8',
  `${work}/rock_source.ktx2`,
  `${work}/rock_source.png`,
]);
const { data: originalPixels, info } = await sharp(`${work}/rock_source.png`)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const png = (pixels) =>
  sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
for (const variant of ['storm', 'stone']) {
  const title = variant[0].toUpperCase() + variant.slice(1);
  const doc = await io.read(source),
    root = doc.getRoot();
  const body = root.listMeshes()[0].listPrimitives()[0];
  assert.equal(body.getIndices().getCount(), 9712 * 3);
  const data = Buffer.from(originalPixels),
    glow = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const heat = Math.max(0, Math.min(1, (r - 1.65 * g - 20) / 75)) * Math.min(1, r / 130);
    const light = (r * 0.3 + g * 0.55 + b * 0.15) / 255;
    const trim = Math.max(0, Math.min(0.65, (r + g - 2 * b - 15) / 180)) * (1 - heat);
    const rock =
      variant === 'storm'
        ? [22 + 65 * light, 26 + 66 * light, 40 + 80 * light]
        : [66 + 116 * light, 63 + 108 * light, 53 + 91 * light];
    const seam = variant === 'storm' ? [110, 175, 240] : [95, 88, 62];
    const emission = variant === 'storm' ? [55, 100, 220] : [5, 6, 3];
    for (let c = 0; c < 3; c++) {
      const surface =
        rock[c] * (1 - trim) +
        (variant === 'storm' ? [112, 120, 150][c] : [145, 140, 119][c]) * trim;
      data[i + c] = surface * (1 - heat) + seam[c] * heat;
      glow[i + c] = emission[c] * heat;
    }
    glow[i + 3] = 255;
  }
  const material = body.getMaterial();
  for (const [texture, pixels, suffix] of [
    [material.getBaseColorTexture(), data, 'Rock'],
    [material.getEmissiveTexture(), glow, 'Seams'],
  ]) {
    texture
      .setImage(await png(pixels))
      .setMimeType('image/png')
      .setName(`${title}Elemental_${suffix}`)
      .setExtension('KHR_texture_basisu', null);
  }
  material
    .setName(`${title}Elemental_Rock`)
    .setBaseColorFactor([1, 1, 1, 1])
    .setAlphaMode('OPAQUE')
    .setMetallicFactor(0)
    .setRoughnessFactor(1)
    .setMetallicRoughnessTexture(null);
  root.listMeshes()[0].setName(`${title}ElementalBody`);
  for (const animation of root.listAnimations())
    animation.setName(animation.getName().replace(/^Fire_/, `${title}_`));
  root.setExtras({
    elementalVariant: variant,
    source,
    sourceSha256,
    original,
    originalSha256,
    staffRemoved: true,
  });
  groundElementalDeath(doc);
  await doc.transform(prune({ keepLeaves: true }));
  await io.write(`${work}/${variant}_elemental.glb`, doc);
  console.log(`Built ${variant}: unchanged 9712 triangles, 51-joint skin and open-hand clips.`);
}
