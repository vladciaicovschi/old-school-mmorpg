// Disjoint shot/gait tracks on the existing character mixer. No additive rig
// edits, second mixer, shared-clip mutation, gameplay clock or frame allocations.
import * as THREE from 'three';
import type { BaseState } from './anim_state';

const FADE = 0.18;
const TRAVEL = new Set<BaseState>(['walk', 'walkBack', 'run', 'jump', 'fall']);
function upperTrack(track: THREE.KeyframeTrack): boolean {
  const bone = track.name.slice(0, track.name.lastIndexOf('.')).replace(/[^a-zA-Z0-9]/g, '');
  return /^mixamorig(?:Spine\d*|Neck\d*|Head|(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand.*))$/.test(
    bone,
  );
}
interface ShotPair {
  full: THREE.AnimationAction;
  upper: THREE.AnimationAction;
}
interface LowerGait {
  source: THREE.AnimationAction;
  action: THREE.AnimationAction;
  upper: THREE.AnimationAction;
}

export class ShotLocomotionLayer {
  private readonly names: ReadonlySet<string>;
  private readonly shots = new Map<THREE.AnimationAction, ShotPair>();
  private readonly uppers = new Map<THREE.AnimationAction, ShotPair>();
  private readonly gaits = new Map<THREE.AnimationAction, LowerGait>();
  private active: LowerGait | null = null;
  private clockMixer = 0;
  private clockPhase = 0;
  private clockRate = 1;
  private updating = false;
  private handoffAction: THREE.AnimationAction | null = null;
  private handoffPaused = false;

  constructor(
    private readonly mixer: THREE.AnimationMixer,
    names: readonly string[],
  ) {
    this.names = new Set(names);
  }

  /** Same name/clock, different disjoint track set. Full standing shots stay
   * untouched; only opted-in one-shots can enter this path. */
  sync(
    current: THREE.AnimationAction | null,
    shooting: boolean,
    base: THREE.AnimationAction | null,
    state: BaseState,
    rate: number | null,
    clampJump: boolean,
  ): THREE.AnimationAction | null {
    this.updating = true;
    const masked = current ? this.uppers.get(current) : undefined;
    const eligible = current && shooting && (masked || this.names.has(current.getClip().name));
    if (!eligible || !base || !TRAVEL.has(state)) {
      this.retire();
      if (masked && shooting && current) {
        this.copyClock(masked.full, current);
        current.stop();
        return masked.full;
      }
      return current;
    }
    let pair = masked ?? this.shots.get(current);
    if (!pair) {
      const clip = current.getClip();
      const tracks = clip.tracks.filter(upperTrack);
      if (!tracks.length || tracks.length === clip.tracks.length) return current;
      pair = {
        full: current,
        upper: this.mixer.clipAction(new THREE.AnimationClip(clip.name, clip.duration, tracks)),
      };
      this.shots.set(current, pair);
      this.uppers.set(pair.upper, pair);
    }
    let gait = this.gaits.get(base);
    if (!gait) {
      const source = base.getClip();
      gait = {
        source: base,
        action: this.mixer.clipAction(
          new THREE.AnimationClip(
            `${source.name}__shotLower`,
            source.duration,
            source.tracks.filter((track) => !upperTrack(track)),
          ),
        ),
        upper: this.mixer.clipAction(
          new THREE.AnimationClip(
            `${source.name}__shotOutgoingUpper`,
            source.duration,
            source.tracks.filter(upperTrack),
          ),
        ),
      };
      this.gaits.set(base, gait);
    }
    if (current !== pair.upper) {
      const atLaunch = current.time < 0.000001;
      const fromGait = atLaunch && base.isRunning();
      let fromShot = false;
      for (const upper of this.uppers.keys())
        if (upper !== pair.upper && upper.isRunning()) fromShot = true;
      if (fromGait) {
        this.copyClock(gait.upper, base);
        gait.upper.fadeOut(FADE);
      }
      this.copyClock(pair.upper, current);
      if (fromGait || (atLaunch && fromShot)) pair.upper.fadeIn(FADE);
      current.stop();
    }
    if (this.active !== gait) {
      const previous = this.active;
      for (const other of this.gaits.values())
        if (other !== gait && other !== previous) other.action.stop();
      const action = gait.action;
      action.reset().setEffectiveWeight(1);
      action.setLoop(
        clampJump && (state === 'jump' || state === 'fall') ? THREE.LoopOnce : THREE.LoopRepeat,
        Infinity,
      );
      action.clampWhenFinished = true;
      action.time = base.time;
      if (previous) {
        previous.action.fadeOut(FADE);
        action.fadeIn(FADE);
      }
      action.play();
      this.active = gait;
    }
    gait.action.timeScale = rate ?? 1;
    // The original full-body gait must not compete with the upper shot. Its
    // phase was copied before stopping; the lower layer now owns it exclusively.
    base.stop();
    this.clockMixer = this.mixer.time;
    this.clockPhase = gait.action.time;
    this.clockRate = gait.action.paused ? 0 : gait.action.timeScale;
    return pair.upper;
  }

