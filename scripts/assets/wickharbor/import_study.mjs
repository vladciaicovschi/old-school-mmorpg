// Import the approved local assembly without modifying either supplied source pack.
// node scripts/assets/wickharbor/import_study.mjs D:/THE_GAME/artifacts/eastbrook-megakit-study
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
assert(process.argv[2], 'Pass the approved study directory');
const study = path.resolve(process.argv[2]);
const { LOTS, ROADS, FIXED } = await import(
  pathToFileURL(path.join(study, 'wickharbor/layout.mjs'))
);
const { VILLAGE_MODELS, modelForLot, villageModelUrl } = await import(
  pathToFileURL(path.join(study, 'wickharbor/village-models.mjs'))
);
const pick = (object, keys) =>
  Object.fromEntries(
    keys.filter((key) => object[key] !== undefined).map((key) => [key, object[key]]),
  );
const keys = [
  'footprint',
  'entrance',
  'walkColliders',
  'interior',
  'openWorkArea',
  'openAirMarket',
  'additionalFoundations',
  'foundationTop',
  'foundationPad',
  'bellTower',
  'staircase',
  'terrainProps',
];
const metadata = {},
  items = [],
  provenance = [];
const input = path.join(root, 'tmp/asset_src/wickharbor');
await fs.mkdir(input, { recursive: true });
for (const id of VILLAGE_MODELS) {
  const source = villageModelUrl(id).replace('/study/', ''),
    bytes = await fs.readFile(path.join(study, source));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${id}: expected GLB`);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  metadata[id] = pick(json.scenes[json.scene ?? 0].extras ?? {}, keys);
  let prepared = bytes;
  // The existing monument already carries KTX2. Require its decoder explicitly;
  // the compression tool correctly skips images that are already compressed.
  if ((json.images ?? []).some((image) => image.mimeType === 'image/ktx2')) {
    json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'KHR_texture_basisu'])];
    json.extensionsRequired = [
      ...new Set([...(json.extensionsRequired ?? []), 'KHR_texture_basisu']),
    ];
    for (const texture of json.textures ?? []) {
      if (json.images[texture.source]?.mimeType !== 'image/ktx2') continue;
      texture.extensions = {
        ...texture.extensions,
        KHR_texture_basisu: { source: texture.source },
      };
      delete texture.source;
    }
    const header = bytes.subarray(0, 12),
      encoded = Buffer.from(JSON.stringify(json)),
      padding = Buffer.alloc((4 - (encoded.length % 4)) % 4, 0x20);
    const chunk = Buffer.alloc(8);
    chunk.writeUInt32LE(encoded.length + padding.length);
    chunk.writeUInt32LE(0x4e4f534a, 4);
    prepared = Buffer.concat([
      header,
      chunk,
      encoded,
      padding,
      bytes.subarray(20 + bytes.readUInt32LE(12)),
    ]);
    prepared.writeUInt32LE(prepared.length, 8);
  }
  await fs.writeFile(path.join(input, `${id}.glb`), prepared);
  items.push({
    src: `tmp/asset_src/wickharbor/${id}.glb`,
    out: `models/wickharbor/${id.replaceAll('-', '_')}.glb`,
    type: 'static',
    keepExtras: true,
    maxTex: 512,
  });
  provenance.push({ id, source, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const lots = LOTS.map((lot) => ({
  ...pick(lot, ['id', 'kind', 'x', 'z', 'w', 'd', 'front', 'rot', 'yard']),
  modelId: modelForLot(lot),
}));
const needed = [...new Set([...lots.map((lot) => lot.modelId), 'lighthouse-round'])];
const data = {
  source: 'Approved Quaternius Wickharbor assembly, 2026-10-20',
  lots,
  roads: ROADS.map((r) => pick(r, ['id', 'width', 'points'])),
  fixtures: FIXED.map((f) => pick(f, ['id', 'x', 'z', 'r', 'type'])),
  metadata: Object.fromEntries(needed.map((id) => [id, metadata[id]])),
};
const write = (file, value) =>
  fs.writeFile(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);
await write('src/sim/wickharbor_data.json', data);
await write('scripts/assets/specs/wickharbor.json', {
  source:
    'Approved Wickharbor study; Medieval Village MegaKit Pro and Fantasy Props MegaKit Pro (CC0), existing game fixtures retained',
  items,
});
await write('scripts/assets/wickharbor/provenance.json', {
  sourcePacks: ['Medieval Village MegaKit Pro', 'Fantasy Props MegaKit Pro'],
  license: 'CC0 1.0; existing game fixture licenses retained',
  models: provenance,
});
console.log(
  `Imported ${lots.length} lots and ${items.length} models; run build_assets, scoped KTX2 compression, then media manifest generation.`,
);
