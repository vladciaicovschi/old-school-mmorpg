export interface CastDurationFit {
  /** Authored attack anticipation appended after the complete preparation. */
  tailSeconds: number;
  /** Real-time space reserved for that anticipation near cast completion. */
  tailPlaybackSeconds: number;
  /** Cap preparation speed by taking a shorter window ending at the same pose. */
  maxPreparationSpeed?: number;
}

export interface CastDurationSnapshot {
  castTotal?: number;
  castRemaining?: number;
}

export interface CastDurationClock {
  total: number;
  remaining: number;
  betweenSnapshots: number;
  playbackRate: number;
}

export const createCastDurationClock = (): CastDurationClock => ({
  total: 0,
  remaining: 0,
  betweenSnapshots: 0,
  playbackRate: 1,
});

export interface CastReleaseSnapshot extends CastDurationSnapshot {
  moving: boolean;
  airborne: boolean;
  swimming: boolean;
  sitting: boolean;
  casting: boolean;
}

/** Do not mistake a lingering pre-release online snapshot for a new cast. */
export function fittedReleaseInterrupted(
  clock: CastDurationClock,
  snapshot: CastReleaseSnapshot,
): boolean {
  return (
    snapshot.moving ||
    snapshot.airborne ||
    snapshot.swimming ||
    snapshot.sitting ||
    (snapshot.casting && (snapshot.castRemaining ?? 0) > clock.remaining + 0.0001)
  );
}

/** Follow authoritative cast progress, interpolating unchanged 20 Hz snapshots.
 * Preparation is end-aligned and optionally trimmed, then attack reaches its release pose
 * at the deadline. Pushback and late snapshots seek the correct phase directly. */
export function fittedCastTime(
  clock: CastDurationClock,
  snapshot: CastDurationSnapshot,
  clipDuration: number,
  dt: number,
  fit: CastDurationFit,
  restart = false,
): number | null {
  const total = snapshot.castTotal ?? 0;
  const remaining = snapshot.castRemaining;
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    remaining === undefined ||
    !Number.isFinite(remaining) ||
    !Number.isFinite(clipDuration) ||
    clipDuration <= 0 ||
    !Number.isFinite(dt) ||
    dt < 0
  )
    return null;
  if (restart || total !== clock.total || remaining !== clock.remaining) {
    clock.total = total;
    clock.remaining = remaining;
    clock.betweenSnapshots = 0;
  } else clock.betweenSnapshots += dt;
  const elapsed = Math.min(total, Math.max(0, total - remaining + clock.betweenSnapshots));
  const tail = fit.tailSeconds;
  if (
    !Number.isFinite(tail) ||
    tail <= 0 ||
    tail >= clipDuration ||
    !Number.isFinite(fit.tailPlaybackSeconds) ||
    fit.tailPlaybackSeconds <= 0
  ) {
    clock.playbackRate = clipDuration / total;
    return (elapsed / total) * clipDuration;
  }
  const tailTime = Math.min(fit.tailPlaybackSeconds, total * 0.25);
  const preparationTime = total - tailTime;
  const preparationLength = clipDuration - tail;
  const maximum = fit.maxPreparationSpeed;
  const speed =
    maximum !== undefined && Number.isFinite(maximum) && maximum > 0
      ? Math.min(preparationLength / preparationTime, maximum)
      : preparationLength / preparationTime;
  const start = Math.max(0, preparationLength - preparationTime * speed);
  clock.playbackRate = elapsed < preparationTime ? speed : tail / tailTime;
  return elapsed < preparationTime
    ? start + elapsed * speed
    : preparationLength + ((elapsed - preparationTime) / tailTime) * tail;
}
