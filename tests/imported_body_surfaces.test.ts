import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyMaterials, tintedFarMaterials } from '../src/render/characters/assets';
import { VISUALS } from '../src/render/characters/manifest';
import { gfxInternalsForTest } from '../src/render/gfx';
import {
  IMPORTED_CREATURE_BODY_KEYS,
  IMPORTED_NPC_BODY_KEYS,
} from './helpers/imported_body_visuals';

vi.mock('../src/render/assets/loader', () => ({
  loadGltf: vi.fn(() => new Promise(() => undefined)),
  loadKtx2Texture: vi.fn(() => new Promise(() => undefined)),
  loadTexture: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: vi.fn(),
  registerDeferredPreload: vi.fn((start: () => unknown) => start()),
}));

describe.each([true, false])(
  'imported body surfaces, standardMaterials=%s',
  (standardMaterials) => {
    it.each([...IMPORTED_NPC_BODY_KEYS, ...IMPORTED_CREATURE_BODY_KEYS])(
      '%s loses the surface film near and far while keeping its painted atlas',
      (key) => {
        const restore = gfxInternalsForTest.overrideSettings({ standardMaterials });
        try {
          const atlas = new THREE.Texture();
          const normal = new THREE.Texture();
          const response = new THREE.Texture();
          // Meshy exports use metallic/roughness maps and glTF's 1/1 factors.
          const source = new THREE.MeshStandardMaterial({
            map: atlas,
            normalMap: normal,
            metalness: 1,
            roughness: 1,
            metalnessMap: response,
            roughnessMap: response,
          });
          const mesh = new THREE.Mesh(new THREE.BufferGeometry(), source);
          mesh.userData.bodyMesh = true;
          const root = new THREE.Group();
          root.add(mesh);
          applyMaterials(root, VISUALS[key], 0xffffff);
          const far = tintedFarMaterials(VISUALS[key], 0xffffff, [source], [true])[0];
          expect(mesh.material).not.toBe(source);
          expect(far).not.toBe(mesh.material);
          for (const material of [mesh.material, far]) {
            const shaded = material as THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
            expect(shaded.map).toBe(atlas);
            if (standardMaterials) {
              const pbr = shaded as THREE.MeshStandardMaterial;
              expect(pbr.metalness).toBe(0);
              expect(pbr.roughness).toBe(1);
              expect(pbr.metalnessMap).toBeNull();
              expect(pbr.roughnessMap).toBeNull();
              expect(pbr.normalMap).toBe(normal);
            } else {
              expect((shaded as THREE.MeshLambertMaterial).isMeshLambertMaterial).toBe(true);
              // Scale the readability floor through the atlas; black stays black.
              expect(shaded.emissiveMap).toBe(atlas);
              expect(shaded.emissive.getHex()).not.toBe(0);
            }
          }
          expect(source.map).toBe(atlas);
          expect(source.normalMap).toBe(normal);
          expect(source.metalness).toBe(1);
          expect(source.roughness).toBe(1);
          expect(source.metalnessMap).toBe(response);
          expect(source.roughnessMap).toBe(response);
        } finally {
          restore();
        }
      },
    );
  },
);

it('keeps deliberate ice/water surfaces and stock kit bodies outside the imported matte profile', () => {
  for (const key of ['npc_dev_ice_elemental', 'npc_dev_water_elemental']) {
    expect(VISUALS[key].matte).toBeFalsy();
    expect(VISUALS[key].authoredAtlas).toBe(true);
  }
  for (const key of ['player_warrior', 'npc_villager', 'mob_murloc', 'mob_kobold']) {
    expect(VISUALS[key].matte).toBeFalsy();
    expect(VISUALS[key].authoredAtlas).toBeFalsy();
  }
});
