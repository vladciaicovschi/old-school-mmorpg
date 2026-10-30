import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { EquipSlot } from '../src/sim/types';

const BODY_GEAR = {
  helmet: 'cryptbone_helm',
  shoulder: 'cryptbone_pauldrons',
  chest: 'warrior_knight_suit',
  gloves: 'mistveil_grips',
  waist: 'mistveil_cord',
  legs: 'quilted_trousers',
  feet: 'oiled_boots',
} satisfies Partial<Record<EquipSlot, string>>;

describe('warrior independent equipment with a chest-selected body', () => {
  it('uses ordinary starters without granting test armor sets to every new warrior', () => {
    const sim = new Sim({ seed: 29, playerClass: 'warrior', autoEquip: false });
    expect(sim.equipment.chest).toBe('recruit_tunic');
    expect(sim.countItem('warrior_militia_suit')).toBe(0);
    expect(sim.countItem('warrior_knight_suit')).toBe(0);
  });

  it('equips every armor slot independently and sums each item into derived stats', () => {
    const sim = new Sim({ seed: 30, playerClass: 'warrior', autoEquip: false });
    const startArmor = sim.player.stats.armor;
    for (const [slot, itemId] of Object.entries(BODY_GEAR)) {
      sim.addItem(itemId, 1);
      sim.equipItem(itemId);
      expect(sim.equipment[slot as EquipSlot]).toBe(itemId);
    }
    const expectedArmor = Object.values(BODY_GEAR).reduce(
      (sum, id) => sum + (ITEMS[id].stats?.armor ?? 0) + 2 * (ITEMS[id].stats?.agi ?? 0),
      0,
    );
    expect(sim.player.stats.armor).toBe(
      startArmor - ITEMS.recruit_tunic.stats!.armor! + expectedArmor,
    );
    expect(sim.player.equippedItems).toMatchObject(BODY_GEAR);
    sim.unequipItem('helmet');
    expect(sim.equipment.chest).toBe('warrior_knight_suit');
    expect(sim.equipment.feet).toBe('oiled_boots');
    expect(sim.player.stats.armor).toBe(
      startArmor -
        ITEMS.recruit_tunic.stats!.armor! +
        expectedArmor -
        ITEMS.cryptbone_helm.stats!.armor!,
    );
  });

  it.each([undefined, 0, 1])(
    'preserves worn slots and exact payloads on load, legacy stamp %s',
    (revision) => {
      const source = new Sim({ seed: 31, playerClass: 'warrior', autoEquip: false });
      const state = source.serializeCharacter(source.player.id)!;
      state.equipment = { ...state.equipment, ...BODY_GEAR };
      state.equipmentInstance = { helmet: { name: 'Legacy helm', rolled: { stats: { sta: 3 } } } };
      state.inventory = [{ itemId: 'warrior_militia_suit', count: 1 }];
      if (revision === undefined) delete state.wholeBodyArmorRevision;
      else state.wholeBodyArmorRevision = revision;
      const loaded = new Sim({
        seed: 32,
        playerClass: 'warrior',
        noPlayer: true,
        autoEquip: false,
      });
      const pid = loaded.addPlayer('warrior', 'Mixed gear', { state });
      const saved = loaded.serializeCharacter(pid)!;
      expect(saved.equipment).toEqual(state.equipment);
      expect(saved.equipmentInstance).toEqual(state.equipmentInstance);
      expect(saved.inventory).toEqual(state.inventory);
      expect(saved.wholeBodyArmorRevision).toBe(revision);
      const reloaded = new Sim({
        seed: 33,
        playerClass: 'warrior',
        noPlayer: true,
        autoEquip: false,
      });
      const nextPid = reloaded.addPlayer('warrior', 'Mixed gear', { state: saved });
      expect(reloaded.serializeCharacter(nextPid)!.equipment).toEqual(state.equipment);
      expect(reloaded.serializeCharacter(nextPid)!.inventory).toEqual(state.inventory);
    },
  );
});
