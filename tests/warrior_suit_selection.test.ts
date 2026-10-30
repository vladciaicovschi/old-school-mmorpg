import { describe, expect, it } from 'vitest';
import { WarriorSuitSelection } from '../src/game/warrior_suit_selection';
import type { Entity } from '../src/sim/types';

const player = {
  id: 7,
  name: 'Testwarrior',
  kind: 'player',
  templateId: 'warrior',
  equippedItems: { chest: 'warrior_recruit_suit' },
} as Entity;

describe('whole-body warrior equipment visuals', () => {
  it('waits for assets and resolves the model from authoritative equipment', () => {
    const state = new WarriorSuitSelection();
    expect(state.visualKey(player)).toBeNull();
    state.ready = true;
    expect(state.visualKey(player)).toBe('player_warrior');
    expect(
      state.visualKey({
        ...player,
        equippedItems: { chest: 'warrior_militia_suit' },
      }),
    ).toBe('player_warrior');
    expect(state.visualKey({ ...player, templateId: 'mage' })).toBeNull();
    expect(state.visualKey({ ...player, kind: 'npc' })).toBeNull();
  });

  it('uses base T1 for empty or legacy chest equipment', () => {
    const state = new WarriorSuitSelection();
    state.ready = true;
    expect(state.visualKey({ ...player, equippedItems: {} })).toBe('player_warrior');
    expect(state.visualKey({ ...player, equippedItems: { chest: 'recruit_tunic' } })).toBe(
      'player_warrior',
    );
  });
});
