// The native great-sword spin is a crouching combo before its upper sweep.
// Keep only the inspected upright turn (1.94..2.90s), with short idle joins.
import { blendValue, samplePose } from './pose_blend.mjs';
import { retargetPose } from './rig_pose.mjs';

export const UPRIGHT_SPIN_WINDOW = [1.94, 2.9];
export const UPRIGHT_SPIN_LEAD = 0.18;
export const UPRIGHT_SPIN_TAIL = 0.28;
export const UPRIGHT_SPIN_SECONDS = UPRIGHT_SPIN_LEAD + 0.96 + UPRIGHT_SPIN_TAIL;

export function uprightWeaponSpinTimeline(clip, idle, donorRest, targetRest) {
  const sweep = UPRIGHT_SPIN_WINDOW[1] - UPRIGHT_SPIN_WINDOW[0];
  const frames = Math.ceil(UPRIGHT_SPIN_SECONDS * 30);
  const times = new Set(
    Array.from({ length: frames + 1 }, (_, i) => (i * UPRIGHT_SPIN_SECONDS) / frames),
  );
  times.add(UPRIGHT_SPIN_LEAD);
  times.add(UPRIGHT_SPIN_LEAD + sweep);
  return [...times]
    .sort((a, b) => a - b)
    .map((time) => {
      const local = Math.max(0, Math.min(sweep, time - UPRIGHT_SPIN_LEAD));
      const pose = retargetPose(
        samplePose(clip, UPRIGHT_SPIN_WINDOW[0] + local),
        donorRest,
        targetRest,
      );
      const weight =
        time < UPRIGHT_SPIN_LEAD
          ? time / UPRIGHT_SPIN_LEAD
          : time > UPRIGHT_SPIN_LEAD + sweep
            ? (UPRIGHT_SPIN_SECONDS - time) / UPRIGHT_SPIN_TAIL
            : 1;
      const smooth = weight * weight * (3 - 2 * weight);
      return [
        time,
        (key) =>
          blendValue(
            key,
            idle.get(key) ?? targetRest.get(key),
            pose.get(key) ?? targetRest.get(key),
            smooth,
          ),
      ];
    });
}
