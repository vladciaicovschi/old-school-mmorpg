import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, type Node, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { WICKHARBOR_SAILSHIP } from '../src/sim/wickharbor_vessels';

const root = path.resolve(import.meta.dirname, '..');
const contract = JSON.parse(
  readFileSync(path.join(root, 'scripts/assets/wickharbor_vessels/rig_refinement.json'), 'utf8'),
);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const files = ['sailship', 'sailship-blue', 'sailship-russet'];

function points(node: Node, material?: string): Vector3[] {
  const matrix = new Matrix4().fromArray(node.getWorldMatrix());
  const output: Vector3[] = [];
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    if (material && primitive.getMaterial()?.getName() !== material) continue;
    const position = primitive.getAttribute('POSITION');
    if (!position) throw new Error('Missing ship positions');
    const element: number[] = [];
    for (let i = 0; i < position.getCount(); i++) {
      position.getElement(i, element);
      output.push(new Vector3(element[0], element[1], element[2]).applyMatrix4(matrix));
    }
  }
  return output;
}

describe('Refined brigantine rig', () => {
  it('pins verified independent cloth, physical bindings and a full foredeck body clearance check', () => {
    expect(contract.revision).toBe('rig-refinement-v21');
    expect(contract.checks.canvasCount).toBe(5);
    expect(contract.checks.canvasIntersections).toEqual([]);
    expect(contract.checks.ropeIntersections).toEqual([]);
    expect(contract.checks.minimumCrewHeadGapM).toBeGreaterThan(0.12);
    expect(contract.checks.foredeckBodyRadiusM).toBe(0.3);
    expect(contract.checks.foredeckClearPoses).toBeGreaterThan(100);
    expect(contract.checks.maximumBindingGapM).toBeLessThan(0.012);
    expect(contract.checks.unchangedBodyObjects).toBeGreaterThan(840);
  });

  for (const file of files) {
    it(`${file} has actual raised foredeck cloth and the taller supporting after mast`, async () => {
      const doc = await io.read(path.join(root, `public/models/wickharbor_vessels/${file}.glb`));
      const scene = doc.getRoot().listScenes()[0];
      expect(scene.getExtras()).toMatchObject({
        rigRevision: contract.revision,
        rigPatchSha256: contract.patchSha256,
        rigChecks: contract.checks,
      });
      const nodes = doc.getRoot().listNodes();
      const sails = nodes.find((node) => node.getExtras().role === 'sails');
      const masts = nodes.find((node) => node.getExtras().role === 'masts');
      const hull = nodes.find((node) => node.getExtras().role === 'hull');
      if (!sails || !masts || !hull) throw new Error('Missing refined ship geometry');
      const foredeck = points(sails, 'Native_Light_Linen').filter(
        (p) => p.x >= -6.6 && p.x <= -1.8 && Math.abs(p.z) < 0.25,
      );
      expect(foredeck.length).toBeGreaterThan(20);
      expect(Math.min(...foredeck.map((p) => p.y))).toBeGreaterThan(3.42 + 1.8 + 0.12);
      const afterMast = points(masts).filter(
        (p) => Math.abs(p.x - 5.4) < 0.25 && Math.abs(p.z) < 0.25,
      );
      expect(Math.max(...afterMast.map((p) => p.y))).toBeCloseTo(15.2, 2);
      const bounds = getBounds(scene),
        hullBounds = getBounds(hull);
      const centreX = (bounds.min[0] + bounds.max[0]) / 2;
      expect(
        Math.max(Math.abs(hullBounds.min[0] - centreX), Math.abs(hullBounds.max[0] - centreX)),
      ).toBeLessThanOrEqual(WICKHARBOR_SAILSHIP.hullHalfDepth);
      expect(
        Math.max(Math.abs(hullBounds.min[2]), Math.abs(hullBounds.max[2])),
      ).toBeLessThanOrEqual(WICKHARBOR_SAILSHIP.hullHalfWidth);
      expect(bounds.min[1]).toBeCloseTo(-WICKHARBOR_SAILSHIP.nativeDraft, 2);
      // Immutable accepted body groups stay at the same topology counts.
      for (const [role, triangles] of Object.entries({
        hull: 36963,
        deck: 1756,
        framing: 6698,
        cabin: 4450,
        helm: 1258,
        lanterns: 17004,
        stairs: 624,
      })) {
        const node = nodes.find((n) => n.getExtras().role === role);
        expect(
          node
            ?.getMesh()
            ?.listPrimitives()
            .reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? 0) / 3, 0),
        ).toBe(triangles);
      }
    });
  }
});
