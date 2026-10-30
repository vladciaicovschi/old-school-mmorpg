import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prune, unpartition } from '@gltf-transform/functions';
import { mergeVesselPatch } from './merge_vessel_patch.mjs';
import { applyRigRefinement } from './refine_vessel.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function applySelectedRig(doc, io, library, rig) {
  if (rig === 'brigantine') {
    await applyRigRefinement(doc, io, library);
  } else {
    const metadata = JSON.parse(await readFile(path.join(here, 'fleet_rigs.json'), 'utf8'));
    const source = metadata.rigs.find((row) => row.id === rig);
    assert(source, `Unknown rig ${rig}`);
    const file = path.join(library, source.file);
    assert.equal(
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
      source.patchSha256,
    );
    for (const [name, hash] of Object.entries(metadata.sourceHashes)) {
      // Resolve the immutable source by its library-relative suffix on every host.
      const relative = name.replaceAll('\\', '/').split('/boats/')[1];
      assert(relative, `Source outside boat library: ${name}`);
      assert.equal(
        createHash('sha256')
          .update(await readFile(path.join(library, relative)))
          .digest('hex'),
        hash,
      );
    }
    await mergeVesselPatch(doc, await io.read(file), source.roles);
    const scene = doc.getRoot().listScenes()[0];
    scene.setExtras({
      ...scene.getExtras(),
      rigRevision: source.revision,
      rigPatchSha256: source.patchSha256,
      rigChecks: source.checks,
    });
    await doc.transform(prune(), unpartition());
  }
  const scene = doc.getRoot().listScenes()[0];
  scene.setExtras({ ...scene.getExtras(), rigType: rig });
}
