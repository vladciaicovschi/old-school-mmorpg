import { describe, expect, it, vi } from 'vitest';
import { grantTemporaryWeaponTestKit } from '../src/game/development_weapon_test_kit';
import { grantTemporaryHunterWeapons } from '../src/game/hunter_weapon_test_kit';
import { CLASSES, ITEMS } from '../src/sim/data';
import { canEquipItem } from '../src/sim/equipment_rules';

describe('temporary hunter weapon test kit', () => {
  it('grants both switchable weapons to local DEV hunters without equipping or changing starter gear', () => {
    const world = { playerId: 7, addItem: vi.fn() };
    grantTemporaryWeaponTestKit(true, 'hunter', world);
    expect(world.addItem.mock.calls).toEqual([
      ['dev_hunter_practice_bow', 1, 7],
      ['dev_hunter_practice_crossbow', 1, 7],
    ]);
    expect(CLASSES.hunter.startWeapon).toBe('rusty_hatchet');
    for (const id of ['dev_hunter_practice_bow', 'dev_hunter_practice_crossbow']) {
      expect(ITEMS[id].sellValue).toBe(0);
      expect(ITEMS[id].kind).toBe('weapon');
      expect(canEquipItem('hunter', ITEMS[id])).toBe(true);
      expect(canEquipItem('mage', ITEMS[id])).toBe(false);
    }
  });
  it('never grants in production, to other classes, or without an offline world', () => {
    const world = { playerId: 7, addItem: vi.fn() };
    grantTemporaryHunterWeapons(false, 'hunter', world);
    grantTemporaryHunterWeapons(true, 'warrior', world);
    grantTemporaryHunterWeapons(true, 'hunter', null);
    expect(world.addItem).not.toHaveBeenCalled();
  });
});
