// Offline-only low-ready correction: level the weapon without borrowing the
// rifle's shoulder, head or torso aim. Move both palms as one rigid grip first,
// then solve each native arm with its own existing elbow pole.
import { Quaternion, Vector3 } from 'three';

export function createHunterHipFirePose(rig, keys, carry, aim) {
  rig.apply(aim);
  const aimedWrist = rig.named.get('mixamorig:RightHand').getWorldQuaternion(new Quaternion());
  rig.apply(carry);
  const snapshot = (side) => ({
    position: rig.named.get(`mixamorig:${side}Hand`).getWorldPosition(new Vector3()),
    elbow: rig.named.get(`mixamorig:${side}ForeArm`).getWorldPosition(new Vector3()),
    rotation: rig.named.get(`mixamorig:${side}Hand`).getWorldQuaternion(new Quaternion()),
  });
  const hands = { Left: snapshot('Left'), Right: snapshot('Right') };
  const pivot = hands.Right.position;
  const turn = aimedWrist.multiply(hands.Right.rotation.clone().invert());
  const lift = new Vector3(0, 0.07, 0);
  for (const side of ['Left', 'Right']) {
    const hand = hands[side];
    const position = hand.position.clone().sub(pivot).applyQuaternion(turn).add(pivot).add(lift);
    const wrist = turn.clone().multiply(hand.rotation);
    rig.hand(side, position.toArray(), hand.elbow.toArray(), wrist.toArray());
  }
  return rig.capture(keys);
}
