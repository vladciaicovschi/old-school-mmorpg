import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { applySelectedRig } from './fleet_rig.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const library = path.resolve(process.argv[2] ?? path.join(root, '../bible/models/ambient/boats'));
const load = async (file) => JSON.parse(await readFile(file, 'utf8'));
const report = await load(path.join(library, 'sailing-variants-v2/build-report.json'));
const upstream = await load(path.join(here, 'upstream.json'));
const { ships } = await load(path.join(here, 'fleet_compositions.json'));
assert(report.sourcesUnchanged);
const acceptedBlendSha256 = Object.entries(report.sourceHashes).find(([name]) =>
  name.replaceAll('\\', '/').endsWith('/sailing-modular-v1/output/sailing-modular.blend'),
)?.[1];
assert.match(acceptedBlendSha256 ?? '', /^[0-9a-f]{64}$/);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const count = (doc, roles) =>
  doc
    .getRoot()
    .listNodes()
    .filter((n) => !roles || roles.includes(n.getExtras().role))
    .reduce(
      (sum, n) =>
        sum +
        (n
          .getMesh()
          ?.listPrimitives()
          .reduce((s, p) => s + p.getIndices().getCount() / 3, 0) ?? 0),
      0,
    );
const variants = [];
for (const ship of ships.filter((row) => row.id !== 'linen')) {
  const doc = await io.read(path.join(library, upstream.sailship.file));
  await applySelectedRig(doc, io, library, ship.rig);
  const style = report.variants.find((row) => row.id === ship.style);
  const triangles =
    count(doc) -
    (style ? count(doc, ['cargo', 'railings']) : 0) +
    (style ? Object.values(style.roles).reduce((s, r) => s + r.triangles, 0) : 0);
  variants.push({
    ...(style ?? {
      foreRail: 'cross',
      aftRail: 'cross',
      retainedPosts: 8,
      cargo: [],
      panelSourcesByZone: { fore: ['Balcony_Cross_Straight'], aft: ['Balcony_Cross_Straight'] },
    }),
    ...ship,
    outputFile: `${ship.file}.glb`,
    file: style ? `sailing-variants-v2/output/${ship.style}.patch.glb` : null,
    patchSha256: style?.patchSha256 ?? null,
    triangles,
  });
}
await writeFile(
  path.join(here, 'variant_sources.json'),
  `${JSON.stringify({ acceptedBlendSha256, authoringSources: report.donorHashes, variants }, null, 2)}\n`,
);
console.log(`Recorded ${variants.length} mixed fleet derivatives`);
