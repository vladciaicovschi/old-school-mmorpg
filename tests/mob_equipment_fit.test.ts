// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EquipmentCalibrationTransform } from '../src/ui/equipment_calibration_core';

const keys = [
  'npc_dev_rogue_minion',
  'npc_dev_rogue_assassin',
  'npc_dev_skeleton_minion',
  'npc_dev_skeleton_warrior',
  'npc_dev_kobold',
  'npc_dev_meshy_murlok',
  'npc_dev_meshy_ogre',
  'npc_dev_troll',
];
// Only network loading is replaced. Exercise the real manifest, assembler,
// native-vs-Mixamo adapters, calibration controller and runtime registry.
function asset(url: string) {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.2), new THREE.MeshStandardMaterial()));
  if (!url.includes('/weapons/')) {
    const hips = new THREE.Bone();
    hips.name = 'mixamorigHips';
    scene.add(hips);
    const chest = new THREE.Bone();
    chest.name = 'mixamorigSpine2';
    hips.add(chest);
    for (const side of ['Left', 'Right']) {
      const hand = new THREE.Bone();
      hand.name = `mixamorig${side}Hand`;
      chest.add(hand);
    }
  }
  return { scene, animations: [] };
}
let assets: typeof import('../src/render/characters/assets');
let manifest: typeof import('../src/render/characters/manifest');
let controller: typeof import('../src/ui/equipment_calibration_controller');
beforeAll(async () => {
  vi.resetModules();
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn((url: string) => Promise.resolve(asset(url))),
    loadTexture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    loadKtx2Texture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    releaseGltf: vi.fn(),
  }));
  assets = await import('../src/render/characters/assets');
  manifest = await import('../src/render/characters/manifest');
  controller = await import('../src/ui/equipment_calibration_controller');
  await assets.charactersReady();
  await Promise.all(keys.map((key) => assets.preloadCharacterVisualAssets(key)));
}, 60000);
afterAll(() => {
  for (const key of keys) localStorage.removeItem(`woc.equipmentCalibration.${key}.v2`);
  vi.doUnmock('../src/render/assets/loader');
  vi.resetModules();
});
function held(root: THREE.Object3D, slot = 0): THREE.Object3D {
  let payload: THREE.Object3D | undefined;
  root.traverse((node) => {
    if (node.userData.heldSlot === slot) payload = node;
  });
  if (!payload) throw new Error(`Missing editable slot ${slot}`);
  return payload;
}
function transform(node: THREE.Object3D): EquipmentCalibrationTransform {
  return {
    position: node.position.toArray(),
    rotationDeg: [node.rotation.x, node.rotation.y, node.rotation.z].map(
      THREE.MathUtils.radToDeg,
    ) as [number, number, number],
    scale: node.scale.x,
  };
}
describe('imported mob editor-to-world weapon fits', () => {
  it.each(keys)(
    '%s applies saved editor edits on fresh world assembly, including both hands',
    (key) => {
      const def = manifest.VISUALS[key];
      const root = assets.assembleModel(def);
      const main = held(root);
      if (key === 'npc_dev_troll') expect(main.scale.x).toBe(0.65);
      if (['npc_dev_kobold', 'npc_dev_meshy_murlok', 'npc_dev_meshy_ogre'].includes(key))
        expect(transform(main)).toEqual({ position: [0, 0, 0], rotationDeg: [0, 0, 0], scale: 1 });
      const neighbor = manifest.VISUALS[key === keys[0] ? keys[1] : keys[0]];
      const neighborBefore = transform(held(assets.assembleModel(neighbor)));
      const host = document.createElement('div');
      let manipulate: ((value: EquipmentCalibrationTransform) => void) | undefined;
      const ui = controller.mountEquipmentCalibrationController(host, {
        visualKey: key,
        targets: ['mainhand', 'offhand'],
        readDefault: (slot) =>
          slot === 'mainhand'
            ? transform(main)
            : slot === 'offhand' && def.attach?.some((att) => att.calibrationSlot === 'offhand')
              ? transform(held(root, 1))
              : null,
        apply: () => true,
        readAnimationPaused: () => false,
        setAnimationPaused: () => {},
        setManipulator: (_slot, _mode, callback) => {
          manipulate = callback;
          return true;
        },
        clearManipulator: () => {},
      });
      const edit: EquipmentCalibrationTransform = {
        position: [0.12, -0.23, 0.34],
        rotationDeg: [10, 20, -30],
        scale: 0.78,
      };
      expect(manipulate).toBeTypeOf('function');
      manipulate?.(edit);
      const offhand = host.querySelectorAll<HTMLButtonElement>('.ec-tab')[1];
      if (offhand) {
        offhand.click();
        manipulate?.({ ...edit, scale: 0.62 });
      }
      ui.destroy(); // Must flush even before the debounce expires / on model switch.
      const raw = localStorage.getItem(`woc.equipmentCalibration.${key}.v2`);
      if (!raw) throw new Error('Editor did not persist the mob fit');
      const saved = JSON.parse(raw);
      expect(saved.visualKey).toBe(key);
      expect(saved.transforms.mainhand).toMatchObject(edit);
      const fresh = assets.assembleModel(def);
      expect(held(fresh).position.toArray()).toEqual(edit.position);
      expect(held(fresh).scale.x).toBe(edit.scale);
      transform(held(fresh)).rotationDeg.forEach((angle, axis) => {
        expect(angle).toBeCloseTo(edit.rotationDeg[axis], 8);
      });
      if (offhand) expect(held(fresh, 1).scale.x).toBe(0.62);
      expect(transform(held(assets.assembleModel(neighbor)))).toEqual(neighborBefore);
    },
  );
});
