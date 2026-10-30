import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyMaterials, tintedFarMaterials } from '../src/render/characters/assets';
import { VISUALS } from '../src/render/characters/manifest';
import { SPIRIT_APPEARANCE } from '../src/render/characters/spirit_appearance';
import { SpiritBodyVfx } from '../src/render/characters/spirit_body_vfx';
import { gfxInternalsForTest } from '../src/render/gfx';
import { cloneMaterialWithHooks } from '../src/render/material_clone_hooks';

vi.mock('../src/render/assets/loader', () => ({
  loadGltf: vi.fn(() => new Promise(() => undefined)),
  loadKtx2Texture: vi.fn(() => new Promise(() => undefined)),
  loadTexture: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: vi.fn(),
  registerDeferredPreload: vi.fn(),
}));

describe('permanent spirit surfaces and owned mist', () => {
  it.each([true, false])(
    'isolates spectral materials across rig/far/effects (standard=%s)',
    (standard) => {
      gfxInternalsForTest.overrideSettings({ standardMaterials: standard });
      try {
        const source = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
        const root = new THREE.Group(),
          mesh = new THREE.Mesh(new THREE.BufferGeometry(), source);
        mesh.userData.bodyMesh = true;
        root.add(mesh);
        applyMaterials(root, VISUALS.mob_ghost, 0xffffff);
        const ghost = mesh.material as THREE.MeshStandardMaterial;
        expect(ghost.opacity).toBe(0.72);
        expect(ghost.transparent).toBe(true);
        expect(ghost.depthWrite).toBe(false);
        expect(source.transparent).toBe(false);
        expect(source.emissiveIntensity).toBe(1);
        const far = tintedFarMaterials(VISUALS.mob_ghost, 0xffffff, [source], [true])[0];
        expect(far).not.toBe(ghost);
        expect(far.opacity).toBe(ghost.opacity);
        expect(cloneMaterialWithHooks(ghost).opacity).toBe(0.72);
        applyMaterials(root, VISUALS.mob_ice_wisp, 0xffffff);
        const ice = mesh.material as THREE.MeshStandardMaterial;
        expect(ice).not.toBe(ghost);
        expect(ice.opacity).toBe(0.94);
        expect(ice.emissive.getHex()).toBe(SPIRIT_APPEARANCE.ice.color);
        applyMaterials(root, { ...VISUALS.mob_ice_wisp, spirit: undefined }, 0xffffff);
        expect(mesh.material.transparent).toBe(false);
      } finally {
        gfxInternalsForTest.overrideSettings({ standardMaterials: true });
      }
    },
  );

  it('freezes reduced motion, hides distant mist, fades on death and restores on reuse', () => {
    const parent = new THREE.Group(),
      fx = new SpiritBodyVfx(parent, 1.2, 0.3, 'ice');
    const mist = fx.root.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    const shader = mist.material;
    expect(fx.root.children).toHaveLength(3);
    expect(fx.root.children.every((n) => n.userData.shadowCaster === false)).toBe(true);
    expect(parent.getObjectByProperty('isLight', true)).toBeUndefined();
    fx.update(0.4, false, true, false);
    expect(shader.uniforms.clock.value).toBe(0.4);
    fx.update(0.4, false, true, true);
    expect(shader.uniforms.clock.value).toBe(0.4);
    fx.update(0.4, false, false, false);
    expect(fx.root.visible).toBe(false);
    expect(shader.uniforms.clock.value).toBe(0.4);
    fx.update(1, true, true, false);
    expect(fx.root.visible).toBe(false);
    expect(shader.uniforms.strength.value).toBe(0);
    fx.update(0.1, false, true, false);
    expect(fx.root.visible).toBe(true);
    expect(shader.uniforms.strength.value).toBe(1);
    const geometry = vi.spyOn(mist.geometry, 'dispose'),
      material = vi.spyOn(shader, 'dispose');
    fx.dispose();
    fx.dispose();
    expect(fx.root.parent).toBeNull();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
  });
});
