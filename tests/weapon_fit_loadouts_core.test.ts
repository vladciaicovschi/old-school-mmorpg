import { describe, expect, it } from 'vitest';
import { weaponFitLoadouts, weaponFitSelection } from '../src/ui/weapon_fit_loadouts_core';

describe('bounded weapon fitting loadouts', () => {
  it('offers Paladin starter shield and a separately fitted two-hand maul', () => {
    expect(weaponFitLoadouts('player_paladin')).toEqual([
      { id: 'starter', itemId: null },
      { id: 'twohand', itemId: 'ironshod_maul' },
    ]);
    expect(weaponFitSelection('player_paladin', 'twohand').itemId).toBe('ironshod_maul');
    expect(weaponFitSelection('player_paladin', 'bow').id).toBe('starter');
  });
  it('normalizes only declared body/loadout pairs and keeps hunter hands separate from warrior tests', () => {
    expect(weaponFitLoadouts('player_hunter').map((entry) => entry.id)).toEqual([
      'crossbow',
      'bow',
    ]);
    expect(weaponFitSelection('player_hunter', 'bow').itemId).toBe('dev_hunter_practice_bow');
    expect(weaponFitSelection('player_hunter', 'claymore').id).toBe('crossbow');
    expect(weaponFitSelection('player_warrior', 'bow').id).toBe('starter');
    expect(weaponFitSelection('player_mage', 'bow')).toEqual({ id: 'starter', itemId: null });
  });
});
