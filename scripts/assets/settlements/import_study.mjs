// Import the approved local settlement proposals. Original packs and studies are read-only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
assert(process.argv[2], 'Pass the approved architecture study directory');
const study = path.resolve(process.argv[2]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const input = path.join(root, 'tmp/asset_src/settlements');
await fs.mkdir(input, { recursive: true });
const readJSON = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const pick = (value, keys) =>
  Object.fromEntries(
    keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]),
  );
const old = await readJSON(path.join(root, 'scripts/assets/wickharbor/provenance.json'));
const reused = new Map(old.models.map((m) => [`/study/${m.source}`, m]));
const models = {},
  sources = new Map(),
  items = [],
  provenance = [],
  settlements = [];

async function model(scope, name, sourceUrl) {
  if (sources.has(sourceUrl)) return sources.get(sourceUrl);
  const id = `${scope}:${name}`;
  const source = sourceUrl.startsWith('/game/')
    ? path.join(root, 'public', sourceUrl.slice(6))
    : path.join(study, sourceUrl.slice(7));
  const bytes = await fs.readFile(source),
    sha256 = createHash('sha256').update(bytes).digest('hex');
  const doc = await io.read(source),
    scene = doc.getRoot().listScenes()[0];
  let url = `/models/settlements/${scope}_${name.replaceAll('-', '_')}.glb`;
  const prior = reused.get(sourceUrl);
  if (sourceUrl.startsWith('/game/')) url = sourceUrl.slice(5);
  else if (prior?.sha256 === sha256)
    url = `/models/wickharbor/${prior.id.replaceAll('-', '_')}.glb`;
  else {
    const basename = path.basename(url);
    await fs.writeFile(path.join(input, basename), bytes);
    items.push({
      src: `tmp/asset_src/settlements/${basename}`,
      out: url.slice(1),
      type: 'static',
      keepExtras: true,
      maxTex: /constructions\//.test(sourceUrl) ? 1024 : 512,
    });
  }
  models[id] = { url, metadata: scene.getExtras(), bounds: getBounds(scene), sourceSha256: sha256 };
  provenance.push({
    id,
    source: sourceUrl,
    sha256,
    url,
    reused: !url.startsWith('/models/settlements/'),
  });
  sources.set(sourceUrl, id);
  return id;
}

