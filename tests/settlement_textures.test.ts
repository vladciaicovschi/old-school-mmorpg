import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { prepareSettlementTextures } from '../src/render/settlement_textures';

describe('shared settlement texture bindings', () => {
  it('shares cached atlases across models without mutating loader materials', async () => {
    const atlas = new THREE.Texture();
    const cache = new Map<string, Promise<THREE.Texture>>();
    const load = (url: string) => {
      if (!cache.has(url)) cache.set(url, Promise.resolve(atlas));
      return cache.get(url)!;
    };
    const make = () => {
      const group = new THREE.Group(),
        material = new THREE.MeshStandardMaterial({ name: 'native' });
      group.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
      group.userData.settlementTextureBindings = [
        {
          material: 'native',
          slots: { map: '/shared.ktx2', normalMap: '/shared.ktx2' },
          normalScale: 0.5,
          aoMapIntensity: 0.8,
        },
      ];
      return group;
    };
    const a = make(),
      b = make();
    const [first, second] = await Promise.all([
      prepareSettlementTextures(a, load),
      prepareSettlementTextures(b, load),
    ]);
    const material = (group: THREE.Group) =>
      (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(cache.size).toBe(1);
    expect(material(first).map).toBe(atlas);
    expect(material(second).map).toBe(material(first).map);
    expect(material(first).normalMap).toBe(atlas);
    expect(material(first).normalScale.x).toBe(0.5);
    expect(material(a).map).toBeNull();
    expect(material(b).map).toBeNull();
    expect((first.children[0] as THREE.Mesh).geometry).toBe((a.children[0] as THREE.Mesh).geometry);
  });
});
