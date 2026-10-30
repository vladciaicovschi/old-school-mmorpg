import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const library = path.resolve(process.argv[2] ?? path.join(root, '../bible/models/ambient/boats'));
const report = JSON.parse(
  await readFile(path.join(library, 'sailing-refined-v21/verification.json'), 'utf8'),
);
assert.equal(report.canvasCount, 5);
assert.deepEqual(report.canvasIntersections, []);
assert.deepEqual(report.ropeIntersections, []);
assert(report.minimumCrewHeadGapM > 0.12 && report.foredeckClearPoses > 0);
assert(report.maximumBindingGapM < 0.012);
const file = 'sailing-refined-v21/output/rig.patch.glb';
assert.equal(
  createHash('sha256')
    .update(await readFile(path.join(library, file)))
    .digest('hex'),
  report.patchSha256,
);
const contract = {
  revision: report.revision,
  file,
  patchSha256: report.patchSha256,
  acceptedBaseSources: report.acceptedSourceHashes,
  baseHelperSha256: report.baseHelperSha256,
  roles: ['masts', 'rigging', 'sails', 'fittings'],
  triangles: report.triangles,
  roleTriangles: report.roleTriangles,
  checks: {
    canvasCount: report.canvasCount,
    canvasIntersections: report.canvasIntersections,
    ropeIntersections: report.ropeIntersections,
    minimumCrewHeadGapM: report.minimumCrewHeadGapM,
    foredeckBodyRadiusM: report.foredeckBodyRadiusM,
    foredeckClearPoses: report.foredeckClearPoses,
    maximumBindingGapM: report.maximumBindingGapM,
    unchangedBodyObjects: report.unchangedBodyObjects,
  },
};
await writeFile(path.join(here, 'rig_refinement.json'), `${JSON.stringify(contract, null, 2)}\n`);
console.log(
  `Recorded ${report.revision}: ${report.triangles} triangles and checked crew clearance`,
);
