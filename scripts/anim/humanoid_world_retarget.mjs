// Offline parent-first world-rest transfer. Unlike local quaternion deltas,
// this supports Meshy bones whose bind axes differ from the Mixamo donor.
import { Quaternion, Vector3 } from 'three';

export function createHumanoidWorldRetargeter(donor, target, keys) {
  donor.apply(donor.rest);
  target.apply(target.rest);
  const snapshot = (rig) =>
    new Map(
      [...rig.named].map(([name, node]) => [
        name,
        {
          rotation: node.getWorldQuaternion(new Quaternion()),
          position: node.getWorldPosition(new Vector3()),
        },
      ]),
    );
  const donorRest = snapshot(donor);
  const targetRest = snapshot(target);
  const depth = (node) => {
    let count = 0;
    while (node.parent) {
      count++;
      node = node.parent;
    }
    return count;
  };
  const bones = [...target.named]
    .filter(([name]) => name.startsWith('mixamorig:') && donor.named.has(name))
    .sort((a, b) => depth(a[1]) - depth(b[1]));
  for (const name of [
    'Hips',
    'Spine',
    'Spine1',
    'Spine2',
    'LeftArm',
    'RightArm',
    'LeftForeArm',
    'RightForeArm',
    'LeftHand',
    'RightHand',
    'LeftFoot',
    'RightFoot',
  ]) {
    if (!donorRest.has(`mixamorig:${name}`) || !targetRest.has(`mixamorig:${name}`))
      throw Error(`Missing retarget bone: ${name}`);
  }
  const hip = 'mixamorig:Hips';
  const ratio = targetRest.get(hip).position.y / donorRest.get(hip).position.y;
  if (!Number.isFinite(ratio) || ratio <= 0) throw Error('Invalid retarget height ratio');
  return (pose) => {
    donor.apply(pose);
    target.apply(target.rest);
    for (const [name, node] of bones) {
      const source = donor.named.get(name);
      const world = source
        .getWorldQuaternion(new Quaternion())
        .multiply(donorRest.get(name).rotation.clone().invert())
        .multiply(targetRest.get(name).rotation);
      if (name === hip) {
        const position = targetRest.get(hip).position.clone();
        position.y +=
          (source.getWorldPosition(new Vector3()).y - donorRest.get(hip).position.y) * ratio;
        node.position.copy(node.parent.worldToLocal(position));
      }
      node.quaternion
        .copy(node.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world))
        .normalize();
      node.updateWorldMatrix(false, true);
    }
    return target.capture(keys);
  };
}
