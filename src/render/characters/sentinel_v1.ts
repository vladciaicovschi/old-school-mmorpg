import type { ClipMap } from './manifest';

export const SENTINEL_V1_CLIPS: ClipMap = {
  idle: 'Sentinel_Idle',
  combatIdle: 'Sentinel_CombatIdle',
  walk: 'Sentinel_Walk',
  run: 'Sentinel_Run',
  attack: ['Sentinel_Attack', 'Sentinel_Slash'],
  hit: ['Sentinel_Hit'],
  death: 'Sentinel_Death',
  cast: 'Sentinel_Cast',
  jump: 'Sentinel_Jump',
};
