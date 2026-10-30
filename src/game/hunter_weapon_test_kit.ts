// Temporary offline acquisition only. No auto-equip or shared starter changes.
import type { PlayerClass } from '../sim/types';

interface HunterWeaponTestWorld {
  readonly playerId: number;
  addItem(itemId: string, count: number, pid?: number): void;
}

export function grantTemporaryHunterWeapons(
  development: boolean,
  playerClass: PlayerClass,
  offlineWorld: HunterWeaponTestWorld | null,
): void {
  if (!development || playerClass !== 'hunter' || !offlineWorld) return;
  offlineWorld.addItem('dev_hunter_practice_bow', 1, offlineWorld.playerId);
  offlineWorld.addItem('dev_hunter_practice_crossbow', 1, offlineWorld.playerId);
}
