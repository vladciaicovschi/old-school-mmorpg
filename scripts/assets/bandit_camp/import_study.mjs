// Import whole, approved derivatives. Source archives and the study stay immutable.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
assert(process.argv[2], 'Pass the approved bandit-camp study directory');
const study = path.resolve(process.argv[2]);
const { TENTS, PROPS, MODELS } = await import(pathToFileURL(path.join(study, 'layout.mjs')));
const report = JSON.parse(await fs.readFile(path.join(study, 'placement-report.json'), 'utf8'));
assert.deepEqual(report.issues, []);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
const input = path.join(root, 'tmp/asset_src/bandit_camp');
await fs.mkdir(input, { recursive: true });
const models = {},
  items = [],
  provenance = [];

// A low, solid body envelope derived from the actual canvas and posts. No
// enclosing box: the authored offset entrances and usable interior remain open.
// The fixed raster is merged into rectangles; only the import pays triangle cost.
function shellColliders(scene) {
  const step = 0.1,
    cells = new Set(),
    triangle = new THREE.Triangle();
  const cell = new THREE.Box3();
  function visit(node, parent) {
    const matrix = parent.clone().multiply(new THREE.Matrix4().fromArray(node.getMatrix()));
    for (const p of node.getMesh()?.listPrimitives() ?? []) {
      const pos = p.getAttribute('POSITION'),
        index = p.getIndices();
      const count = index?.getCount() ?? pos.getCount();
      for (let i = 0; i < count; i += 3) {
        for (const [v, j] of [
          [triangle.a, i],
          [triangle.b, i + 1],
          [triangle.c, i + 2],
        ]) {
          v.fromArray(pos.getElement(index ? index.getScalar(j) : j, [])).applyMatrix4(matrix);
        }
        const b = new THREE.Box3().setFromPoints([triangle.a, triangle.b, triangle.c]);
        if (b.max.y < 0.25 || b.min.y > 2.75) continue;
        for (let x = Math.floor(b.min.x / step); x <= Math.floor(b.max.x / step); x++)
          for (let z = Math.floor(b.min.z / step); z <= Math.floor(b.max.z / step); z++) {
            cell.min.set(x * step, 0.25, z * step);
            cell.max.set((x + 1) * step, 2.75, (z + 1) * step);
            if (cell.intersectsTriangle(triangle)) cells.add(`${x}:${z}`);
          }
      }
    }
    for (const child of node.listChildren()) visit(child, matrix);
  }
  for (const node of scene.listChildren()) visit(node, new THREE.Matrix4());
  const rows = new Map();
  for (const key of cells) {
    const [x, z] = key.split(':').map(Number);
    if (!rows.has(z)) rows.set(z, []);
    rows.get(z).push(x);
  }
  const rects = [],
    active = new Map();
  for (const [z, xs] of [...rows].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length; ) {
      const x0 = xs[i];
      let x1 = x0;
      while (++i < xs.length && xs[i] === x1 + 1) x1 = xs[i];
      const key = `${x0}:${x1}`,
        prior = active.get(key);
      if (prior && prior.maxZ === z * step) prior.maxZ = (z + 1) * step;
      else {
        const r = { minX: x0 * step, maxX: (x1 + 1) * step, minZ: z * step, maxZ: (z + 1) * step };
        rects.push(r);
        active.set(key, r);
      }
    }
  }
  return rects;
}

for (const [name, url] of Object.entries(MODELS)) {
  if (name === 'oak') continue;
  const source = path.resolve(study, url),
    doc = await io.read(source);
  const scene = doc.getRoot().listScenes()[0],
    bounds = getBounds(scene);
  const metadata = scene.getExtras();
  if (name === 'emerald' || name === 'pavilion') {
    metadata.campShell = shellColliders(scene);
    metadata.campTent = true;
  }
  const target = path.join(input, `${name}.glb`);
  await io.write(target, doc);
  models[`bandit:${name}`] = { url: `/models/bandit_camp/${name}.glb`, metadata, bounds };
  items.push({
    src: `tmp/asset_src/bandit_camp/${name}.glb`,
    out: `models/bandit_camp/${name}.glb`,
    type: 'static',
    keepExtras: true,
    maxTex: /emerald|pavilion/.test(name) ? 1024 : 512,
  });
  provenance.push({
    id: name,
    source: path.relative(path.dirname(study), source).replaceAll('\\', '/'),
    sha256: createHash('sha256')
      .update(await fs.readFile(source))
      .digest('hex'),
  });
}
const dressing = [
  ...TENTS.map((p) => ({ ...p, kind: 'tent' })),
  ...PROPS.filter((p) => !p.questProposal),
].map((p) => ({
  ...p,
  modelId: `bandit:${p.model}`,
  floorY: report.props.find((q) => q.id === p.id)?.supportingTentFloorY,
}));
const settlement = {
  id: 'gorrak-camp',
  zoneId: 'eastbrook_vale',
  decorationOnly: true,
  models: {},
  bounds: { xMin: 93, xMax: 132, zMin: 25, zMax: 76 },
  lots: [],
  roads: [],
  fixed: [],
  dressing,
  landmarks: [],
  fortifications: [],
};
const data = {
  models,
  settlement,
  supplies: PROPS.filter((p) => p.questProposal),
  tents: TENTS,
  palettes: JSON.parse(await fs.readFile(path.join(study, 'gang-palettes.json'), 'utf8')),
};
await fs.writeFile(
  path.join(root, 'src/sim/bandit_camp_data.json'),
  `${JSON.stringify(data, null, 2)}\n`,
);
await fs.writeFile(
  path.join(root, 'scripts/assets/specs/bandit_camp.json'),
  `${JSON.stringify({ source: 'Approved whole Meshy tents and supplied Fantasy Props derivatives', items }, null, 2)}\n`,
);
await fs.writeFile(
  path.join(root, 'scripts/assets/bandit_camp/provenance.json'),
  `${JSON.stringify({ study: 'artifacts/eastbrook-megakit-study/bandit-camp', archives: JSON.parse(await fs.readFile(path.join(study, 'assets-report.json'), 'utf8')), models: provenance }, null, 2)}\n`,
);
console.log(
  `Prepared ${items.length} native models; shell rectangles`,
  Object.entries(models)
    .filter(([, m]) => m.metadata.campShell)
    .map(([id, m]) => [id, m.metadata.campShell.length]),
);
