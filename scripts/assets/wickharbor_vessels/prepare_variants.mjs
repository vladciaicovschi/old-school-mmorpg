import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, unpartition } from '@gltf-transform/functions';
import { applySelectedRig } from './fleet_rig.mjs';
import { mergeVesselPatch } from './merge_vessel_patch.mjs';
import { VARIANT_FINGERPRINT_INPUTS, variantFingerprint } from './variant_contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const library = path.resolve(process.argv[2] ?? path.join(root, '../bible/models/ambient/boats'));
const load = async (file) => JSON.parse(await readFile(file, 'utf8'));
const upstream = await load(path.join(here, 'upstream.json'));
const sources = await load(path.join(here, 'variant_sources.json'));
const { variants } = await load(path.join(here, 'sailship_variants.json'));
const fingerprint = variantFingerprint(
  await Promise.all(
    VARIANT_FINGERPRINT_INPUTS.map(async (name) => [name, await readFile(path.join(root, name))]),
  ),
);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const output = path.join(root, 'tmp/asset_src/wickharbor_vessels');
await mkdir(output, { recursive: true });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const baseFile = path.join(library, upstream.sailship.file);
assert.equal(sha(await readFile(baseFile)), upstream.sailship.sourceSha256);
assert.equal(
  sha(await readFile(path.join(library, 'sailing-modular-v1/output/sailing-modular.blend'))),
  sources.acceptedBlendSha256,
);
for (const source of sources.variants) {
  const style = variants.find((row) => row.id === source.style);
  assert.equal(source.foreRail, source.aftRail, 'One railing style per vessel');
  const doc = await io.read(baseFile);
  await applySelectedRig(doc, io, library, source.rig);
  if (source.file) {
    const patchFile = path.join(library, source.file);
    assert.equal(sha(await readFile(patchFile)), source.patchSha256);
    await mergeVesselPatch(doc, await io.read(patchFile), ['cargo', 'railings']);
    await doc.transform(prune(), unpartition());
  }
  const linen = doc
    .getRoot()
    .listMaterials()
    .find((m) => m.getName() === 'Native_Light_Linen');
  assert(linen?.getBaseColorTexture(), 'Keep the accepted woven linen texture');
  linen.setBaseColorFactor(style?.sailTint ?? [1, 1, 1, 1]);
  const scene = doc.getRoot().listScenes()[0];
  scene.setExtras({
    ...scene.getExtras(),
    vessel: 'sailship',
    variant: source.id,
    style: source.style,
    sourceSha256: upstream.sailship.sourceSha256,
    sourceFingerprint: fingerprint,
    patchSha256: source.patchSha256,
    foreRail: source.foreRail,
    aftRail: source.aftRail,
    panelSourcesByZone: source.panelSourcesByZone,
    cargoSources: style?.cargo.map((row) => row[1]) ?? ['accepted-v20'],
    draftM: upstream.sailship.draftM,
    source: 'Approved study rig on accepted modular hull with uniform pack railings',
    units: 'metres',
    lengthAxis: 'X',
  });
  await doc.transform(prune(), unpartition());
  const triangles = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0);
  assert.equal(triangles, source.triangles);
  await io.write(path.join(output, source.outputFile), doc);
  console.log(
    JSON.stringify({
      id: source.id,
      rig: source.rig,
      triangles,
      bounds: getBounds(scene),
      fingerprint,
    }),
  );
}
