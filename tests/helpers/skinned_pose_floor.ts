import type { Root } from '@gltf-transform/core';
import { Matrix4 } from 'three';
import type { PoseRig } from '../../scripts/anim/rig_pose.mjs';

/** CPU skinning for the single-body creature imports. Reads the current pose,
 * including inverse binds and all four normalized shipping influences. */
export function createSkinnedPoseFloor(root: Root, rig: PoseRig): () => number {
  const skins = root.listSkins();
  const meshes = root.listMeshes();
  if (skins.length !== 1 || meshes.length !== 1) {
    throw new Error('Pose floor requires one native skin and one body mesh');
  }
  const skin = skins[0];
  const inverse = skin.getInverseBindMatrices();
  if (!inverse) throw new Error('Pose floor requires inverse bind matrices');
  const inverseValues: number[] = [];
  const inverseBinds = skin.listJoints().map((joint, i) => {
    inverse.getElement(i, inverseValues);
    const object = rig.named.get(joint.getName());
    if (!object) throw new Error(`Missing pose bone: ${joint.getName()}`);
    return { object, inverse: new Matrix4().fromArray(inverseValues) };
  });
  return () => {
    const matrices = inverseBinds.map(
      ({ object, inverse }) => new Matrix4().multiplyMatrices(object.matrixWorld, inverse).elements,
    );
    let floor = Infinity;
    const position: number[] = [],
      weights: number[] = [],
      joints: number[] = [];
    for (const primitive of meshes[0].listPrimitives()) {
      const positions = primitive.getAttribute('POSITION');
      const boneWeights = primitive.getAttribute('WEIGHTS_0');
      const boneJoints = primitive.getAttribute('JOINTS_0');
      if (!positions || !boneWeights || !boneJoints) throw new Error('Unskinned native primitive');
      for (let i = 0; i < positions.getCount(); i++) {
        positions.getElement(i, position);
        boneWeights.getElement(i, weights);
        boneJoints.getElement(i, joints);
        let y = 0;
        for (let k = 0; k < 4; k++) {
          const m = matrices[joints[k]];
          y += weights[k] * (m[1] * position[0] + m[5] * position[1] + m[9] * position[2] + m[13]);
        }
        floor = Math.min(floor, y);
      }
    }
    return floor;
  };
}
