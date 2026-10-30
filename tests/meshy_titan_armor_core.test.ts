import { describe, expect, it } from 'vitest';
import {
  allEquipmentPartNodeNames,
  equipmentPartNodeNames,
  equipmentPartSignature,
  MESHY_TITAN_ARMOR_PARTS,
} from '../src/render/characters/meshy_titan_armor_core';

describe('Meshy Titan segmented armor contract', () => {
  it('starts with every authored armor node hidden when no armor slot is occupied', () => {
    expect(equipmentPartNodeNames(MESHY_TITAN_ARMOR_PARTS, {}, false)).toEqual([]);
    expect(new Set(allEquipmentPartNodeNames(MESHY_TITAN_ARMOR_PARTS)).size).toBe(13);
  });

  it('maps occupied gameplay slots to the complete paired node groups', () => {
    expect(
      equipmentPartNodeNames(
        MESHY_TITAN_ARMOR_PARTS,
        { shoulder: 'any_shoulders', gloves: 'any_gloves', feet: 'any_boots' },
        false,
      ),
    ).toEqual([
      'Armor_valor_ShoulderL',
      'Armor_valor_ShoulderR',
      'Armor_valor_BracerL',
      'Armor_valor_BracerR',
      'Armor_valor_GloveL',
      'Armor_valor_GloveR',
      'Armor_valor_FootL',
      'Armor_valor_FootR',
    ]);
  });

  it('honors the helmet visibility toggle without affecting other equipped slots', () => {
    const equipped = { helmet: 'any_helmet', chest: 'any_chest' } as const;
    expect(equipmentPartNodeNames(MESHY_TITAN_ARMOR_PARTS, equipped, false)).toEqual([
      'Armor_valor_Head',
      'Armor_valor_Chest',
    ]);
    expect(equipmentPartNodeNames(MESHY_TITAN_ARMOR_PARTS, equipped, true)).toEqual([
      'Armor_valor_Chest',
    ]);
  });

  it('diffs slot occupancy by value while the prototype ignores item identity', () => {
    const first = equipmentPartSignature(
      MESHY_TITAN_ARMOR_PARTS,
      { chest: 'starter_chest' },
      false,
    );
    const replacement = equipmentPartSignature(
      MESHY_TITAN_ARMOR_PARTS,
      { chest: 'raid_chest' },
      false,
    );
    const unequipped = equipmentPartSignature(MESHY_TITAN_ARMOR_PARTS, {}, false);
    expect(first).toBe(replacement);
    expect(first).not.toBe(unequipped);
  });
});
