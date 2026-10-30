import type { VisualDef } from './manifest';
import { weaponMotionClipNames } from './weapon_motion_core';

export function clipNamesOf(def: VisualDef): string[] {
  const c = def.clips;
  return [
    c.idle,
    c.combatIdle,
    c.drawnIdle,
    c.walk,
    c.run,
    c.death,
    ...(c.attack ?? []),
    ...(c.locomotionShotClips ?? []),
    ...Object.values(c.attackByAbility ?? {}),
    ...Object.values(c.castByAbility ?? {}),
    ...Object.values(c.castByTarget ?? {}),
    ...Object.values(c.castReleaseByTarget ?? {}),
    ...Object.values(c.attackByHand ?? {}),
    ...(c.hit ?? []),
    c.cast,
    c.sitDown,
    c.sitIdle,
    c.swim,
    c.swimSurface,
    c.swimIdle,
    c.wade,
    c.jump,
    c.fall,
    c.land,
    c.walkBack,
    c.flourish,
    c.stow,
    c.draw,
    ...Object.values(c.hipCarry ?? {}),
    c.travel?.idle,
    c.travel?.walk,
    c.travel?.run,
    c.travel?.jump,
    ...weaponMotionClipNames(c.weaponMotions),
    // The idle-breakers and the idle beat were MISSING here, which is the only
    // place actions get built (visual.ts constructor). A clip absent from this
    // list loads fine and passes the clipmap gate, that gate checks the GLB,
    // not the action map, but `this.action(name)` returns null forever, so
    // tickIdleVariant/tickIdleBeat bail on every fire and the rig simply never
    // fidgets. Silent: no throw, no warning, just a clip that is never seen.
    ...(c.idleVariants ?? []),
    c.idleBeat?.clip,
    ...(c.presentationPoses ?? []),
    ...Object.values(c.emote ?? {}).flatMap((spec) => spec.clips),
  ].filter((n): n is string => !!n);
}
