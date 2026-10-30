import type { PlayerClass } from '../sim/types';
import { grantTemporaryHunterWeapons } from './hunter_weapon_test_kit';
import { grantTemporaryWarriorWeapon } from './warrior_weapon_test_kit';

export function grantTemporaryWeaponTestKit(
  development: boolean,
  playerClass: PlayerClass,
  offlineWorld: {
    readonly playerId: number;
    addItem(id: string, count: number, pid?: number): void;
  } | null,
): void {
  grantTemporaryWarriorWeapon(development, playerClass, offlineWorld);
  grantTemporaryHunterWeapons(development, playerClass, offlineWorld);
  // Temporary bag-only Paladin hammer, using existing localized item/model.
  if (development && playerClass === 'paladin' && offlineWorld)
    offlineWorld.addItem('ironshod_maul', 1, offlineWorld.playerId);
}
