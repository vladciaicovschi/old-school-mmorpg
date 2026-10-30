import { type AnimationAction, type AnimationMixer, LoopOnce } from 'three';
import {
  type CastDurationFit,
  type CastDurationSnapshot,
  type CastReleaseSnapshot,
  createCastDurationClock,
  fittedCastTime,
  fittedReleaseInterrupted,
} from './cast_duration_core';

/** Per-visual clock; ordinary rigs and release one-shots retain native playback. */
export class CastDurationMixer {
  private action: AnimationAction | null = null;
  private readonly clock = createCastDurationClock();

  releaseInterrupted(snapshot: CastReleaseSnapshot): boolean {
    return fittedReleaseInterrupted(this.clock, snapshot);
  }

  update(
    mixer: AnimationMixer,
    action: AnimationAction | null,
    dt: number,
    snapshot?: CastDurationSnapshot,
    fit?: CastDurationFit,
  ): void {
    const time =
      action && snapshot && fit && action.enabled
        ? fittedCastTime(
            this.clock,
            snapshot,
            action.getClip().duration,
            dt * mixer.timeScale,
            fit,
            this.action !== action,
          )
        : null;
    if (!action || time === null) {
      this.action = null;
      mixer.update(dt);
      return;
    }
    this.action = action;
    action.time = time;
    // Outgoing fades must keep the same capped rate, not briefly speed through
    // the rest of the original clip when cancellation hands the rig to walking.
    action.timeScale = this.clock.playbackRate;
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.paused = true;
    try {
      mixer.update(dt);
    } finally {
      action.paused = false;
    }
  }
}
