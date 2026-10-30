import path from 'node:path';
import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { WICKHARBOR_LIGHTHOUSE } from '../src/sim/wickharbor_layout';
import { settlementScene } from './helpers/settlement_scene';

const fixture = vi.hoisted(() => ({ town: null as THREE.Group | null }));
vi.mock('../src/render/wickharbor_town', () => ({
  wickharborPreloadInternalsForTest: { assetUrls: [] },
  buildWickharborTown: () => ({ group: fixture.town, cullGroups: [], update() {}, dispose() {} }),
}));

import { buildGaleFeatures } from '../src/render/gale_features';

let source: THREE.Group;
beforeAll(async () => {
  source = await settlementScene(path.resolve('public/models/wickharbor/lighthouse_round.glb'));
});

describe('Wickharbor rotating beacon', () => {
  for (const grade of [0, 13.7]) {
    it(`starts both beams and the glow at the shipping model's scaled lamp, grade ${grade}`, () => {
      const town = new THREE.Group(),
        lighthouse = new THREE.Group(),
        native = source.clone(true);
      native.scale.setScalar(WICKHARBOR_LIGHTHOUSE.scale);
      lighthouse.position.set(WICKHARBOR_LIGHTHOUSE.x, grade, WICKHARBOR_LIGHTHOUSE.z);
      lighthouse.add(native);
      town.add(lighthouse);
      fixture.town = town;
      const lamp = town.getObjectByName('beacon-lamp');
      expect(lamp).toBeDefined();
      if (!lamp) throw new Error('Shipping lighthouse has no beacon lamp');
      const origin = lamp.getWorldPosition(new THREE.Vector3());
      const view = buildGaleFeatures(20061);
      const beam = view.cullGroups.find((root) =>
        root.children.some(
          (child) => child instanceof THREE.Mesh && child.geometry.type === 'ConeGeometry',
        ),
      );
      expect(beam).toBeDefined();
      if (!beam) throw new Error('Beacon beam missing');
      expect(beam.getWorldPosition(new THREE.Vector3()).distanceTo(origin)).toBeLessThan(1e-6);
      expect(view.glowLights).toHaveLength(1);
      expect(
        view.glowLights[0].getWorldPosition(new THREE.Vector3()).distanceTo(origin),
      ).toBeLessThan(1e-6);
      view.update(3, new THREE.PerspectiveCamera(), new THREE.Vector3(), 0.05);
      for (const cone of beam.children) {
        const apex = cone.localToWorld(new THREE.Vector3(0, 30, 0));
        expect(apex.distanceTo(origin)).toBeLessThan(1e-6);
      }
    });
  }
});
