/** Presentation gait thresholds for bodies whose native stride differs from
 * the global humanoid walk/run thresholds. No simulation speed is changed. */
import { type AnimState, type BaseState, desiredBaseState } from './anim_state';

export interface ModelGait {
  runEnter: number;
  runExit: number;
}

export function desiredModelBaseState(
  state: AnimState,
  hasWalkBack: boolean,
  hasWade: boolean,
  hasCombatIdle: boolean,
  gait?: ModelGait,
  previous: BaseState = 'idle',
): BaseState {
  const base = desiredBaseState(state, hasWalkBack, hasWade, hasCombatIdle);
  if (!gait || (base !== 'walk' && base !== 'run')) return base;
  const running = previous === 'run' ? state.speed > gait.runExit : state.speed >= gait.runEnter;
  return running ? 'run' : 'walk';
}
