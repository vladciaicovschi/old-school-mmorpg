import { describe, expect, it, vi } from 'vitest';
import { grantTemporaryWeaponTestKit } from '../src/game/development_weapon_test_kit';
import { CLASSES, ITEMS } from '../src/sim/data';
import { canEquipItem } from '../src/sim/equipment_rules';
import { Sim } from '../src/sim/sim';

describe('temporary local Paladin two-hand test kit', () => {
  it('grants one existing two-hand hammer to the bag, without equipping or changing starter gear', () => {
    const world = { playerId: 7, addItem: vi.fn(), equipItem: vi.fn() };
    const starter = CLASSES.paladin.startWeapon;
    grantTemporaryWeaponTestKit(true, 'paladin', world);
    expect(world.addItem.mock.calls).toEqual([['ironshod_maul', 1, 7]]);
    expect(world.equipItem).not.toHaveBeenCalled();
    expect(CLASSES.paladin.startWeapon).toBe(starter);
    const maul = ITEMS.ironshod_maul;
    if (maul.kind !== 'weapon') throw new Error('Test maul must remain a weapon');
    expect(maul.hand).toBe('twohand');
    expect(canEquipItem('paladin', ITEMS.ironshod_maul)).toBe(true);
  });
  it('never grants the hammer in production, without a local world, or to another class', () => {
    const world = { playerId: 7, addItem: vi.fn() };
    grantTemporaryWeaponTestKit(false, 'paladin', world);
    grantTemporaryWeaponTestKit(true, 'mage', world);
    grantTemporaryWeaponTestKit(true, 'paladin', null);
    expect(world.addItem).not.toHaveBeenCalled();
  });
  it('lets a real level-one Paladin equip the granted hammer and correctly removes its shield', () => {
    const sim = new Sim({ seed: 42, playerClass: 'paladin', autoEquip: true });
    const starter = sim.equipment;
    expect(starter.offhand).toBeTruthy();
    grantTemporaryWeaponTestKit(true, 'paladin', sim);
    sim.equipItem('ironshod_maul');
    expect(sim.equipment.mainhand).toBe('ironshod_maul');
    expect(sim.equipment.offhand).toBeUndefined();
  });
});
