import type { PoseRig } from './rig_pose.mjs';
export function createHumanoidWorldRetargeter(
  donor: PoseRig,
  target: PoseRig,
  keys: readonly string[],
): (pose: Map<string, number[]>) => Map<string, number[]>;
