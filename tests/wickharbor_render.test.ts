import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type Material as GltfMaterial, type Node as GltfNode, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import {
  assembleWickharborTown,
  WICKHARBOR_MODEL_IDS,
  wickharborModels,
} from '../src/render/wickharbor_town';
import {
  localPoint,
  WICKHARBOR_LIGHTHOUSE,
  WICKHARBOR_NATIVE_METADATA,
  wickharborPlans,
} from '../src/sim/wickharbor_layout';
import { terrainHeight } from '../src/sim/world';

const root = path.resolve(import.meta.dirname, '..');
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
async function source(id: string): Promise<THREE.Group> {
  const document = await io.read(
    path.join(root, 'public/models/wickharbor', `${id.replaceAll('-', '_')}.glb`),
  );
  const materials = new Map<GltfMaterial, THREE.MeshStandardMaterial>();
  for (const m of document.getRoot().listMaterials()) {
    const f = m.getBaseColorFactor();
    materials.set(
      m,
      new THREE.MeshStandardMaterial({
        name: m.getName(),
        color: new THREE.Color().setRGB(f[0], f[1], f[2]),
        opacity: f[3],
        transparent: m.getAlphaMode() === 'BLEND',
        side: m.getDoubleSided() ? THREE.DoubleSide : THREE.FrontSide,
      }),
    );
  }
  function node(from: GltfNode): THREE.Group {
    const group = new THREE.Group();
    group.name = from.getName();
    group.userData = structuredClone(from.getExtras());
    group.position.fromArray(from.getTranslation());
    group.quaternion.fromArray(from.getRotation());
    group.scale.fromArray(from.getScale());
    for (const primitive of from.getMesh()?.listPrimitives() ?? []) {
      const geometry = new THREE.BufferGeometry();
      for (const [semantic, name] of [
        ['POSITION', 'position'],
        ['NORMAL', 'normal'],
        ['TEXCOORD_0', 'uv'],
        ['COLOR_0', 'color'],
      ]) {
        const a = primitive.getAttribute(semantic);
        if (a)
          geometry.setAttribute(
            name,
            new THREE.BufferAttribute(
              a.getArray()!.slice() as THREE.TypedArray,
              a.getElementSize(),
              a.getNormalized(),
            ),
          );
      }
      const index = primitive.getIndices();
      if (index)
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(index.getArray()!), 1));
      group.add(new THREE.Mesh(geometry, materials.get(primitive.getMaterial()!)!));
    }
    for (const child of from.listChildren()) group.add(node(child));
    return group;
  }
  const scene = document.getRoot().listScenes()[0],
    result = new THREE.Group();
  result.userData = structuredClone(scene.getExtras());
  for (const child of scene.listChildren()) result.add(node(child));
  return result;
}

