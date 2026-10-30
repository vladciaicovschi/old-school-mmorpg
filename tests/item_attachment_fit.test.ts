// @vitest-environment happy-dom
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { EquipmentCarryPreview } from '../src/render/characters/equipment_carry_preview';
import { HELD_ATTACHMENT_FITS } from '../src/render/characters/held_attachment_fit';
import {
  itemAttachmentFitFor,
  setRuntimeItemAttachmentFit,
} from '../src/render/characters/item_attachment_fit';
import { mountEquipmentCalibrationController } from '../src/ui/equipment_calibration_controller';
import { equipmentCalibrationStorageKey } from '../src/ui/equipment_calibration_core';

const url = 'models/weapons/meshy/claymore_sword_1.glb';
const key = `player_warrior@${url}`;
const identity = {
  position: [0, 0, 0] as [number, number, number],
  rotationDeg: [0, 0, 0] as [number, number, number],
  scale: 1,
};
afterEach(() => {
  setRuntimeItemAttachmentFit(key, {});
  localStorage.removeItem(equipmentCalibrationStorageKey(key));
  document.body.textContent = '';
});
describe('per-item equipment fitting', () => {
  it('accepts only valid item transforms and leaves other bodies/models untouched', () => {
    setRuntimeItemAttachmentFit(key, { mainhand: { ...identity, scale: 0.72 } });
    expect(itemAttachmentFitFor('player_warrior', url)?.mainhand?.scale).toBe(0.72);
    expect(
      itemAttachmentFitFor('player_warrior', 'models/weapons/sword_1handed.glb'),
    ).toBeUndefined();
    expect(itemAttachmentFitFor('player_mage', url)).toBeUndefined();
    for (const bad of [NaN, Infinity, 11, '1']) {
      setRuntimeItemAttachmentFit(key, { mainhand: { ...identity, scale: bad } });
      expect(itemAttachmentFitFor('player_warrior', url)?.mainhand?.scale).toBe(0.72);
    }
  });
  it('uses item carry defaults over the generic body in the preview', () => {
    setRuntimeItemAttachmentFit(key, {
      mainhand_back: { ...identity, position: [0.1, 0.2, -0.3], scale: 0.82 },
    });
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'mixamorigHips';
    root.add(hips);
    const chest = new THREE.Bone();
    chest.name = 'mixamorigSpine2';
    hips.add(chest);
    const hand = new THREE.Bone();
    chest.add(hand);
    const weapon = new THREE.Group();
    weapon.userData.heldSlot = 0;
    weapon.userData.heldModelUrl = url;
    hand.add(weapon);
    const preview = new EquipmentCarryPreview(root, { mainhand_back: identity }, 'player_warrior');
    preview.setLocation('back');
    expect(weapon.position.toArray()).toEqual([0.1, 0.2, -0.3]);
    expect(weapon.scale.x).toBe(0.82);
  });
  it('edits, exports and restores the claymore draft without changing the generic sword fit', () => {
    const baseline = JSON.stringify(HELD_ATTACHMENT_FITS.player_warrior);
    const host = document.createElement('div');
    document.body.append(host);
    const mount = () =>
      mountEquipmentCalibrationController(host, {
        visualKey: 'player_warrior',
        fitKey: key,
        targets: ['mainhand'],
        readDefault: (target) => (target.startsWith('mainhand') ? identity : null),
        apply: () => true,
        readAnimationPaused: () => false,
        setAnimationPaused: () => {},
        setManipulator: () => true,
        clearManipulator: () => {},
        setCarryLocation: () => {},
      });
    const controller = mount();
    const position = host.querySelector<HTMLInputElement>('.ec-number');
    assert(position);
    position.value = '0.25';
    position.dispatchEvent(new Event('input'));
    const scale = host.querySelector<HTMLInputElement>('input[type="number"][aria-label="Scale"]');
    assert(scale);
    scale.value = '0.72';
    scale.dispatchEvent(new Event('input'));
    controller.destroy();
    expect(JSON.stringify(HELD_ATTACHMENT_FITS.player_warrior)).toBe(baseline);
    expect(itemAttachmentFitFor('player_warrior', url)?.mainhand).toMatchObject({
      position: [0.25, 0, 0],
      scale: 0.72,
    });
    const raw = JSON.parse(localStorage.getItem(equipmentCalibrationStorageKey(key)) ?? '{}');
    expect(raw.visualKey).toBe(key);
    expect(raw.transforms.mainhand.scale).toBe(0.72);
    const restored = mount();
    expect(host.querySelector<HTMLInputElement>('.ec-number')?.value).toBe('0.25');
    restored.destroy();
  });
});
