import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createElementalBodyVfx } from '../src/render/characters/elemental_body_vfx';
import {
  ELEMENTAL_CORE_COLORS,
  ElementalHelmetGlow,
} from '../src/render/characters/elemental_helmet_glow';

describe('elemental light inside the helmet', () => {
  it.each(['fire', 'ice', 'water', 'storm', 'stone'] as const)(
    'follows the %s socket and its owner lifecycle',
    (kind) => {
      const model = new THREE.Group(),
        socket = new THREE.Bone();
      socket.name = 'vfx_eyes';
      socket.position.set(0, 0.85, 0.075);
      model.add(socket);
      const fx = createElementalBodyVfx(model, kind);
      const glow = model.getObjectByName('elemental_helmet_glow') as THREE.Mesh<
        THREE.SphereGeometry,
        THREE.ShaderMaterial
      >;
      expect(glow.parent).toBe(socket);
      expect(glow.material.uniforms.tint.value.getHex()).toBe(ELEMENTAL_CORE_COLORS[kind]);
      expect(glow.userData.weaponVfxMesh).toBe(true);
      expect(glow.castShadow).toBe(false);
      expect(glow.material.depthTest).toBe(true);
      const geometry = vi.spyOn(glow.geometry, 'dispose'),
        material = vi.spyOn(glow.material, 'dispose');
      fx.update(0.25, false, true, false);
      const clock = glow.material.uniforms.clock.value;
      socket.position.x += 0.1;
      model.rotation.y = 0.4;
      model.scale.set(2, 3, 2);
      const expected = socket.localToWorld(glow.position.clone());
      expect(glow.getWorldPosition(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(1e-6);
      fx.update(0.25, false, true, true);
      expect(glow.material.uniforms.clock.value).toBe(clock);
      fx.update(0.1, false, false, false);
      expect(glow.visible).toBe(false);
      fx.update(1, true, true, false);
      expect(glow.visible).toBe(false);
      fx.update(0, false, true, false);
      expect(glow.visible).toBe(true);
      expect(glow.material.uniforms.strength.value).toBe(1);
      fx.dispose();
      fx.dispose();
      expect(geometry).toHaveBeenCalledTimes(1);
      expect(material).toHaveBeenCalledTimes(1);
      expect(socket.parent).toBe(model);
      expect(glow.parent).toBeNull();
    },
  );

  it('does not invent a socket or allocate an orb for unrelated models', () => {
    const model = new THREE.Group();
    const glow = new ElementalHelmetGlow(model, ELEMENTAL_CORE_COLORS.fire);
    glow.update(1, 1, true);
    glow.dispose();
    glow.dispose();
    expect(model.children).toHaveLength(0);
  });
});
