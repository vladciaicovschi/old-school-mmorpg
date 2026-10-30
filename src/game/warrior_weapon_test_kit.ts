// Temporary offline T1 weapon-fit kit. Remove this module and its startOffline
// call after claymore carry testing; never change shared starter gear or saves.
import type { PlayerClass } from '../sim/types';

interface WarriorWeaponTestWorld {
  readonly playerId: number;
  addItem(itemId: string, count: number, pid?: number): void;
}

/** Bag grant only. The real equipment UI remains responsible for equipping it. */
export function grantTemporaryWarriorWeapon(
  development: boolean,
  playerClass: PlayerClass,
  offlineWorld: WarriorWeaponTestWorld | null,
): void {
  if (!development || playerClass !== 'warrior' || !offlineWorld) return;
  offlineWorld.addItem('eastbrook_greatsword', 1, offlineWorld.playerId);
}
