import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyMaterials, tintedFarMaterials } from '../src/render/characters/assets';
import { applyAtlasDye } from '../src/render/characters/atlas_dye';
import { VISUALS } from '../src/render/characters/manifest';
import { TROLL_PALETTES } from '../src/render/characters/troll_palettes';
import { gfxInternalsForTest } from '../src/render/gfx';
import { cloneMaterialWithHooks } from '../src/render/material_clone_hooks';
import { DEV_MODEL_COMPARISON_GALLERY as gallery } from '../src/sim/data';

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

describe('imported troll palette trials', () => {
  it('shares the original rig, maps and clips and displays each palette once', () => {
    const original = VISUALS.npc_dev_troll;
    expect(original.atlasDye).toBeUndefined();
    for (const palette of Object.keys(TROLL_PALETTES)) {
      const key = `npc_dev_troll_${palette}`;
      const variant = VISUALS[key];
      expect(variant.url).toBe(original.url);
      expect(variant.clips).toBe(original.clips);
      expect(variant.height).toBe(original.height);
      expect(variant.attach).toBe(original.attach);
      const pair = gallery.subjects.filter((s) => s.pairId === `mob_troll_${palette}`);
      expect(pair).toHaveLength(1);
      expect(pair[0]).toMatchObject({ side: 'new', visualKey: key, status: 'ready' });
    }
  });

  it('caches palette sources without changing the original or separate weapon', () => {
    const source = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const a = body(source),
      b = body(source),
      c = body(source);
    const weapon = new THREE.Mesh(new THREE.BufferGeometry(), source);
    a.root.add(weapon);
    const geometry = a.mesh.geometry;
    applyAtlasDye(a.root, TROLL_PALETTES.marsh);
    applyAtlasDye(b.root, TROLL_PALETTES.marsh);
    applyAtlasDye(c.root, TROLL_PALETTES.sand);
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
        const def = VISUALS.npc_dev_troll_sand;
        applyAtlasDye(root, TROLL_PALETTES.sand);
        const atlasSource = mesh.material;
        applyMaterials(root, def, 0xffffff);
        const material = mesh.material;
        const far = tintedFarMaterials(def, 0xffffff, [atlasSource], [true])[0];
        const clone = cloneMaterialWithHooks(material);
        expect(clone.customProgramCacheKey()).toBe(material.customProgramCacheKey());
        for (const mounted of [material, far, clone]) {
          const shader = shaderSpec(mounted);
          expect(shader.uniforms.uDyeCount.value).toBe(1);
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
