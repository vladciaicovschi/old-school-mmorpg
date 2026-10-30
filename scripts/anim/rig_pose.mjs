// Offline IK on the target's own hierarchy. No runtime IK or foreign bind pose.
import { Object3D, Quaternion, Vector3 } from 'three';

export function createPoseRig(root) {
  const objects = new Map();
  const rest = new Map();
  const scene = new Object3D();
  for (const node of root.listNodes()) {
    const object = new Object3D();
    object.name = node.getName();
    object.position.fromArray(node.getTranslation());
    object.quaternion.fromArray(node.getRotation());
    object.scale.fromArray(node.getScale());
    objects.set(node, object);
    for (const path of ['rotation', 'translation', 'scale']) {
      rest.set(`${node.getName()}|${path}`, [
        ...node[`get${path[0].toUpperCase()}${path.slice(1)}`](),
      ]);
    }
  }
  for (const [node, object] of objects) {
    (objects.get(node.getParentNode()) ?? scene).add(object);
  }
  const named = new Map([...objects.values()].map((object) => [object.name, object]));
  const property = { rotation: 'quaternion', translation: 'position', scale: 'scale' };
  function apply(pose) {
    for (const [key, value] of rest) {
      const [name, path] = key.split('|');
      named.get(name)[property[path]].fromArray(pose.get(key) ?? value);
    }
    scene.updateMatrixWorld(true);
  }
  function capture(keys) {
    return new Map(
      [...keys].map((key) => {
        const [name, path] = key.split('|');
        return [key, named.get(name)[property[path]].toArray()];
      }),
    );
  }
  function rotate(name, xyz) {
    const node = named.get(name);
    for (let i = 0; i < 3; i++) {
      node.quaternion.multiply(
        new Quaternion().setFromAxisAngle(new Vector3().setComponent(i, 1), xyz[i]),
      );
    }
    scene.updateMatrixWorld(true);
  }
  function aim(bone, child, destination) {
    const origin = bone.getWorldPosition(new Vector3());
    const current = child.getWorldPosition(new Vector3()).sub(origin).normalize();
    const desired = destination.clone().sub(origin).normalize();
    const world = bone.getWorldQuaternion(new Quaternion());
    world.premultiply(new Quaternion().setFromUnitVectors(current, desired));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world));
    scene.updateMatrixWorld(true);
  }
  function hand(side, destination, pole, wristWorld) {
    const upper = named.get(`mixamorig:${side}Arm`);
    const fore = named.get(`mixamorig:${side}ForeArm`);
    const handNode = named.get(`mixamorig:${side}Hand`);
    const start = upper.getWorldPosition(new Vector3());
    const elbow = fore.getWorldPosition(new Vector3());
    const end = handNode.getWorldPosition(new Vector3());
    const a = start.distanceTo(elbow);
    const b = elbow.distanceTo(end);
    const target = new Vector3().fromArray(destination);
    const direction = target.clone().sub(start).normalize();
    const distance = Math.min(
      a + b - 0.005,
      Math.max(Math.abs(a - b) + 0.005, start.distanceTo(target)),
    );
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const normal = new Vector3().fromArray(pole).sub(start);
    normal.addScaledVector(direction, -normal.dot(direction)).normalize();
    const desiredElbow = start
      .clone()
      .addScaledVector(direction, along)
      .addScaledVector(normal, Math.sqrt(Math.max(0, a * a - along * along)));
    aim(upper, fore, desiredElbow);
    aim(fore, handNode, start.clone().addScaledVector(direction, distance));
    if (wristWorld) {
      handNode.quaternion.copy(
        handNode.parent
          .getWorldQuaternion(new Quaternion())
          .invert()
          .multiply(new Quaternion().fromArray(wristWorld)),
      );
      scene.updateMatrixWorld(true);
    }
  }
  apply(rest);
  const wristRest = Object.fromEntries(
    ['Left', 'Right']
      .filter((side) => named.has(`mixamorig:${side}Hand`))
      .map((side) => [
        side,
        named.get(`mixamorig:${side}Hand`).getWorldQuaternion(new Quaternion()).toArray(),
      ]),
  );
  return { rest, named, apply, capture, rotate, hand, wristRest };
}

/** Transfer matching Mixamo bone deltas, preserving the target's bind lengths. */
export function retargetPose(pose, donorRest, targetRest) {
  const result = new Map();
  for (const [key, value] of pose) {
    const source = donorRest.get(key);
    const target = targetRest.get(key);
    if (!source || !target) continue;
    if (key.endsWith('|rotation')) {
      result.set(
        key,
        new Quaternion()
          .fromArray(target)
          .multiply(new Quaternion().fromArray(source).invert())
          .multiply(new Quaternion().fromArray(value).normalize())
          .normalize()
          .toArray(),
      );
    } else if (key.endsWith('|translation')) {
      const scale =
        targetRest.get('mixamorig:Hips|translation')[1] /
        donorRest.get('mixamorig:Hips|translation')[1];
      result.set(
        key,
        target.map((v, i) => v + (value[i] - source[i]) * scale),
      );
    } else result.set(key, [...target]);
  }
  return result;
}
