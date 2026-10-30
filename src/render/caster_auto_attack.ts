import { Vector3 } from 'three';
import type { CharacterVisual } from './characters/visual';
import type { Vfx } from './vfx';

const palm = new Vector3();
type MagicAutoVisual = Pick<CharacterVisual, 'playMagicAutoAttack' | 'castPalmWorldPosition'>;
interface ProjectileCue {
  fx: string;
  wand?: true;
  sourceId: number;
  targetId: number;
  school: string;
  attackAnimation?: string;
}

/** Only the authoritative wand launch cue opts in, never an ability bolt,
 * Hunter shot or physical staff hit. Vfx copies the optional origin at spawn. */
export function playCasterAutoAttack(
  event: ProjectileCue,
  kind: string | undefined,
  visual: MagicAutoVisual | null,
  vfx: Pick<Vfx, 'projectileForEvent'>,
): boolean {
  if (kind !== 'player' || event.fx !== 'projectile' || event.wand !== true) return false;
  visual?.playMagicAutoAttack();
  const origin = visual?.castPalmWorldPosition(palm) ? palm : undefined;
  vfx.projectileForEvent(event, origin);
  return true;
}
