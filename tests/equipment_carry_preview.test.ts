import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EquipmentCarryPreview } from '../src/render/characters/equipment_carry_preview';

function fixture() {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorigHips';
  root.add(hips);
  const chest = new THREE.Bone();
  chest.name = 'mixamorigSpine2';
  hips.add(chest);
  const hand = new THREE.Bone();
  hand.name = 'mixamorigRightHand';
  chest.add(hand);
  const weapon = new THREE.Group();
  weapon.userData.heldSlot = 0;
  weapon.userData.heldAccessory = '1H_Sword';
  weapon.position.set(0.1, 0.2, 0.3);
  weapon.scale.setScalar(0.45);
  hand.add(weapon);
  return { root, hips, chest, hand, weapon };
}
describe('equipment carry preview adapter', () => {
  it('reparents the same payload to anatomical anchors and restores its hand grip', () => {
    const f = fixture();
    const adapter = new EquipmentCarryPreview(f.root);
    expect(adapter.setLocation('hip')).toBe(true);
    expect(f.weapon.parent).toBe(f.hips);
    expect(f.weapon.position.toArray()).toEqual([0.26, -0.26, 0.03]);
    expect(f.weapon.scale.x).toBe(0.45);
    adapter.setLocation('back');
    expect(f.weapon.parent).toBe(f.chest);
    expect(f.weapon.position.z).toBe(-0.27);
    adapter.setLocation('hand');
    expect(f.weapon.parent).toBe(f.hand);
    expect(f.weapon.position.toArray()).toEqual([0.1, 0.2, 0.3]);
  });
  it('uses independent authored carry defaults and returns isolated draft copies', () => {
    const f = fixture();
    const adapter = new EquipmentCarryPreview(f.root, {
      mainhand_back: { position: [0.4, 0.5, -0.6], rotationDeg: [10, 20, 30], scale: 0.7 },
    });
    adapter.setLocation('back');
    expect(f.weapon.position.toArray()).toEqual([0.4, 0.5, -0.6]);
    expect(f.weapon.scale.x).toBe(0.7);
    const draft = adapter.defaultTransform('mainhand_back')!;
    draft.position[0] = 99;
    expect(adapter.defaultTransform('mainhand_back')!.position[0]).toBe(0.4);
    expect(adapter.defaultTransform('offhand_hip')).toBeNull();
    const empty = new EquipmentCarryPreview(new THREE.Group());
    expect(empty.setLocation('hip')).toBe(false);
    expect(empty.defaultTransform('mainhand_hip')).toBeNull();
  });
});
