import { WARRIOR_TRAVEL_CLIPS } from './warrior_travel_names';
import type { WeaponMotionSet } from './weapon_motion_core';

/** Shared carry gestures, but the baked gaits are on Paladin's own hierarchy. */
export const PALADIN_TRAVEL_CLIPS = {
  ...WARRIOR_TRAVEL_CLIPS,
  jump: 'PaladinT1_Unarmed_Jump',
};

const prefix = 'PaladinT1_TwoHand_';
/** Offline target-rig transfer of the inspected Warrior great-sword family.
 * One-hand/shield keeps the original Paladin ClipMap and ability gestures. */
export const PALADIN_TWOHAND_MOTION: WeaponMotionSet = {
  idle: `${prefix}Idle`,
  walk: `${prefix}Walk`,
  run: `${prefix}Run`,
  jump: `${prefix}Jump`,
  attack: ['AttackA', 'AttackB', 'AttackC', 'AttackSpin'].map((name) => `${prefix}${name}`),
  attackWeights: [0.6, 0.175, 0.175, 0.05],
  cast: `${prefix}Cast`,
  hit: [`${prefix}Hit`],
  attackByAbility: {
    final_edict: `${prefix}AttackA`,
    bastion_sweep: `${prefix}AttackC`,
    hammer_of_justice: `${prefix}AttackB`,
    sunward_disc: `${prefix}Cast`,
    consecration: `${prefix}Cast`,
    divine_protection: `${prefix}Cast`,
    sacred_bulwark: `${prefix}Cast`,
    blessing_of_might: `${prefix}Cast`,
    devotion_aura: `${prefix}Cast`,
    retribution_aura: `${prefix}Cast`,
    righteous_fury: `${prefix}Cast`,
    holy_light: `${prefix}Cast`,
    flash_of_light: `${prefix}Cast`,
    lay_on_hands: `${prefix}Cast`,
  },
};
