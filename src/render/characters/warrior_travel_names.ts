/** Shared by the manifest and runtime generator without loading three.js. */
export const WARRIOR_TRAVEL_CLIPS = {
  idle: 'Warrior_TravelIdle',
  walk: 'Warrior_TravelWalk',
  run: 'Warrior_TravelRun',
  draw: 'Warrior_TravelDraw',
  stow: 'Warrior_TravelStow',
} as const;

export const WARRIOR_HIP_CARRY_CLIPS = {
  draw: 'Warrior_HipDraw',
  stow: 'Warrior_HipStow',
  dualDraw: 'Warrior_DualHipDraw',
  dualStow: 'Warrior_DualHipStow',
} as const;
