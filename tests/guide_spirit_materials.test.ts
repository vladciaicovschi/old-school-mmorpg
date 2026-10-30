import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildModel } from '../src/guide/viewer/model';
import { SPORELING_PALETTES } from '../src/render/characters/sporeling_palettes';
import { spiritDye } from '../src/render/characters/spirit_appearance';

const loader = vi.hoisted(() => ({ loadGltf: vi.fn() }));
vi.mock('../src/render/assets/loader', () => loader);

describe('guide spirit material parity', () => {
  it('keeps palettes isolated on a shared GLB and disposes only owned clones', async () => {
    const scene = new THREE.Group();
    const texture = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({ map: texture });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), source));
    loader.loadGltf.mockResolvedValue({ scene, animations: [] });
    const base = { url: 'models/creatures/community_wisp.glb', idle: null, height: 1.15 };
    const ice = await buildModel({ ...base, spirit: 'ice', atlasDye: spiritDye('ice') }, null);
    const lily = await buildModel({ ...base, spirit: 'lily', atlasDye: spiritDye('lily') }, null);
    const iceMat = (ice.root.getObjectByProperty('isMesh', true) as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    const lilyMat = (lily.root.getObjectByProperty('isMesh', true) as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    expect(iceMat).not.toBe(lilyMat);
    expect(iceMat.userData.spiritKind).toBe('ice');
    expect(lilyMat.userData.spiritKind).toBe('lily');
    expect(iceMat.emissive.equals(lilyMat.emissive)).toBe(false);
    expect(iceMat.opacity).toBe(0.94);
    expect(iceMat.map).toBe(texture);
    expect(source.transparent).toBe(false);
    expect(source.userData).toEqual({});
    const owned = vi.spyOn(iceMat, 'dispose');
    const shared = vi.spyOn(source, 'dispose');
    const map = vi.spyOn(texture, 'dispose');
    ice.dispose();
    ice.dispose();
    expect(owned).toHaveBeenCalledTimes(1);
    expect(shared).not.toHaveBeenCalled();
    expect(map).not.toHaveBeenCalled();
    expect(lilyMat.userData.spiritKind).toBe('lily');
    lily.dispose();
  });
  it('applies a non-spirit sporeling palette without mutating shared maps', async () => {
    const scene = new THREE.Group();
    const texture = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({ map: texture });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), source));
    loader.loadGltf.mockResolvedValue({ scene, animations: [] });
    const model = await buildModel(
      { url: 'sporeling.glb', idle: null, height: 1.45, atlasDye: SPORELING_PALETTES.ordinary },
      null,
    );
    const material = (model.root.getObjectByProperty('isMesh', true) as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    expect(material).not.toBe(source);
    expect(material.map).toBe(texture);
    expect(material.transparent).toBe(false);
    expect(material.userData.spiritKind).toBeUndefined();
    expect(source.userData).toEqual({});
    const owned = vi.spyOn(material, 'dispose');
    const shared = vi.spyOn(source, 'dispose');
    model.dispose();
    model.dispose();
    expect(owned).toHaveBeenCalledTimes(1);
    expect(shared).not.toHaveBeenCalled();
  });
});