const zones = {
  eastbrook: 'eastbrook_vale',
  icemantle: 'frostveil',
  gullhaven: 'farshore_isle',
  gibbetmere: 'wraithwood',
};
for (const [id, zoneId] of Object.entries(zones)) {
  const report = await readJSON(path.join(study, id, 'placement-report.json'));
  assert.deepEqual(report.issues, [], `${id}: unresolved proposal issues`);
  const site = await readJSON(path.join(study, id, 'site.json'));
  const layout = await import(pathToFileURL(path.join(study, id, 'layout.mjs')));
  let urls = layout.MODEL_URLS;
  if (id === 'icemantle') {
    const { SHARED_MODELS } = await import(pathToFileURL(path.join(study, id, 'placement.mjs')));
    urls = Object.fromEntries(
      [...report.lots.map((l) => l.model), 'barrel', 'crate', 'bench', 'stall', 'firepit'].map(
        (name) => [name, `/study/${id}/${name}.glb`],
      ),
    );
    for (const [name, relative] of Object.entries(SHARED_MODELS))
      urls[name] =
        `/study/${path.relative(study, path.resolve(study, id, relative)).replaceAll('\\', '/')}`;
  }
  const aliases = {};
  for (const [name, url] of Object.entries(urls)) aliases[name] = await model(id, name, url);
  const lots = report.lots.map((lot) => {
    const modelId = aliases[lot.model],
      metadata = models[modelId].metadata;
    const w = lot.w ?? metadata.footprint.width,
      d = lot.d ?? metadata.footprint.depth;
    const front = lot.front ?? {
      x: lot.x + Math.sin(lot.rot) * (d / 2 + 3),
      z: lot.z + Math.cos(lot.rot) * (d / 2 + 3),
    };
    const kind = metadata.bellTower
      ? 'chapel'
      : metadata.interior
        ? 'inn'
        : metadata.openWorkArea
          ? 'workshop'
          : 'house';
    return {
      ...pick(lot, ['id', 'model', 'x', 'z', 'rot', 'levels', 'foundationTop', 'role']),
      kind,
      w,
      d,
      front,
      modelId,
      metadata,
    };
  });
  const dressing = report.dressing
    .filter((p) => !['mailbox', 'noticeboard'].includes(p.id))
    .map((p) => ({
      ...pick(p, ['id', 'model', 'x', 'z', 'rot', 'scale', 'yard']),
      modelId: aliases[p.model],
      terrainFeet: !!p.terrainFeet,
      support: pick(p.seating, ['min', 'max', 'supportPoints']),
    }));
  const landmarks = (report.landmarks ?? []).map((p) => ({
    ...pick(p, ['id', 'model', 'x', 'z', 'rot', 'scale']),
    kind: p.id,
    modelId: aliases[p.model],
  }));
  const fortifications = (report.fortifications ?? []).map((p) => ({
    ...pick(p, [
      'id',
      'model',
      'x',
      'z',
      'rot',
      'type',
      'foundationRects',
      'timber',
      'terrainMode',
    ]),
    modelId: aliases[p.model],
    metadata: models[aliases[p.model]].metadata,
  }));
  const dressingParts = report.siteDressing ?? {};
  const siteDressing = Object.fromEntries(
    ['fences', 'decks', 'piles'].map((kind) => [
      kind,
      (dressingParts[kind] ?? []).map((p) => ({
        ...p,
        modelId: aliases[{ fences: 'fence', decks: 'deck', piles: 'post' }[kind]],
      })),
    ]),
  );
  const trees = (report.trees ?? []).map((p) => ({
    ...p,
    rot: p.yaw ?? 0,
    kind: 'tree',
    modelId: aliases[p.model],
  }));
  const lamps = (report.lamps ?? []).map((p) => ({
    ...p,
    rot: p.yaw ?? 0,
    kind: 'lamp',
    modelId: aliases[p.model],
  }));
  settlements.push({
    id,
    zoneId,
    bounds: pick(site.rect, ['xMin', 'xMax', 'zMin', 'zMax']),
    models: aliases,
    lots,
    roads: report.roads,
    paths: report.paths,
    plazas: report.plazas ?? [],
    fixed: report.fixed,
    dressing,
    landmarks,
    fortifications,
    siteDressing,
    yards: report.yards ?? [],
    trees,
    lamps,
  });
}
const { CHURCHYARDS } = await import(
  pathToFileURL(path.join(study, 'constructions/churchyard-layout.mjs'))
);
const aliases = {},
  dressing = [];
for (const p of CHURCHYARDS.wickharbor) {
  aliases[p.model] ??= await model('wickharbor', p.model, `/study/constructions/${p.model}.glb`);
  const modelId = aliases[p.model],
    raw = models[modelId].metadata.groundSupport;
  const support = {
    min: raw.min.map((v) => v * p.scale),
    max: raw.max.map((v) => v * p.scale),
    supportPoints: raw.supportPoints.map((p2) => p2.map((v) => v * p.scale)),
  };
  dressing.push({ ...p, modelId, support });
}
settlements.push({
  id: 'wickharbor',
  zoneId: 'galecrest',
  decorationOnly: true,
  bounds: { xMin: 396, xMax: 408, zMin: 330, zMax: 340 },
  models: aliases,
  lots: [],
  roads: [],
  paths: [],
  plazas: [],
  fixed: [],
  dressing,
  landmarks: [],
  fortifications: [],
  siteDressing: { fences: [], decks: [], piles: [] },
  yards: [],
  trees: [],
  lamps: [],
});
const write = (file, value) =>
  fs.writeFile(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);
await write('src/sim/settlements_data.json', {
  source: 'Approved local architecture proposals, 2026-10-21',
  settlements,
  models,
});
await write('scripts/assets/specs/settlements.json', {
  source: 'Approved settlement derivatives; supplied packs kept immutable',
  items,
});
await write('scripts/assets/settlements/provenance.json', { models: provenance });
console.log(
  `Imported ${settlements.reduce((n, s) => n + s.lots.length, 0)} lots, ${Object.keys(models).length} unique models (${items.length} new assets); existing source files unchanged.`,
);
