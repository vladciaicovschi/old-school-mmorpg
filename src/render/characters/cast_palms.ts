// Shared anatomical anchors for cast preparation and magic auto launch.
// Bone references expire with the visual root; no retained entity IDs/resources.
import { type Object3D, Vector3 } from 'three';

const cache = new WeakMap<
  Object3D,
  readonly { hand: Object3D | null; middle: Object3D | null }[]
>();
const knuckle = new Vector3();

function visibleChain(node: Object3D, root: Object3D): boolean {
  let belongs = false;
  for (let parent: Object3D | null = node; parent; parent = parent.parent) {
    if (!parent.visible || !parent.matrixWorldAutoUpdate) return false;
    if (parent === root) belongs = true;
  }
  return belongs;
}

/** Writes the current displayed palm into caller-owned storage. Hidden/frozen
 * rigs and non-humanoid forms fail soft to the existing body-anchor fallback. */
export function castPalmWorldPosition(
  root: Object3D,
  side: 'Left' | 'Right',
  out: Vector3,
): boolean {
  let pair = cache.get(root);
  if (!pair) {
    pair = ['Left', 'Right'].map((s) => {
      const short = s === 'Left' ? 'l' : 'r';
      return {
        hand:
          root.getObjectByName(`mixamorig${s}Hand`) ??
          root.getObjectByName(`mixamorig:${s}Hand`) ??
          root.getObjectByName(`hand_${short}`) ??
          root.getObjectByName(`handslot${short}`) ??
          root.getObjectByName(`handslot.${short}`) ??
          null,
        middle:
          root.getObjectByName(`mixamorig${s}HandMiddle1`) ??
          root.getObjectByName(`mixamorig:${s}HandMiddle1`) ??
          null,
      };
    });
    cache.set(root, pair);
  }
  const { hand, middle } = pair[side === 'Left' ? 0 : 1];
  if (!hand || !visibleChain(hand, root)) return false;
  hand.getWorldPosition(out);
  if (middle && visibleChain(middle, hand)) out.lerp(middle.getWorldPosition(knuckle), 0.6);
  return true;
}
