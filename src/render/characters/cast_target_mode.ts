/** Display-only target relation for choosing a cast gesture. */
export type CastTargetMode = 'self' | 'ally' | 'hostile';

/** Friendly gestures take precedence over school-specific offensive gestures. */
export function friendlyCastClip(
  clips: Partial<Record<CastTargetMode, string>> | undefined,
  mode: CastTargetMode | null | undefined,
): string | undefined {
  return mode === 'self' || mode === 'ally' ? clips?.[mode] : undefined;
}

/** Resolve the relationship an animation should communicate. An enemy spell
 * without an entity target may aim at the ground and keeps a directed gesture.
 * Other missing targets are self-casts; friendly entity targets are ally casts.
 * `any` remains hostile unless it is explicitly aimed at the caster, because
 * the renderer intentionally has no authority to re-evaluate combat factions. */
export function castTargetMode(
  casterId: number,
  targetId: number | null | undefined,
  targetType: 'enemy' | 'friendly' | 'any' | undefined,
): CastTargetMode {
  if (targetId === casterId) return 'self';
  if (targetId === null || targetId === undefined) return targetType === 'enemy' ? 'hostile' : 'self';
  return targetType === 'friendly' ? 'ally' : 'hostile';
}
