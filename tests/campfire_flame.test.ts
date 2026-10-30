import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createCampfireFlame, createTorchFlame } from '../src/render/campfire_flame';
import { sharedUniforms } from '../src/render/gfx';
import { cloneMaterialWithHooks } from '../src/render/material_clone_hooks';
import { updateSceneryFlame } from '../src/render/scenery_flame';

function compileSource(material: THREE.Material) {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.basic.vertexShader,
    fragmentShader: THREE.ShaderLib.basic.fragmentShader,
  } as Parameters<THREE.Material['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe('stylized campfire integration', () => {
  it('keeps its animated shader and shared clock through the real prop fade clone', () => {
    const flame = createCampfireFlame();
    const material = flame.material as THREE.MeshBasicMaterial;
    const clone = cloneMaterialWithHooks(material);
    const before = compileSource(material);
    const after = compileSource(clone);
    expect(after.vertexShader).toBe(before.vertexShader);
    expect(after.fragmentShader).toBe(before.fragmentShader);
    expect(after.uniforms.uCampfireTime).toBe(sharedUniforms.uTime);
    expect(after.vertexShader).toContain('attribute vec3 aFlameRoot');
    expect(after.fragmentShader).toContain('diffuseColor.a *= silhouette');
    expect(after.fragmentShader).toContain('#include <fog_fragment>');
    expect(clone.customProgramCacheKey()).toBe(material.customProgramCacheKey());
    clone.opacity = 0.2;
    expect(material.opacity).toBe(0.9);
    expect(clone.depthWrite).toBe(false);
    expect(clone.blending).toBe(THREE.NormalBlending);
  });

  it('keeps authored size and visible ember emission without the old whole-body pulse', () => {
    const flame = createCampfireFlame();
    flame.position.set(0, 0.16, 5);
    flame.scale.setScalar(1.15);
    const camera = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, 1);
    const initial = updateSceneryFlame(flame, 0, 1, camera, forward, 600);
    expect(initial?.emitsEmber).toBe(true);
    const next = updateSceneryFlame(flame, 0, 10, camera, forward, 600, initial ?? undefined);
    expect(next).toBe(initial);
    expect(flame.scale.toArray()).toEqual([1.15, 1.15, 1.15]);
    const parent = new THREE.Group();
    parent.add(flame);
    parent.visible = false;
    expect(updateSceneryFlame(flame, 0, 11, camera, forward, 600, initial ?? undefined)).toBeNull();
  });

  it('provides all custom attributes and conservative bounds for a single flame draw', () => {
    const { geometry } = createCampfireFlame();
    const count = geometry.getAttribute('position').count;
    expect(geometry.getAttribute('aFlameRoot').count).toBe(count);
    expect(geometry.getAttribute('aFlameShape').count).toBe(count);
    expect(geometry.index?.count).toBe(30);
    expect(geometry.groups).toHaveLength(0);
    const roots = geometry.getAttribute('aFlameRoot');
    const shapes = geometry.getAttribute('aFlameShape');
    for (let i = 0; i < count; i++) {
      for (let a = 0; a < 16; a++) {
        for (const y of [0, shapes.getY(i)]) {
          const point = new THREE.Vector3(
            roots.getX(i) + (Math.cos((a * Math.PI) / 8) * shapes.getX(i)) / 2,
            y,
            roots.getZ(i) + (Math.sin((a * Math.PI) / 8) * shapes.getX(i)) / 2,
          );
          expect(geometry.boundingBox?.containsPoint(point)).toBe(true);
          expect(geometry.boundingSphere?.containsPoint(point)).toBe(true);
        }
      }
    }
  });

  it('uses a smaller torch shape on the same prewarmed program', () => {
    const fire = createCampfireFlame();
    const torch = createTorchFlame();
    expect(torch.geometry.index?.count).toBe(18);
    const fireShapes = fire.geometry.getAttribute('aFlameShape');
    const torchShapes = torch.geometry.getAttribute('aFlameShape');
    const maxHeight = (shape: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
      let height = 0;
      for (let i = 0; i < shape.count; i++) height = Math.max(height, shape.getY(i));
      return height;
    };
    expect(maxHeight(torchShapes)).toBeLessThan(maxHeight(fireShapes) * 0.55);
    expect((torch.material as THREE.Material).customProgramCacheKey()).toBe(
      (fire.material as THREE.Material).customProgramCacheKey(),
    );
  });
});
