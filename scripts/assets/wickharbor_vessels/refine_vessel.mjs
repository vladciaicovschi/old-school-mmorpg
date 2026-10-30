import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prune, unpartition } from '@gltf-transform/functions';
import { mergeVesselPatch } from './merge_vessel_patch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function applyRigRefinement(doc, io, library) {
  const contract = JSON.parse(await readFile(path.join(here, 'rig_refinement.json'), 'utf8'));
  const scene = doc.getRoot().listScenes()[0];
  assert.equal(scene.getExtras().rigRevision, undefined, 'Refine the accepted source once');
  const file = path.join(library, contract.file);
  const bytes = await readFile(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), contract.patchSha256);
  await mergeVesselPatch(doc, await io.read(file), contract.roles);
  scene.setExtras({
    ...scene.getExtras(),
    rigRevision: contract.revision,
    rigPatchSha256: contract.patchSha256,
    rigChecks: contract.checks,
  });
  await doc.transform(prune(), unpartition());
}
