// Finalize only new settlement GLBs: identical KTX2 atlases have one cache-owned URL.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const root = process.cwd(),
  directory = path.join(root, 'public/models/settlements/textures');
await fs.mkdir(directory, { recursive: true });
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const spec = JSON.parse(await fs.readFile('scripts/assets/specs/settlements.json', 'utf8'));
const unique = new Map();
let sourceBytes = 0,
  sharedBytes = 0,
  imageCount = 0,
  processed = 0;
for (const item of spec.items) {
  const filename = path.join(root, 'public', item.out),
    bytes = await fs.readFile(filename);
  const length = bytes.readUInt32LE(12),
    json = JSON.parse(bytes.subarray(20, 20 + length).toString());
  if (json.scenes[json.scene ?? 0]?.extras?.settlementTextureBindings) continue;
  const binary = bytes.subarray(28 + length),
    imageUrls = [];
  for (const image of json.images ?? []) {
    assert.equal(image.mimeType, 'image/ktx2', `${filename}: compress textures before sharing`);
    const view = json.bufferViews[image.bufferView],
      payload = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const hash = createHash('sha256').update(payload).digest('hex');
    const url = `/models/settlements/textures/${hash}.ktx2`;
    sourceBytes += payload.length;
    imageCount++;
    if (!unique.has(hash)) {
      await fs.writeFile(path.join(root, 'public', url), payload);
      unique.set(hash, payload.length);
      sharedBytes += payload.length;
    }
    imageUrls.push(url);
  }
  const textureUrl = (info) => {
    assert(
      !info.texCoord && !info.extensions,
      'Non-default UV layout needs explicit binding adaptation',
    );
    const texture = json.textures[info.index],
      sampler = json.samplers?.[texture.sampler] ?? {};
    assert.equal(sampler.wrapS ?? 10497, 10497);
    assert.equal(sampler.wrapT ?? 10497, 10497);
    return imageUrls[texture.extensions?.KHR_texture_basisu?.source ?? texture.source];
  };
  const bindings = [];
  for (const material of json.materials ?? []) {
    const slots = {},
      pbr = material.pbrMetallicRoughness ?? {};
    if (pbr.baseColorTexture) slots.map = textureUrl(pbr.baseColorTexture);
    if (pbr.metallicRoughnessTexture)
      slots.metalnessMap = slots.roughnessMap = textureUrl(pbr.metallicRoughnessTexture);
    for (const [property, slot] of [
      ['normalTexture', 'normalMap'],
      ['occlusionTexture', 'aoMap'],
      ['emissiveTexture', 'emissiveMap'],
    ])
      if (material[property]) slots[slot] = textureUrl(material[property]);
    if (Object.keys(slots).length)
      bindings.push({
        material: material.name,
        slots,
        normalScale: material.normalTexture?.scale ?? 1,
        aoMapIntensity: material.occlusionTexture?.strength ?? 1,
      });
  }
  assert.equal(
    new Set(bindings.map((b) => b.material)).size,
    bindings.length,
    'Material binding names must be unique',
  );
  const doc = await io.read(filename),
    scene = doc.getRoot().listScenes()[0];
  const boundMaterials = new Set(bindings.map((binding) => binding.material));
  const texturedPrimitives = doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .filter((primitive) => boundMaterials.has(primitive.getMaterial()?.getName()));
  const assertUvs = () => {
    for (const primitive of texturedPrimitives)
      assert(
        primitive.getAttribute('TEXCOORD_0'),
        `${filename}: shared-atlas primitive must retain its UV coordinates`,
      );
  };
  assertUvs();
  scene.setExtras({ ...scene.getExtras(), settlementTextureBindings: bindings });
  for (const texture of [...doc.getRoot().listTextures()]) texture.dispose();
  await doc.transform(
    // The runtime restores these maps from extras. UVs remain live even though
    // glTF materials no longer reference them. Run the customized cleanup once,
    // then encode without a second implicit resource cleanup.
    prune({ keepExtras: true, keepAttributes: true }),
    meshopt({ encoder: MeshoptEncoder, level: 'high', cleanup: false }),
  );
  assertUvs();
  await io.write(filename, doc);
  processed++;
}
const report = { processed, imageCount, uniqueImages: unique.size, sourceBytes, sharedBytes };
if (processed > 0)
  await fs.writeFile(
    'scripts/assets/settlements/texture-sharing.json',
    `${JSON.stringify(report, null, 2)}\n`,
  );
console.log(
  `Shared ${imageCount} embedded images as ${unique.size} KTX2 atlases (${(sourceBytes / 1048576).toFixed(1)} -> ${(sharedBytes / 1048576).toFixed(1)} MB); finalized ${processed} model files.`,
);
