import { describe, expect, it } from 'vitest';
import {
  CARRY_FIT_TARGETS,
  itemEquipmentFitKey,
  mergeHeldEquipmentFit,
  validEquipmentFitTransforms,
  validItemEquipmentFitKey,
} from '../scripts/lib/equipment_fit_payload.mjs';
import { EQUIPMENT_CALIBRATION_TARGETS } from '../src/ui/equipment_calibration_core';

const legacy = EQUIPMENT_CALIBRATION_TARGETS.filter(
  (key) => !CARRY_FIT_TARGETS.includes(key as (typeof CARRY_FIT_TARGETS)[number]),
);
const value = () => ({ position: [0, 0, 0], rotationDeg: [0, 0, 0], scale: 1 });
const payload = () =>
  Object.fromEntries(EQUIPMENT_CALIBRATION_TARGETS.map((key) => [key, value()]));
describe('equipment carry save payload validation', () => {
  it('allows only the explicit body/item save profiles, never arbitrary keys', () => {
    expect(
      validItemEquipmentFitKey(
        itemEquipmentFitKey('player_paladin', 'models/weapons/meshy/dwarven_warhammer_2h_1.glb'),
      ),
    ).toBe(true);
    expect(
      validItemEquipmentFitKey(
        itemEquipmentFitKey('player_mage', 'models/weapons/meshy/dwarven_warhammer_2h_1.glb'),
      ),
    ).toBe(false);
    for (const model of ['arcane_longbow_1', 'test_crossbow_1']) {
      expect(
        validItemEquipmentFitKey(
          itemEquipmentFitKey('player_hunter', `models/weapons/meshy/${model}.glb`),
        ),
      ).toBe(true);
      expect(
        validItemEquipmentFitKey(
          itemEquipmentFitKey('player_warrior', `models/weapons/meshy/${model}.glb`),
        ),
      ).toBe(false);
    }
    expect(
      validItemEquipmentFitKey(
        itemEquipmentFitKey('player_warrior', 'models/weapons/meshy/claymore_sword_1.glb'),
      ),
    ).toBe(true);
    for (const key of [
      '__proto__',
      'constructor',
      '../held_attachment_fit.generated.json',
      'player_mage@models/weapons/meshy/claymore_sword_1.glb',
      'player_warrior@missing.glb',
    ]) {
      expect(validItemEquipmentFitKey(key)).toBe(false);
    }
  });
  it('preserves carry profiles on a legacy hand save and persists Titan carry separately', () => {
    const previous = { mainhand: value(), mainhand_hip: { ...value(), scale: 0.4 } };
    const next = mergeHeldEquipmentFit(previous, { mainhand: { ...value(), scale: 0.5 } });
    expect(next.mainhand_hip).toEqual(previous.mainhand_hip);
    expect(next.mainhand).toEqual({ ...value(), scale: 0.5 });
    expect(previous.mainhand.scale).toBe(1);
    const titan = mergeHeldEquipmentFit(undefined, payload(), false);
    expect(Object.keys(titan).sort()).toEqual([...CARRY_FIT_TARGETS].sort());
    expect(titan.mainhand).toBeUndefined();
  });
  it('accepts existing 15-target payloads and the complete 19-target extension', () => {
    expect(legacy).toHaveLength(15);
    expect(CARRY_FIT_TARGETS).toEqual([
      'mainhand_hip',
      'offhand_hip',
      'mainhand_back',
      'offhand_back',
    ]);
    expect(
      validEquipmentFitTransforms(Object.fromEntries(legacy.map((key) => [key, value()])), legacy),
    ).toBe(true);
    expect(validEquipmentFitTransforms(payload(), legacy)).toBe(true);
  });
  it('rejects partial profiles, unknown properties and malformed transforms', () => {
    const missing = payload();
    delete missing.offhand_back;
    expect(validEquipmentFitTransforms(missing, legacy)).toBe(false);
    expect(validEquipmentFitTransforms({ ...payload(), unknown: value() }, legacy)).toBe(false);
    for (const bad of [NaN, Infinity, -6, 6, '1']) {
      const p = payload();
      p.mainhand_hip.position[0] = bad as number;
      expect(validEquipmentFitTransforms(p, legacy)).toBe(false);
    }
    for (const bad of [0, 11, NaN, '1']) {
      const p = payload();
      p.offhand_back.scale = bad as number;
      expect(validEquipmentFitTransforms(p, legacy)).toBe(false);
    }
    expect(validEquipmentFitTransforms(null, legacy)).toBe(false);
  });
});
