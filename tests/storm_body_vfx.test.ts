import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createElementalBodyVfx } from '../src/render/characters/elemental_body_vfx';
import {
  ARC_FLOATS_PER_LINK,
  ARC_MAIN_FLOATS_PER_LINK,
} from '../src/render/characters/storm_arc_core';
import type { StormBodyVfx } from '../src/render/characters/storm_body_vfx';

function setup() {
  const model = new THREE.Group();
  model.position.set(4, 8, -3);
  model.rotation.set(0.3, 0.7, 0.2);
  model.scale.set(2, 3, 2);
  const start = new THREE.Bone(),
    end = new THREE.Bone();
  start.name = 'vfx_core';
  end.name = 'forearml';
  start.position.set(0, 0.6, 0.1);
  end.position.set(0.3, 0.5, 0);
  model.add(start, end);
  const fx = createElementalBodyVfx(model, 'storm') as StormBodyVfx;
  const arcs = fx.root.getObjectByName('elemental_storm_arcs') as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >;
  return { model, start, end, fx, arcs };
}

describe('storm effect ownership and animated sockets', () => {
  it('uses current model-local anchors through rotation, translation and nonuniform scale', () => {
    const { start, end, fx, arcs } = setup();
    const positions = arcs.geometry.getAttribute('position').array;
    end.position.set(0.4, 0.7, -0.2);
    fx.update(0.2, false, true, false);
    expect(arcs.geometry.getAttribute('position').array).toBe(positions);
    for (let c = 0; c < 3; c++) {
      expect((positions[c] + positions[3 + c]) / 2).toBeCloseTo(start.position.getComponent(c));
      expect(
        (positions[ARC_MAIN_FLOATS_PER_LINK - 3 + c] +
          positions[ARC_MAIN_FLOATS_PER_LINK - 6 + c]) /
          2,
      ).toBeCloseTo(end.position.getComponent(c));
    }
    expect(
      fx.root.getObjectByName('elemental_storm_core')?.position.distanceTo(start.position),
    ).toBeLessThan(1e-6);
    fx.dispose();
  });
  it('freezes phase for reduced motion and hidden models while still following animated anchors', () => {
    const { end, fx, arcs } = setup();
    fx.update(0.25, false, true, false);
    const phase = arcs.material.uniforms.clock.value;
    fx.update(0, false, true, true);
    const before = [...arcs.geometry.getAttribute('position').array];
    fx.update(2, false, true, true);
    expect([...arcs.geometry.getAttribute('position').array]).toEqual(before);
    end.position.y += 0.1;
    fx.update(2, false, true, true);
    expect([...arcs.geometry.getAttribute('position').array]).not.toEqual(before);
    expect(arcs.material.uniforms.clock.value).toBe(phase);
    fx.update(1, false, false, false);
    expect(fx.root.visible).toBe(false);
    expect(arcs.material.uniforms.clock.value).toBe(phase);
    fx.update(1, true, true, false);
    expect(fx.root.visible).toBe(false);
    fx.update(0, false, true, false);
    expect(fx.root.visible).toBe(true);
    expect(arcs.material.uniforms.strength.value).toBe(1);
    fx.dispose();
  });
  it('owns exactly two tagged draws, no lights, and disposes each GPU resource once', () => {
    const { model, fx } = setup();
    const spies: ReturnType<typeof vi.spyOn>[] = [];
    fx.root.traverse((o) => {
      expect(o instanceof THREE.Light).toBe(false);
      if (!(o instanceof THREE.Mesh)) return;
      expect(o.userData.weaponVfxMesh).toBe(true);
      expect(o.material.depthWrite).toBe(false);
      spies.push(vi.spyOn(o.geometry, 'dispose'), vi.spyOn(o.material, 'dispose'));
    });
    expect(spies).toHaveLength(4);
    fx.dispose();
    fx.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(model.children).toHaveLength(2);
  });

  it('keeps front and back surface paths in model space while the head moves', () => {
    const { model, fx: initial } = setup();
    initial.dispose();
    const head = new THREE.Bone(),
      arm = new THREE.Bone();
    head.name = 'head';
    arm.name = 'upperarml';
    head.position.set(0, 0.8, 0.03);
    arm.position.set(0.2, 0.6, 0);
    model.add(head, arm);
    const fx = createElementalBodyVfx(model, 'storm') as StormBodyVfx;
    const arcs = fx.root.getObjectByName('elemental_storm_arcs') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.ShaderMaterial
    >;
    const position = arcs.geometry.getAttribute('position').array;
    for (const motion of [0, 0.04, -0.02]) {
      head.position.z = 0.03 + motion;
      fx.update(0.1, false, true, true);
      const starts: number[][] = [];
      for (let i = 0; i < position.length; i += ARC_FLOATS_PER_LINK)
        starts.push([0, 1, 2].map((c) => (position[i + c] + position[i + 3 + c]) / 2));
      for (const offset of [0.09, -0.09])
        expect(
          starts.some(
            ([x, y, z]) =>
              Math.abs(x) < 1e-5 &&
              Math.abs(y - 0.8) < 1e-5 &&
              Math.abs(z - head.position.z - offset) < 1e-5,
          ),
        ).toBe(true);
      expect(arcs.geometry.getAttribute('position').array).toBe(position);
    }
    fx.dispose();
  });
});
