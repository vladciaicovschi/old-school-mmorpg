import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ElementalBodyVfx } from '../src/render/characters/elemental_body_vfx';

function fixture(element: 'fire' | 'ice' | 'water' | 'stone' = 'fire') {
  const model = new THREE.Group();
  for (const name of [
    'hips',
    'head',
    'vfx_core',
    'handl',
    'vfx_handr',
    'upperarml',
    'upperarmr',
    'rock_low1',
    'rock_low11',
  ]) {
    const bone = new THREE.Bone();
    bone.name = name;
    model.add(bone);
  }
  const fx = new ElementalBodyVfx(model, element);
  const flames: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  model.traverse((node) => {
    if (node.userData.weaponVfxMesh) flames.push(node as (typeof flames)[number]);
  });
  return { model, fx, flames };
}

describe('owned fire elemental body effects', () => {
  it('binds the core, hands, shoulders and lower rocks before rendering, without point lights', () => {
    const { model, fx, flames } = fixture();
    expect(flames).toHaveLength(9);
    expect(new Set(flames.map((m) => m.parent?.name)).size).toBe(9);
    const lights: THREE.Object3D[] = [];
    model.traverse((o) => {
      if ((o as THREE.Light).isLight) lights.push(o);
    });
    expect(lights).toHaveLength(0);
    fx.dispose();
  });

  it('freezes reduced motion, hides behind far LOD, fades death and restores on reuse', () => {
    const { fx, flames } = fixture();
    const material = flames[0].material;
    fx.update(0.25, false, true, false);
    const clock = material.uniforms.clock.value;
    fx.update(0.25, false, true, true);
    expect(material.uniforms.clock.value).toBe(clock);
    fx.update(0.25, false, false, false);
    expect(flames.every((m) => !m.visible)).toBe(true);
    expect(material.uniforms.clock.value).toBe(clock);
    fx.update(1, true, true, false);
    expect(material.uniforms.strength.value).toBe(0);
    expect(flames.every((m) => !m.visible)).toBe(true);
    fx.update(0.1, false, true, false);
    expect(material.uniforms.strength.value).toBe(1);
    expect(flames.every((m) => m.visible)).toBe(true);
    fx.dispose();
  });

  it('detaches and disposes each owned GPU resource once', () => {
    const { model, fx, flames } = fixture();
    const geometry = vi.spyOn(flames[0].geometry, 'dispose');
    const materials = flames.map((m) => vi.spyOn(m.material, 'dispose'));
    fx.dispose();
    fx.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    for (const material of materials) expect(material).toHaveBeenCalledTimes(1);
    expect(flames.every((m) => m.parent === null)).toBe(true);
    expect(model.getObjectByName('elemental_body_vfx')).toBeUndefined();
  });

  it('uses cold mist and frost particles while retaining the same visibility and death lifecycle', () => {
    const { model, fx, flames } = fixture('ice');
    expect(flames).toHaveLength(9);
    for (const mist of flames) {
      expect(mist.name).toContain('elemental_mist_');
      expect(mist.material.uniforms.cold.value).toBe(1);
    }
    const points = model.getObjectByProperty('isPoints', true) as THREE.Points<
      THREE.BufferGeometry,
      THREE.ShaderMaterial
    >;
    expect(points.material.uniforms.cold.value).toBe(1);
    fx.update(0.5, false, true, false);
    expect(points.material.uniforms.clock.value).toBe(0.5);
    fx.update(0.2, false, true, true);
    expect(points.visible).toBe(false);
    expect(points.material.uniforms.clock.value).toBe(0.5);
    fx.update(1, true, true, false);
    expect(flames.every((m) => !m.visible)).toBe(true);
    fx.update(0.1, false, true, false);
    expect(flames.every((m) => m.visible)).toBe(true);
    fx.dispose();
  });

  it('uses water mist and sparse droplets and freezes the flow clock under reduced motion', () => {
    const { model, fx, flames } = fixture('water');
    expect(flames).toHaveLength(9);
    for (const stream of flames) {
      expect(stream.name).toContain('elemental_mist_');
      expect(stream.material.blending).toBe(THREE.NormalBlending);
      expect(stream.material.uniforms.flow.value).toBe(1);
      expect(stream.material.uniforms.cold.value).toBe(0);
    }
    const points = model.getObjectByProperty('isPoints', true) as THREE.Points<
      THREE.BufferGeometry,
      THREE.ShaderMaterial
    >;
    expect(points.material.uniforms.flow.value).toBe(1);
    expect(points.geometry.getAttribute('position').count).toBe(24);
    expect(model.getObjectByName('elemental_water_surface')).toBeUndefined();
    fx.update(0.5, false, true, false);
    fx.update(0.5, false, true, true);
    expect(points.material.uniforms.clock.value).toBe(0.5);
    expect(points.visible).toBe(false);
    fx.update(1, true, true, false);
    expect(flames.every((m) => !m.visible)).toBe(true);
    fx.dispose();
  });

  it('uses non-luminous stone dust, hides debris for reduced motion and releases its buffers', () => {
    const { model, fx, flames } = fixture('stone');
    const points = model.getObjectByProperty('isPoints', true) as THREE.Points<
      THREE.BufferGeometry,
      THREE.ShaderMaterial
    >;
    expect(points.geometry.getAttribute('position').count).toBe(24);
    const buffer = points.geometry.getAttribute('position').array;
    const disposeGeometry = vi.spyOn(points.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(points.material, 'dispose');
    for (const dust of flames) {
      expect(dust.name).toContain('elemental_dust_');
      expect(dust.material.uniforms.dust.value).toBe(1);
      expect(dust.material.blending).toBe(THREE.NormalBlending);
    }
    fx.update(0.5, false, true, false);
    fx.update(0.5, false, true, true);
    expect(points.visible).toBe(false);
    expect(points.material.uniforms.clock.value).toBe(0.5);
    expect(points.geometry.getAttribute('position').array).toBe(buffer);
    fx.update(1, true, true, false);
    expect(flames.every((m) => !m.visible)).toBe(true);
    fx.update(0, false, true, false);
    expect(flames.every((m) => m.visible)).toBe(true);
    fx.dispose();
    fx.dispose();
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
  });
});
