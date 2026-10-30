import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildModel } from '../src/guide/viewer/model';
import { spiritDye } from '../src/render/characters/spirit_appearance';
import { SPORELING_PALETTES } from '../src/render/characters/sporeling_palettes';

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
  it('removes the imported glossy film in guide clones and retains shared PBR maps', async () => {
    const scene = new THREE.Group(),
      base = new THREE.Texture(),
      pbr = new THREE.Texture(),
      normal = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({
      map: base,
      metalness: 1,
      roughness: 0.1,
      metalnessMap: pbr,
      roughnessMap: pbr,
      normalMap: normal,
    });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), source));
    loader.loadGltf.mockResolvedValue({ scene, animations: [] });
    const model = await buildModel(
      { url: 'tribal.glb', idle: null, height: 2.5, matte: true },
      null,
    );
    const material = (model.root.getObjectByProperty('isMesh', true) as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    expect(material.metalness).toBe(0);
    expect(material.roughness).toBe(1);
    expect(material.metalnessMap).toBeNull();
    expect(material.roughnessMap).toBeNull();
    expect(material.map).toBe(base);
    expect(material.normalMap).toBe(normal);
    expect(source.metalnessMap).toBe(pbr);
    expect(source.roughness).toBe(0.1);
    const shared = vi.spyOn(pbr, 'dispose');
    model.dispose();
    expect(shared).not.toHaveBeenCalled();
  });
  it('shows the final calibrated native hand transform in guide attachments', async () => {
    const scene = new THREE.Group(),
      hand = new THREE.Bone();
    hand.name = 'mixamorigRightHand';
    scene.add(hand);
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
    const weapon = new THREE.Group();
    weapon.name = 'tribal_weapon';
    weapon.add(
      new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 0.1), new THREE.MeshStandardMaterial()),
    );
    loader.loadGltf.mockImplementation((url: string) =>
      Promise.resolve({ scene: url === 'weapon.glb' ? weapon : scene, animations: [] }),
    );
    const model = await buildModel(
      {
        url: 'native.glb',
        idle: null,
        height: 2.5,
        attach: [
          {
            url: 'weapon.glb',
            bone: 'mixamorig:RightHand',
            position: [0.01, 0.04, 0],
            rotationDeg: [10, 20, 30],
            scale: 0.5,
          },
        ],
      },
      null,
    );
    const prop = model.root.getObjectByName('tribal_weapon')!;
    expect(prop.position.toArray()).toEqual([0.01, 0.04, 0]);
    expect(prop.scale.toArray()).toEqual([0.5, 0.5, 0.5]);
    expect(prop.rotation.x).toBeCloseTo(Math.PI / 18);
    expect(prop.rotation.y).toBeCloseTo(Math.PI / 9);
    expect(weapon.position.toArray()).toEqual([0, 0, 0]);
    model.dispose();
  });
});
