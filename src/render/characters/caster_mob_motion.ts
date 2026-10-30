// Explicit opt-in for the four lab casters; never a blanket humanoid override.
import {
  CASTER_MOB_CAST_FIT,
  CASTER_MOB_TARGETS,
  casterMobAnimationUrl,
} from '../../../scripts/anim/caster_mob_targets.mjs';
import type { ClipMap } from './manifest';

export function casterMobMotion(
  visualKey: string,
  native: ClipMap,
): { clips: ClipMap; animUrls: string[] } {
  const target = CASTER_MOB_TARGETS.find((entry) => entry.visualKey === visualKey);
  if (!target) throw Error(`Unknown caster mob: ${visualKey}`);
  const p = target.prefix;
  return {
    animUrls: [casterMobAnimationUrl(target)],
    clips: {
      ...native,
      idle: `${p}_Idle`,
      combatIdle: `${p}_Idle`,
      attack: [`${p}_Attack`],
      cast: `${p}_PrepareHostile`,
      castDurationFit: { ...CASTER_MOB_CAST_FIT },
      castByTarget: {
        hostile: `${p}_PrepareHostile`,
        self: `${p}_PrepareFriendly`,
        ally: `${p}_PrepareFriendly`,
      },
      castReleaseByTarget: {
        hostile: `${p}_ReleaseHostile`,
        self: `${p}_ReleaseFriendly`,
        ally: `${p}_ReleaseFriendly`,
      },
    },
  };
}
