import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyMaterials, tintedFarMaterials } from '../src/render/characters/assets';
import { applyAtlasDye } from '../src/render/characters/atlas_dye';
import { VISUALS } from '../src/render/characters/manifest';
import { VERDANT_GOLEM_PALETTES } from '../src/render/characters/verdant_golem_palettes';
import { gfxInternalsForTest } from '../src/render/gfx';
import { cloneMaterialWithHooks } from '../src/render/material_clone_hooks';

vi.mock('../src/render/assets/loader', () => ({
  loadGltf: vi.fn(() => new Promise(() => undefined)),
  loadKtx2Texture: vi.fn(() => new Promise(() => undefined)),
  loadTexture: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: vi.fn(),
  registerDeferredPreload: vi.fn((start: () => unknown) => start()),
}));

function shaderSpec(mat: THREE.Material) {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '',
    fragmentShader: '#include <common>\nvoid main() {\n#include <map_fragment>\n}',
  };
  mat.onBeforeCompile(
    shader as Parameters<typeof mat.onBeforeCompile>[0],
    {} as THREE.WebGLRenderer,
  );
  return shader;
}

function body(source: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), source);
  mesh.userData.bodyMesh = true;
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh };
}

describe.each(['guardian', 'warden'] as const)('verdant golem %s material palette', (kind) => {
  const palette = VERDANT_GOLEM_PALETTES[kind];
  const def = VISUALS[kind === 'guardian' ? 'mob_ancient_guardian' : 'mob_waking_warden'];
  it('uses a selective palette without a muddy global tint or transparency', () => {
    expect(def.atlasDye).toBe(palette);
    expect(def.tint).toBeUndefined();
    expect(def.spirit).toBeUndefined();
    expect(palette.rules).toHaveLength(2);
  });

  it('caches palette sources without changing the original or separate weapon', () => {
    const source = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const a = body(source),
      b = body(source),
      c = body(source);
    const weapon = new THREE.Mesh(new THREE.BufferGeometry(), source);
    a.root.add(weapon);
    const geometry = a.mesh.geometry;
    applyAtlasDye(a.root, palette);
    applyAtlasDye(b.root, palette);
    applyAtlasDye(c.root, VERDANT_GOLEM_PALETTES[kind === 'guardian' ? 'warden' : 'guardian']);
    expect(a.mesh.material).toBe(b.mesh.material);
    expect(a.mesh.material).not.toBe(c.mesh.material);
    expect(a.mesh.geometry).toBe(geometry);
    expect((a.mesh.material as THREE.MeshStandardMaterial).map).toBe(source.map);
    expect(source.userData).toEqual({});
    expect(weapon.material).toBe(source);
  });

  it.each([true, false])(
    'keeps selective dye through rig, far LOD and effect clones (standard=%s)',
    (standard) => {
      const restore = gfxInternalsForTest.overrideSettings({ standardMaterials: standard });
      try {
        const source = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
        const { root, mesh } = body(source);
        applyAtlasDye(root, palette);
        const atlasSource = mesh.material;
        applyMaterials(root, def, 0xffffff);
        const material = mesh.material;
        const far = tintedFarMaterials(def, 0xffffff, [atlasSource], [true])[0];
        const clone = cloneMaterialWithHooks(material);
        expect(clone.customProgramCacheKey()).toBe(material.customProgramCacheKey());
        for (const mounted of [material, far, clone]) {
          const shader = shaderSpec(mounted);
          expect(shader.uniforms.uDyeCount.value).toBe(2);
          expect(mounted.transparent).toBe(false);
          expect(mounted.opacity).toBe(1);
          expect(shader.fragmentShader).toContain('wocRgb2Hsv');
          expect((mounted as THREE.MeshStandardMaterial).map).toBe(source.map);
        }
        expect(shaderSpec(material).uniforms.uDyeC.value).toEqual(
          shaderSpec(far).uniforms.uDyeC.value,
        );
        expect(source.userData).toEqual({});
      } finally {
        restore();
      }
    },
  );
});
