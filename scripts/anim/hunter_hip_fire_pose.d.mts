import type { Pose } from './pose_blend.mjs';
import type { PoseRig } from './rig_pose.mjs';

export function createHunterHipFirePose(
  rig: PoseRig,
  keys: Iterable<string>,
  carry: Pose,
  aim: Pose,
): Pose;
