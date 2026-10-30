// Frosted-ice derivative of the staff-free elemental. Rebuild fire first so
// the rig and open-hand clips remain identical. Original atlas supplies the
// crack/ornament masks; only three small bone-attached crystal clusters are new.
// node scripts/anim/build_ice_elemental.mjs [path/to/ktx.exe]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { KHRMaterialsClearcoat, KHRMaterialsIOR } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { groundElementalDeath } from './elemental_death.mjs';
import { createGlbIO } from './pose_blend.mjs';
import { createPoseRig } from './rig_pose.mjs';

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
const originalDoc = await io.read(original);
const originalAtlas = originalDoc
  .getRoot()
  .listMeshes()[0]
  .listPrimitives()[0]
  .getMaterial()
  .getBaseColorTexture();
await writeFile(`${work}/ice_source.ktx2`, originalAtlas.getImage());
execFileSync(process.argv[2] ?? 'tmp/ktx-software-4.4.2/bin/ktx.exe', [
  'extract',
  '--transcode',
  'rgba8',
  `${work}/ice_source.ktx2`,
  `${work}/ice_source.png`,
]);
const { data, info } = await sharp(`${work}/ice_source.png`)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const glow = Buffer.alloc(data.length);
let brightest = -1;
let crystalPixel = 0;
for (let i = 0; i < data.length; i += 4) {
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  const crack = Math.max(0, Math.min(1, (r - 1.65 * g - 20) / 75)) * Math.min(1, r / 130);
  const light = (r * 0.3 + g * 0.55 + b * 0.15) / 255;
  const frost = Math.max(0, Math.min(0.72, (r + g - b * 2 - 15) / 160)) * (1 - crack);
  const blue = [30 + 145 * light, 85 + 140 * light, 130 + 115 * light];
  const white = [185, 225, 239];
  for (let c = 0; c < 3; c++) {
    const surface = blue[c] * (1 - frost) + white[c] * frost;
    data[i + c] = surface * (1 - crack) + [115, 220, 250][c] * crack;
    glow[i + c] = [50, 180, 240][c] * crack;
  }
  glow[i + 3] = 255;
  const brightness = data[i] + data[i + 1] + data[i + 2];
  if (brightness > brightest) {
    brightest = brightness;
    crystalPixel = i / 4;
  }
}
const png = async (pixels) =>
  sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
const body = root.listMeshes()[0].listPrimitives()[0];
assert.equal(body.getIndices().getCount(), 9712 * 3);
const material = body.getMaterial();
material
  .getBaseColorTexture()
  .setImage(await png(data))
  .setMimeType('image/png')
  .setName('IceElemental_Frost');
material.getBaseColorTexture().setExtension('KHR_texture_basisu', null);
material
  .getEmissiveTexture()
  .setImage(await png(glow))
  .setMimeType('image/png')
  .setName('IceElemental_Cracks');
material.getEmissiveTexture().setExtension('KHR_texture_basisu', null);
const coat = doc.createExtension(KHRMaterialsClearcoat);
const ior = doc.createExtension(KHRMaterialsIOR);
material
  .setName('IceElemental_Frost')
  .setMetallicFactor(0)
  .setRoughnessFactor(0.56)
  .setExtension(
    'KHR_materials_clearcoat',
    coat.createClearcoat().setClearcoatFactor(0.65).setClearcoatRoughnessFactor(0.22),
  )
  .setExtension('KHR_materials_ior', ior.createIOR().setIOR(1.31));
root.listMeshes()[0].setName('IceElementalBody');
for (const animation of root.listAnimations()) {
  animation.setName(animation.getName().replace(/^Fire_/, 'Ice_'));
}

