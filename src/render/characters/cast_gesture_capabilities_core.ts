export interface CastGestureVisual {
  hasAttackClipOverride(abilityId: string): boolean;
  readonly supportsJoinedCastRelease: boolean;
}

export function hasJoinedMobCastContext(
  fx: string,
  abilityId: string | undefined,
  casting: boolean,
  preparing: boolean,
): boolean {
  return !!abilityId || casting || preparing || fx === 'selfCast';
}

/** Capability reads follow the currently displayed form, not a template list. */
export function castGestureCapabilities(
  readVisual: (id: number) => CastGestureVisual | null,
  channeling: (id: number) => boolean,
) {
  return {
    hasGestureClip: (id: number, abilityId: string) =>
      readVisual(id)?.hasAttackClipOverride(abilityId) ?? false,
    hasJoinedCastRelease: (id: number) =>
      !channeling(id) && (readVisual(id)?.supportsJoinedCastRelease ?? false),
  };
}

/** Preserve legacy id-less projectile swings; only opted-in casts join phases. */
export function mobSpellGesturePlan(
  fx: string,
  isMob: boolean,
  casting: boolean,
  channeling: boolean,
  midOneShot: boolean,
  joined: boolean,
): 'release' | 'attack' | null {
  if (!isMob || midOneShot) return null;
  if (joined && !channeling && ['projectile', 'lightning', 'nova', 'selfCast', 'beam'].includes(fx))
    return 'release';
  return (fx === 'projectile' || fx === 'beam') && !casting ? 'attack' : null;
}

/** The registry-declined cue still owes the same rig gesture. Keep capability
 * composition here so the renderer only dispatches the resulting tell. */
export function fallbackSpellGesture(
  event: { fx: string; ability?: string },
  source: { kind: string; castingAbility?: unknown; channeling?: unknown } | undefined,
  visual: {
    supportsJoinedCastRelease: boolean;
    isPreparingFittedCast: boolean;
    isMidOneShot: boolean;
  } | null,
): ReturnType<typeof mobSpellGesturePlan> {
  const casting = !!source?.castingAbility;
  const joined =
    !!visual?.supportsJoinedCastRelease &&
    hasJoinedMobCastContext(event.fx, event.ability, casting, !!visual?.isPreparingFittedCast);
  return mobSpellGesturePlan(
    event.fx,
    source?.kind === 'mob',
    casting,
    !!source?.channeling,
    !!visual?.isMidOneShot,
    joined,
  );
}
