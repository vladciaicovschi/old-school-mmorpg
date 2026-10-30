import type { ClipMap } from './manifest';
import { WARRIOR_HIP_CARRY_CLIPS, WARRIOR_TRAVEL_CLIPS } from './warrior_travel_names';
import type { WeaponMotionSet } from './weapon_motion_core';

/** Every name comes from the warrior's own retargeted Mixamo donor. */
function armedMotion(family: 'Shield' | 'OneHand' | 'TwoHand'): WeaponMotionSet {
  const prefix = `WarriorT1_${family}_`;
  // The one-hand backhand turns through more than half a revolution. Keep it
  // as an unused special take, not in the ordinary grounded strike cycle.
  const sweep = family === 'OneHand' ? 'AttackA' : 'AttackC';
  return {
    idle: `${prefix}Idle`,
    walk: `${prefix}Walk`,
    run: `${prefix}Run`,
    jump: `${prefix}Jump`,
    attack: (family === 'OneHand' ? ['AttackA', 'AttackB'] : ['AttackA', 'AttackB', 'AttackC']).map(
      (name) => `${prefix}${name}`,
    ),
    ...(family === 'Shield' ? { attackWeights: [0.65, 0.175, 0.175] } : {}),
    cast: `${prefix}Cast`,
    hit: [`${prefix}Hit`],
    attackByAbility: {
      mortal_strike: `${prefix}AttackA`,
      execute: `${prefix}AttackA`,
      slam: `${prefix}AttackA`,
      red_harvest: `${prefix}AttackB`,
      breachmaker: `${prefix}AttackA`,
      shield_slam: `${prefix}${family === 'Shield' ? 'Block' : 'AttackA'}`,
      raging_gale: `${prefix}AttackB`,
      bloodthirst: `${prefix}AttackA`,
      cleave: `${prefix}${sweep}`,
      revenge: `${prefix}${sweep}`,
      thunder_clap: `${prefix}AttackA`,
      faultline: `${prefix}AttackA`,
      heroic_strike: `${prefix}AttackB`,
      overpower: `${prefix}AttackB`,
      hamstring: `${prefix}${sweep}`,
      sanguine_aura: `${prefix}Cast`,
      raised_guard: `${prefix}Block`,
      // No bare-fist interrupt or bespoke leap strike is present in these
      // packs. Keep a short native strike and jump rather than foreign bones.
      pummel: `${prefix}AttackB`,
      heroic_leap: `${prefix}Jump`,
      victory_rush: `${prefix}AttackB`,
      berserker_rage: `${prefix}Cast`,
      recklessness: `${prefix}Cast`,
      die_by_sword: `${prefix}Block`,
      avatar: `${prefix}Cast`,
      piercing_howl: `${prefix}Cast`,
    },
  };
}

const onehand = armedMotion('OneHand');
const shield = armedMotion('Shield');
const twohand = armedMotion('TwoHand');
// Rare visual-only upright spin. Original crouching/spinning combo stays unused.
twohand.attack.push('WarriorT1_TwoHand_AttackSpin');
twohand.attackWeights = [0.6, 0.175, 0.175, 0.05];

export const WARRIOR_T1_MOTION_CLIPS: ClipMap = {
  idle: onehand.idle,
  combatIdle: onehand.idle,
  walk: onehand.walk,
  run: onehand.run,
  jump: 'WarriorT1_Unarmed_Jump',
  jumpClampAtEnd: true,
  attack: onehand.attack,
  attackByAbility: onehand.attackByAbility,
  cast: onehand.cast,
  hit: onehand.hit,
  death: 'T1Warrior_Death',
  weaponMotions: {
    onehand,
    shield,
    twohand,
    // These packs do not contain dual-wield mocap. Reuse the single-blade
    // family explicitly until a matching pair-of-weapons pack is authored.
    dualwield: onehand,
    unarmed: {
      idle: WARRIOR_TRAVEL_CLIPS.idle,
      walk: WARRIOR_TRAVEL_CLIPS.walk,
      run: WARRIOR_TRAVEL_CLIPS.run,
      jump: 'WarriorT1_Unarmed_Jump',
      // Locomotion Pack has no unarmed strikes. This is a generic fallback,
      // not a claim that the one-hand swings are dedicated fist animations.
      attack: onehand.attack,
      cast: onehand.cast,
      hit: onehand.hit,
      attackByAbility: onehand.attackByAbility,
    },
  },
  travel: {
    idle: WARRIOR_TRAVEL_CLIPS.idle,
    walk: WARRIOR_TRAVEL_CLIPS.walk,
    run: WARRIOR_TRAVEL_CLIPS.run,
    jump: 'WarriorT1_Unarmed_Jump',
  },
  draw: WARRIOR_TRAVEL_CLIPS.draw,
  stow: WARRIOR_TRAVEL_CLIPS.stow,
  carrySwapFraction: 0.5,
  hipCarry: WARRIOR_HIP_CARRY_CLIPS,
  presentationPoses: [shield.idle, twohand.idle],
};