  /** Called AFTER the owner's reset(), including from a mixer finished event.
   * Predict this frame's end phase independently of mixer action iteration order. */
  handoff(next: THREE.AnimationAction, previous: THREE.AnimationAction | null): void {
    if (!previous || !this.uppers.has(previous) || this.active?.source !== next) return;
    const duration = next.getClip().duration;
    const time = this.clockPhase + (this.mixer.time - this.clockMixer) * this.clockRate;
    next.time =
      next.loop === THREE.LoopOnce
        ? Math.max(0, Math.min(duration, time))
        : ((time % duration) + duration) % duration;
    if (next.loop === THREE.LoopOnce && next.time === duration) next.paused = true;
    // finished fires inside mixer.update. Action activation/deactivation can
    // move the incoming gait later in that same iteration; prevent a second
    // time advance while still allowing it to sample the predicted end pose.
    if (this.updating) {
      this.handoffAction = next;
      this.handoffPaused = next.paused;
      next.paused = true;
    }
  }

  afterUpdate(): void {
    this.updating = false;
    if (this.handoffAction) this.handoffAction.paused = this.handoffPaused;
    this.handoffAction = null;
  }

  drivesPose(minWeight: number): boolean {
    for (const gait of this.gaits.values())
      if (
        (gait.action.isScheduled() && gait.action.getEffectiveWeight() >= minWeight) ||
        (gait.upper.isScheduled() && gait.upper.getEffectiveWeight() >= minWeight)
      )
        return true;
    for (const upper of this.uppers.keys())
      if (upper.isScheduled() && upper.getEffectiveWeight() >= minWeight) return true;
    return false;
  }

  /** Mirror the owner's transition sweep for helper-owned upper actions. */
  sweep(next: THREE.AnimationAction, previous: THREE.AnimationAction | null): void {
    for (const action of this.uppers.keys())
      if (action !== next && action !== previous) action.stop();
    for (const gait of this.gaits.values()) gait.upper.stop();
  }

  stop(): void {
    this.afterUpdate();
    for (const action of this.uppers.keys()) action.stop();
    for (const gait of this.gaits.values()) {
      gait.action.stop();
      gait.upper.stop();
    }
    this.active = null;
  }

  private retire(): void {
    if (!this.active) return;
    this.active.action.fadeOut(FADE);
    this.active = null;
  }

  private copyClock(next: THREE.AnimationAction, source: THREE.AnimationAction): void {
    const time = source.time;
    const rate = source.timeScale;
    const paused = source.paused;
    next.reset().setLoop(source.loop, source.repetitions).setEffectiveWeight(1);
    next.clampWhenFinished = source.clampWhenFinished;
    next.time = time;
    next.timeScale = rate;
    next.paused = paused;
    next.play();
  }
}
