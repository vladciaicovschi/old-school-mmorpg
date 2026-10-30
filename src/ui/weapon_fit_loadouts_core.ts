import { HUNTER_TEST_BOW_ITEM, HUNTER_TEST_CROSSBOW_ITEM } from '../sim/content/items';

export function weaponFitLoadouts(
  visualKey: string,
): readonly { id: string; itemId: string | null }[] {
  if (visualKey === 'player_warrior')
    return [
      { id: 'starter', itemId: null },
      { id: 'claymore', itemId: 'eastbrook_greatsword' },
    ];
  if (visualKey === 'player_hunter')
    return [
      { id: 'crossbow', itemId: HUNTER_TEST_CROSSBOW_ITEM },
      { id: 'bow', itemId: HUNTER_TEST_BOW_ITEM },
    ];
  if (visualKey === 'player_paladin')
    return [
      { id: 'starter', itemId: null },
      { id: 'twohand', itemId: 'ironshod_maul' },
    ];
  return [{ id: 'starter', itemId: null }];
}
export function weaponFitSelection(visualKey: string, loadout: string | null) {
  const choices = weaponFitLoadouts(visualKey);
  const selected = choices.find((entry) => entry.id === loadout) ?? choices[0];
  return selected;
}
