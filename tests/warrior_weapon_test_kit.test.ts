import { describe, expect, it, vi } from 'vitest';
import { grantTemporaryWarriorWeapon } from '../src/game/warrior_weapon_test_kit';
import type { PlayerClass } from '../src/sim/types';

function world() {
  return { playerId: 42, addItem: vi.fn(), equipItem: vi.fn() };
}

describe('temporary offline warrior weapon test kit', () => {
  it('grants exactly one claymore item to the test warrior bag without equipping', () => {
    const offline = world();
    grantTemporaryWarriorWeapon(true, 'warrior', offline);
    expect(offline.addItem.mock.calls).toEqual([['eastbrook_greatsword', 1, 42]]);
    expect(offline.equipItem).not.toHaveBeenCalled();
  });

  it.each<PlayerClass>([
    'paladin',
    'hunter',
    'rogue',
    'priest',
    'shaman',
    'mage',
    'warlock',
    'druid',
  ])('does not grant to another class: %s', (playerClass) => {
    const offline = world();
    grantTemporaryWarriorWeapon(true, playerClass, offline);
    expect(offline.addItem).not.toHaveBeenCalled();
  });

  it('never grants in production or without an offline world', () => {
    const offline = world();
    grantTemporaryWarriorWeapon(false, 'warrior', offline);
    expect(offline.addItem).not.toHaveBeenCalled();
    expect(() => grantTemporaryWarriorWeapon(true, 'warrior', null)).not.toThrow();
  });
});
