import type { Root } from '@gltf-transform/core';
import type { Object3D } from 'three';
import type { Pose } from './pose_blend.mjs';

export interface PoseRig {
  rest: Pose;
  named: Map<string, Object3D>;
  apply(pose: Pose): void;
  capture(keys: Iterable<string>): Pose;
  rotate(name: string, xyz: number[]): void;
  hand(side: string, destination: number[], pole: number[], wristWorld?: number[]): void;
  wristRest: Record<string, number[]>;
}
export function createPoseRig(root: Root): PoseRig;
export function retargetPose(pose: Pose, donorRest: Pose, targetRest: Pose): Pose;
