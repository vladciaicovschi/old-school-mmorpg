import { describe, expect, it } from 'vitest';
import {
  cloneEquipmentCalibrationState,
  EQUIPMENT_CALIBRATION_ARMOR_TARGETS,
  EQUIPMENT_CALIBRATION_TARGETS,
  type EquipmentCalibrationState,
  type EquipmentCalibrationTransform,
  equipmentCalibrationExport,
  equipmentCalibrationQuaternion,
  equipmentCalibrationStorageKey,
  equipmentCalibrationTarget,
  normalizeEquipmentCalibrationState,
  parseEquipmentCalibrationState,
  serializeEquipmentCalibration,
  withEquipmentCalibrationAxis,
  withEquipmentCalibrationScale,
} from '../src/ui/equipment_calibration_core';

const IDENTITY: EquipmentCalibrationTransform = {
  position: [0, 0, 0],
  rotationDeg: [0, 0, 0],
  scale: 1,
};

const DEFAULTS = Object.fromEntries(
  EQUIPMENT_CALIBRATION_TARGETS.map((target) => [target, structuredClone(IDENTITY)]),
) as EquipmentCalibrationState;
DEFAULTS.mainhand = {
  position: [0.1, 0.2, 0.3],
  rotationDeg: [0, 0, 180],
  scale: 0.58,
};
DEFAULTS.offhand = {
  position: [-0.1, 0.4, 0.2],
  rotationDeg: [-135, 0, 180],
  scale: 0.52,
};

describe('equipment calibration core', () => {
  it('normalizes every target without mutating defaults', () => {
    const normalized = normalizeEquipmentCalibrationState(
      {
        mainhand: {
          position: [99, Number.NaN, -99],
          rotationDeg: [720, -720, 45.1234567],
          scale: -4,
        },
      },
      DEFAULTS,
    );

    expect(normalized.mainhand).toEqual({
      position: [5, 0.2, -5],
      rotationDeg: [360, -360, 45.123457],
      scale: 0.01,
    });
    expect(normalized.Armor_valor_Chest).toEqual(IDENTITY);
    expect(normalized.Armor_valor_Chest).not.toBe(DEFAULTS.Armor_valor_Chest);
  });

  it('edits one axis or uniform scale while preserving the other values', () => {
    const moved = withEquipmentCalibrationAxis(DEFAULTS.mainhand, 'position', 1, 0.725);
    const turned = withEquipmentCalibrationAxis(moved, 'rotation', 2, -17);
    const scaled = withEquipmentCalibrationScale(turned, 0.61);

    expect(scaled).toEqual({
      position: [0.1, 0.725, 0.3],
      rotationDeg: [0, 0, -17],
      scale: 0.61,
    });
    expect(DEFAULTS.mainhand.position).toEqual([0.1, 0.2, 0.3]);
  });

  it('converts Three.js XYZ degree rotations to copyable quaternions', () => {
    expect(equipmentCalibrationQuaternion([0, 0, 180])).toEqual([0, 0, 1, 0]);
    expect(equipmentCalibrationQuaternion([0, 0, 0])).toEqual([0, 0, 0, 1]);
  });

  it('exports hand and armor targets with their explicit local spaces', () => {
    const exported = equipmentCalibrationExport(DEFAULTS);
    expect(exported.version).toBe(2);
    expect(exported.visualKey).toBe('player_meshy_titan');
    expect(Object.keys(exported.transforms)).toEqual(EQUIPMENT_CALIBRATION_TARGETS);
    expect(exported.transforms.mainhand.space).toBe('hand-bone-local');
    expect(exported.transforms.mainhand.quaternion).toEqual([0, 0, 1, 0]);
    expect(exported.transforms.Armor_valor_Chest.space).toBe('skinned-node-local');
    expect(exported.transforms.mainhand_hip.space).toBe('pelvis-bone-local');
    expect(exported.transforms.offhand_back.space).toBe('chest-bone-local');
    expect(JSON.parse(serializeEquipmentCalibration(DEFAULTS))).toEqual(exported);
  });

  it('maps independent carry profiles without including them in the armor list', () => {
    expect(equipmentCalibrationTarget('mainhand', 'hand')).toBe('mainhand');
    expect(equipmentCalibrationTarget('mainhand', 'hip')).toBe('mainhand_hip');
    expect(equipmentCalibrationTarget('offhand', 'back')).toBe('offhand_back');
    expect(EQUIPMENT_CALIBRATION_ARMOR_TARGETS).toHaveLength(13);
    expect(EQUIPMENT_CALIBRATION_ARMOR_TARGETS.every((target) => target.startsWith('Armor_'))).toBe(
      true,
    );
    const state = cloneEquipmentCalibrationState(DEFAULTS);
    state.mainhand_hip.position[0] = 0.42;
    expect(state.mainhand.position).toEqual(DEFAULTS.mainhand.position);
    expect(state.mainhand_back.position).toEqual(DEFAULTS.mainhand_back.position);
  });

  it('migrates old v2 payloads and old defaults without losing hand or armor fits', () => {
    const oldDefaults = {
      ...DEFAULTS,
    };
    for (const target of [
      'mainhand_hip',
      'offhand_hip',
      'mainhand_back',
      'offhand_back',
    ] as const) {
      delete (oldDefaults as Partial<EquipmentCalibrationState>)[target];
    }
    const oldPayload = JSON.stringify({
      version: 2,
      transforms: {
        mainhand: { ...DEFAULTS.mainhand, position: [0.7, 0.8, 0.9] },
        Armor_valor_Chest: { ...IDENTITY, scale: 1.5 },
      },
    });
    const restored = parseEquipmentCalibrationState(oldPayload, oldDefaults);
    expect(restored.mainhand.position).toEqual([0.7, 0.8, 0.9]);
    expect(restored.Armor_valor_Chest.scale).toBe(1.5);
    expect(restored.mainhand_hip).toEqual(DEFAULTS.mainhand);
    expect(restored.mainhand_back).toEqual(DEFAULTS.mainhand);
    expect(restored.offhand_back).toEqual(DEFAULTS.offhand);
    expect(restored.mainhand_hip).not.toBe(restored.mainhand_back);
    expect(Object.keys(restored)).toEqual(EQUIPMENT_CALIBRATION_TARGETS);
  });

  it('isolates saved transforms and exports by selected model', () => {
    const visualKey = 'npc_dev_rogue_minion';
    expect(equipmentCalibrationStorageKey(visualKey)).toBe(
      'woc.equipmentCalibration.npc_dev_rogue_minion.v2',
    );
    expect(equipmentCalibrationExport(DEFAULTS, visualKey).visualKey).toBe(visualKey);
    expect(JSON.parse(serializeEquipmentCalibration(DEFAULTS, visualKey)).visualKey).toBe(
      visualKey,
    );
  });

  it('restores saved values and rejects corrupt or differently-versioned data', () => {
    const stored = serializeEquipmentCalibration({
      ...DEFAULTS,
      Armor_valor_Chest: { ...IDENTITY, position: [0.25, 0.5, 0.75] },
    });
    expect(parseEquipmentCalibrationState(stored, DEFAULTS).Armor_valor_Chest.position).toEqual([
      0.25, 0.5, 0.75,
    ]);
    expect(parseEquipmentCalibrationState('{bad json', DEFAULTS)).toEqual(DEFAULTS);
    expect(
      parseEquipmentCalibrationState(
        JSON.stringify({ version: 1, transforms: { mainhand: {} } }),
        DEFAULTS,
      ),
    ).toEqual(DEFAULTS);
  });
});
