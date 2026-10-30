import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { applyRigRefinement } from './refine_vessel.mjs';
import { FINGERPRINT_INPUTS, sourceFingerprint } from './source_contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const library = path.resolve(process.argv[2] ?? path.join(root, '../bible/models/ambient/boats'));
const upstream = JSON.parse(await readFile(path.join(here, 'upstream.json'), 'utf8'));
const fingerprint = sourceFingerprint(
  await Promise.all(
    FINGERPRINT_INPUTS.map(async (name) => [name, await readFile(path.join(root, name))]),
  ),
);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const output = path.join(root, 'tmp/asset_src/wickharbor_vessels');
await mkdir(output, { recursive: true });
for (const [kind, input] of Object.entries(upstream)) {
  const source = path.join(library, input.file);
  const bytes = await readFile(source);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    input.sourceSha256,
    `Unexpected upstream ${kind}; inspect and update provenance before importing`,
  );
  const doc = await io.read(source);
  if (kind === 'rowboat') {
    for (const material of doc.getRoot().listMaterials()) {
      material.setBaseColorFactor(input.baseColorFactor);
      material.setMetallicRoughnessTexture(null);
      material.setMetallicFactor(0);
      material.setRoughnessFactor(input.roughness);
      material.setNormalScale(input.normalStrength);
    }
  }
  const scene = doc.getRoot().listScenes()[0];
  const triangles = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0);
  assert.equal(triangles, input.triangles);
  if (kind === 'sailship') await applyRigRefinement(doc, io, library);
  scene.setExtras({
    ...scene.getExtras(),
    vessel: kind,
    sourceSha256: input.sourceSha256,
    sourceFingerprint: fingerprint,
    draftM: input.draftM,
    source: input.source,
    units: 'metres',
    lengthAxis: 'X',
  });
  await io.write(path.join(output, `${kind}.glb`), doc);
  console.log(JSON.stringify({ kind, triangles, bounds: getBounds(scene), fingerprint }));
}
