import type { ClipMap } from './manifest';
import { WARRIOR_TRAVEL_CLIPS } from './warrior_travel_names';

export const WARRIOR_SUITS = ['recruit', 'militia', 'knight'] as const;
export type WarriorSuit = (typeof WARRIOR_SUITS)[number];

export function warriorSuitVisualKey(suit: WarriorSuit): string {
  return `player_warrior_${suit}`;
}

export const WARRIOR_SUIT_VISUAL_KEYS = WARRIOR_SUITS.map(warriorSuitVisualKey);

export const WARRIOR_SUIT_CLIPS: ClipMap = {
  idle: 'Warrior_idle_2',
  combatIdle: 'Warrior_idle',
  walk: 'Warrior_walk',
  run: 'Warrior_run',
  travel: WARRIOR_TRAVEL_CLIPS,
  draw: WARRIOR_TRAVEL_CLIPS.draw,
  stow: WARRIOR_TRAVEL_CLIPS.stow,
  carrySwapFraction: 0.5,
  attack: ['Warrior_attack', 'Warrior_slash', 'Warrior_attack_2'],
  hit: ['Warrior_impact', 'Warrior_impact_2'],
  death: 'Warrior_death',
  cast: 'Warrior_casting',
  jump: 'Warrior_jump',
};
