import type { ClipMap } from './manifest';
import type { WeaponMotionSet } from './weapon_motion_core';

function rangedMotion(family: 'Bow' | 'Crossbow'): WeaponMotionSet {
  const prefix = `HunterT1_${family}_`;
  return {
    idle: `${prefix}Idle`,
    walk: `${prefix}Walk`,
    walkBack: `${prefix}WalkBack`,
    run: `${prefix}Run`,
    jump: `${prefix}Jump`,
    attack: [`${prefix}Shot`],
    cast: `${prefix}Aim`,
    castForDrawnShot: true,
    hit: ['HunterT1_Hit'],
    attackByAbility: {
      serpent_sting: `${prefix}Shot`,
      arcane_shot: `${prefix}Shot`,
      concussive_shot: `${prefix}Shot`,
      counter_shot: `${prefix}Shot`,
      aimed_shot: `${prefix}Release`,
      measured_shot: `${prefix}Release`,
      volley: `${prefix}Shot`,
    },
  };
}
const bow = rangedMotion('Bow');
const crossbow = rangedMotion('Crossbow');
export const HUNTER_T1_MOTION_CLIPS: ClipMap = {
  // Calm native body idle for the stowed roster portrait, not ranged carry.
  presentationPoses: ['T1Hunter_Idle'],
  idle: crossbow.idle,
  walk: crossbow.walk,
  walkBack: crossbow.walkBack,
  run: crossbow.run,
  jump: crossbow.jump,
  attack: crossbow.attack,
  locomotionShotClips: [
    'HunterT1_Bow_Shot',
    'HunterT1_Bow_Release',
    'HunterT1_Crossbow_Shot',
    'HunterT1_Crossbow_Release',
  ],
  hit: crossbow.hit,
  combatIdle: crossbow.idle,
  death: 'T1Hunter_Death',
  cast: 'HunterT1_Utility',
  jumpClampAtEnd: true,
  castHoldPointByAbility: { aimed_shot: 0.6, measured_shot: 0.6 },
  weaponMotions: { bow, crossbow },
  attackByAbility: {
    raptor_strike: 'Hunter_Melee_Gut',
    mongoose_bite: 'Hunter_Melee_Counter',
    wing_clip: 'Hunter_Melee_Clip',
    aspect_of_the_hawk: 'Spellcast_Raise',
    aspect_of_the_monkey: 'Spellcast_Raise',
    aspect_of_the_cheetah: 'Spellcast_Raise',
    rapid_fire: 'Spellcast_Raise',
  },
};
