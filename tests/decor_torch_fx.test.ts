import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  zones: [{}],
  decorProps: [
    { key: 'kcasTorch', x: 10, z: 20, scale: 1 },
    { key: 'kcasTorchMounted', x: -5, z: 8, scale: 2, rot: Math.PI / 2 },
    { key: 'crateWooden', x: 0, z: 0 },
  ],
}));
vi.mock('../src/sim/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/sim/data')>()),
  getActiveWorldContent: () => ({ props: fixtures, zones: fixtures.zones }),
  zoneAt: () => fixtures.zones[0],
}));
vi.mock('../src/sim/world', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/sim/world')>()),
  terrainHeight: () => 3,
}));
vi.mock('../src/render/night_light_field', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/render/night_light_field')>()),
  hasNightLightField: () => true,
  registerStaticNightLights: vi.fn(),
}));

import { buildDecorTorchFx, planDecorTorches } from '../src/render/decor_torch_fx';

describe('decor torch flame seats', () => {
  it('roots the fire inside the shipped basket rather than above the model', async () => {
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const sites = planDecorTorches();
    expect(sites).toHaveLength(2);
    for (const [index, asset] of ['kcas_torch', 'kcas_torch_mounted'].entries()) {
      const doc = await io.read(
        fileURLToPath(new URL(`../public/models/biome/${asset}.glb`, import.meta.url)),
      );
      const vertices: THREE.Vector3[] = [];
      for (const node of doc.getRoot().listNodes()) {
        const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
        for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
          const position = primitive.getAttribute('POSITION');
          if (!position) throw new Error(`Torch primitive has no positions: ${asset}`);
          for (let i = 0; i < position.getCount(); i++) {
            vertices.push(
              new THREE.Vector3().fromArray(position.getElement(i, [])).applyMatrix4(matrix),
            );
          }
        }
      }
      // props.ts centres X/Z, seats min Y at zero, then sinks decor by 0.05.
      const bounds = new THREE.Box3().setFromPoints(vertices);
      const height = bounds.max.y - bounds.min.y;
      const placement = fixtures.decorProps[index];
      const rootHeight = (sites[index].y - (3 - 0.05)) / (placement.scale ?? 1);
      expect(rootHeight, asset).toBeGreaterThan(height * 0.55);
      expect(rootHeight, asset).toBeLessThan(height * 0.75);
    }
  });

  it('carries the mounted basket offset and flame size through placement rotation and scale', () => {
    const mounted = planDecorTorches()[1];
    expect(mounted.x).toBeCloseTo(-5 + 0.03 * 2);
    expect(mounted.z).toBeCloseTo(8);
    expect(mounted.scale).toBe(2);
  });

  it('applies the planned basket position and fixture scale to the live flame meshes', () => {
    const sites = planDecorTorches();
    const fx = buildDecorTorchFx();
    expect(fx.flames).toHaveLength(sites.length);
    for (const [index, site] of sites.entries()) {
      expect(fx.flames[index].position.toArray()).toEqual([site.x, site.y, site.z]);
      expect(fx.flames[index].scale.toArray()).toEqual([site.scale, site.scale, site.scale]);
    }
  });
});
