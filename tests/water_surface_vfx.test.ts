import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyMaterials } from '../src/render/characters/assets';
import { ElementalBodyVfx } from '../src/render/characters/elemental_body_vfx';
import type { VisualDef } from '../src/render/characters/manifest';
import { WaterSurfaceVfx } from '../src/render/characters/water_surface_vfx';

vi.mock('../src/render/assets/loader', () => ({
  loadGltf: vi.fn(() => new Promise(() => undefined)),
  loadKtx2Texture: vi.fn(() => new Promise(() => undefined)),
  loadTexture: vi.fn(() => new Promise(() => undefined)),
}));

function fixture() {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  root.add(bone);
  const body = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  body.position.set(0.2, 0.5, -0.1);
  body.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3);
  body.scale.set(0.4, 0.6, 0.5);
  root.add(body);
  body.bind(new THREE.Skeleton([bone]), new THREE.Matrix4().makeTranslation(0.1, 0.2, 0.3));
  body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.1, 0.2, 0.3), 2);
  const fx = new WaterSurfaceVfx(root);
  const surface = root.getObjectByName('elemental_water_surface') as THREE.SkinnedMesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >;
  return { root, body, fx, surface };
}

describe('owned water caustic skin', () => {
  it('shares geometry, skeleton and exact bind transform without creating another rig', () => {
    const { body, fx, surface } = fixture();
    expect(surface.isSkinnedMesh).toBe(true);
    expect(surface.geometry).toBe(body.geometry);
    expect(surface.skeleton).toBe(body.skeleton);
    expect(surface.bindMatrix.equals(body.bindMatrix)).toBe(true);
    expect(surface.position.equals(body.position)).toBe(true);
    expect(surface.quaternion.equals(body.quaternion)).toBe(true);
    expect(surface.scale.equals(body.scale)).toBe(true);
    expect(surface.boundingSphere?.equals(body.boundingSphere as THREE.Sphere)).toBe(true);
    expect(surface.boundingSphere).not.toBe(body.boundingSphere);
    expect(surface.castShadow).toBe(false);
    expect(surface.receiveShadow).toBe(false);
    fx.dispose();
  });

  it('keeps the owned shader through body recolors, updates only uniforms and hides with the near rig', () => {
    const { root, fx, surface } = fixture();
    const material = surface.material;
    applyMaterials(root, { authoredAtlas: true } as VisualDef, 0x3388aa);
    expect(surface.material).toBe(material);
    fx.update(2, 0.4, true);
    expect(material.uniforms.clock.value).toBe(2);
    expect(material.uniforms.strength.value).toBe(0.4);
    fx.update(2, 0, false);
    expect(surface.visible).toBe(false);
    fx.update(3, 1, true);
    expect(surface.visible).toBe(true);
    fx.dispose();
  });

  it('disposes only the owned shader, once, and never shared geometry or skeleton', () => {
    const { body, fx, surface } = fixture();
    const geometry = vi.spyOn(body.geometry, 'dispose');
    const skeleton = vi.spyOn(body.skeleton, 'dispose');
    const material = vi.spyOn(surface.material, 'dispose');
    fx.dispose();
    fx.dispose();
    expect(material).toHaveBeenCalledTimes(1);
    expect(geometry).not.toHaveBeenCalled();
    expect(skeleton).not.toHaveBeenCalled();
    expect(surface.parent).toBeNull();
  });

  it('is not constructed by the active water mist owner', () => {
    const { root, fx, body } = fixture();
    fx.dispose();
    const geometry = vi.spyOn(body.geometry, 'dispose');
    const owner = new ElementalBodyVfx(root, 'water');
    expect(root.getObjectByName('elemental_water_surface')).toBeUndefined();
    owner.update(0.5, false, true, false);
    owner.dispose();
    expect(geometry).not.toHaveBeenCalled();
  });
});