describe('shipping Wickharbor geometry without a browser', () => {
  it('ships every preloaded model with KTX2 textures, meshopt and manifest ownership', () => {
    for (const id of WICKHARBOR_MODEL_IDS) {
      const logical = `models/wickharbor/${id.replaceAll('-', '_')}.glb`,
        file = path.join(root, 'public', logical);
      expect(existsSync(file), logical).toBe(true);
      expect(MEDIA_ASSETS[logical]).toMatch(/^\/media\//);
      const bytes = readFileSync(file),
        json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
      expect(json.extensionsUsed).toContain('EXT_meshopt_compression');
      for (const image of json.images ?? []) expect(image.mimeType).toBe('image/ktx2');
    }
  });
  it('preserves authored anchors and clear tower headroom on both material tiers', async () => {
    const input = Object.fromEntries(
      await Promise.all(WICKHARBOR_MODEL_IDS.map(async (id) => [id, await source(id)])),
    );
    const original = new THREE.Box3().setFromObject(input['lighthouse-round']);
    for (const standard of [true, false]) {
      const models = wickharborModels(input, standard);
      const town = assembleWickharborTown(models, (x, z) => terrainHeight(x, z, 20061));
      expect(town.group.children.filter((o) => o.userData.lotId)).toHaveLength(21);
      expect(town.cullGroups.length).toBeGreaterThan(22);
      town.group.updateWorldMatrix(true, true);
      const lighthouse = models['lighthouse-round'];
      lighthouse.updateWorldMatrix(true, true);
      const s = WICKHARBOR_NATIVE_METADATA['lighthouse-round'].staircase!;
      for (let i = 0; i < s.count; i++) {
        const a = (i + 0.5) * s.angleStep,
          y = s.baseY + ((i + 1) * (s.topY - s.baseY)) / s.count;
        const ray = new THREE.Raycaster(
          new THREE.Vector3(Math.sin(a) * 1.75, y + 0.08, Math.cos(a) * 1.75),
          new THREE.Vector3(0, 1, 0),
          0,
          2.1,
        );
        expect(ray.intersectObject(lighthouse, true), `head clearance on tread ${i}`).toHaveLength(
          0,
        );
      }
      const builtLighthouse = town.group.getObjectByName('wickharbor:old-beacon')!;
      const beaconBounds = new THREE.Box3().setFromObject(builtLighthouse);
      expect(beaconBounds.max.y - beaconBounds.min.y).toBeCloseTo(
        original.max.y * WICKHARBOR_LIGHTHOUSE.scale - original.min.y * WICKHARBOR_LIGHTHOUSE.scale,
        4,
      );
      const worldStairs = WICKHARBOR_LIGHTHOUSE.metadata.staircase!;
      for (let i = 0; i < worldStairs.count; i++) {
        const a = (i + 0.5) * worldStairs.angleStep;
        const y =
          builtLighthouse.position.y +
          worldStairs.baseY +
          ((i + 1) * (worldStairs.topY - worldStairs.baseY)) / worldStairs.count;
        const radius = 1.75 * WICKHARBOR_LIGHTHOUSE.scale;
        const ray = new THREE.Raycaster(
          new THREE.Vector3(498 + Math.sin(a) * radius, y + 0.08, 308 + Math.cos(a) * radius),
          new THREE.Vector3(0, 1, 0),
          0,
          2.6,
        );
        expect(
          ray.intersectObject(builtLighthouse, true),
          `player headroom on world tread ${i}`,
        ).toHaveLength(0);
      }
      const plans = wickharborPlans((x, z) => terrainHeight(x, z, 20061));
      for (const id of ['inn', 'chapel']) {
        const { lot, placement, metadata, scale } = plans.find((plan) => plan.lot.id === id)!;
        const holder = town.group.getObjectByName(`wickharborBuilding:${id}`)!;
        const entry = metadata.entrance ?? { x: 0, z: lot.d / 2, thresholdY: 0.03 * scale };
        const start = localPoint(lot, entry.x, entry.z + placement.offsetZ + scale);
        const direction = new THREE.Vector3(-Math.sin(lot.rot), 0, -Math.cos(lot.rot));
        for (const bodyHeight of [1, 2.6]) {
          const ray = new THREE.Raycaster(
            new THREE.Vector3(start.x, placement.grade + entry.thresholdY + bodyHeight, start.z),
            direction,
            0,
            2 * scale,
          );
          expect(
            ray.intersectObject(holder, true),
            `${id} clear for ${bodyHeight} world-unit body: ${JSON.stringify(ray.intersectObject(holder, true).map((h) => ({ name: h.object.name, point: h.point.toArray(), parent: h.object.parent?.name })))}`,
          ).toHaveLength(0);
        }
      }
      let instanced = 0;
      town.group.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) {
          instanced++;
          expect(o.boundingSphere).not.toBeNull();
        }
      });
      expect(instanced).toBeGreaterThan(20);
    }
    expect(new THREE.Box3().setFromObject(input['lighthouse-round']).equals(original)).toBe(true);
  }, 30000);
});