// Opaque frosted crystal, not screen-space transmission: stable low-tier
// silhouettes, normal shadows and no additional framebuffer pass.
const crystal = doc
  .createMaterial('IceElemental_Crystal')
  .setBaseColorFactor([1, 1, 1, 1])
  .setBaseColorTexture(material.getBaseColorTexture())
  .setMetallicFactor(0)
  .setRoughnessFactor(0.4)
  .setEmissiveFactor([0.025, 0.06, 0.09])
  .setExtension(
    'KHR_materials_clearcoat',
    coat.createClearcoat().setClearcoatFactor(0.8).setClearcoatRoughnessFactor(0.18),
  );
const rig = createPoseRig(root);
const buffer = root.listBuffers()[0];
function cluster(boneName, spikes) {
  const bone = rig.named.get(boneName);
  const positions = [],
    normals = [];
  const tri = (a, b, c) => {
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    for (const point of [a, b, c]) {
      positions.push(...point.toArray());
      normals.push(...normal.toArray());
    }
  };
  for (const [dx, dy, dz, height, radius, tilt] of spikes) {
    const rotation = new Quaternion().setFromEuler(new Euler(0, 0, tilt));
    const origin = bone.getWorldPosition(new Vector3()).add(new Vector3(dx, dy, dz));
    const world = new Matrix4().compose(origin, rotation, new Vector3(1, 1, 1));
    const local = bone.matrixWorld.clone().invert().multiply(world);
    const tip = new Vector3(0, height, 0).applyMatrix4(local);
    const bottom = new Vector3(0, -0.025, 0).applyMatrix4(local);
    const ring = Array.from({ length: 6 }, (_, i) =>
      new Vector3(
        Math.cos((i * Math.PI) / 3) * radius,
        height * 0.36,
        Math.sin((i * Math.PI) / 3) * radius,
      ).applyMatrix4(local),
    );
    for (let i = 0; i < 6; i++) {
      const a = ring[i],
        b = ring[(i + 1) % 6];
      tri(a, tip, b);
      tri(b, bottom, a);
    }
  }
  const primitive = doc
    .createPrimitive()
    .setMaterial(crystal)
    .setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(Uint16Array.from({ length: positions.length / 3 }, (_, i) => i))
        .setBuffer(buffer),
    )
    // Sample one bright frost texel from the shared atlas. A real map reference
    // keeps the optimizer from pruning UVs and breaking textured far baking.
    .setAttribute(
      'TEXCOORD_0',
      doc
        .createAccessor()
        .setType('VEC2')
        .setArray(
          Float32Array.from({ length: (positions.length / 3) * 2 }, (_, i) =>
            i % 2 === 0
              ? ((crystalPixel % info.width) + 0.5) / info.width
              : (Math.floor(crystalPixel / info.width) + 0.5) / info.height,
          ),
        )
        .setBuffer(buffer),
    )
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer),
    );
  const node = doc
    .createNode(`IceCrystal_${boneName}`)
    .setMesh(doc.createMesh(`IceCrystal_${boneName}`).addPrimitive(primitive));
  root
    .listNodes()
    .find((n) => n.getName() === boneName)
    .addChild(node);
}
cluster('upperarm.l', [
  [0, 0.045, -0.015, 0.18, 0.035, -0.38],
  [0.04, 0.02, -0.025, 0.13, 0.027, -0.65],
]);
cluster('upperarm.r', [
  [0, 0.045, -0.015, 0.18, 0.035, 0.38],
  [-0.04, 0.02, -0.025, 0.13, 0.027, 0.65],
]);
cluster('head', [
  [0, 0.095, -0.025, 0.17, 0.032, 0],
  [0.045, 0.075, -0.03, 0.12, 0.025, -0.3],
  [-0.045, 0.075, -0.03, 0.12, 0.025, 0.3],
]);
root.setExtras({
  elementalVariant: 'ice',
  source,
  sourceSha256,
  original,
  originalSha256,
  staffRemoved: true,
});
groundElementalDeath(doc);
await doc.transform(prune({ keepLeaves: true }));
await io.write(`${work}/ice_elemental.glb`, doc);
console.log(`Built ${work}/ice_elemental.glb; preserved body and added 84 crystal triangles.`);
