import { Group, Object3D, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { castPalmWorldPosition } from '../src/render/characters/cast_palms';

function rig(name: string) {
  const root = new Group();
  root.position.set(4, 2, -3);
  root.rotation.y = 0.7;
  root.scale.setScalar(1.4);
  const hand = new Object3D();
  hand.name = name;
  hand.position.set(0.3, 1.1, 0.2);
  root.add(hand);
  return { root, hand, out: new Vector3() };
}
describe('displayed cast palm anchors', () => {
  it.each(['mixamorigRightHand', 'mixamorig:RightHand', 'hand_r', 'handslotr', 'handslot.r'])(
    'resolves rig convention %s using the displayed transform',
    (name) => {
      const f = rig(name);
      expect(castPalmWorldPosition(f.root, 'Right', f.out)).toBe(true);
      expect(f.out.distanceTo(f.hand.getWorldPosition(new Vector3()))).toBeLessThan(0.000001);
      expect(castPalmWorldPosition(f.root, 'Left', f.out)).toBe(false);
    },
  );
  it('caches bones, follows live palm anatomy and rejects hidden/frozen/detached joints', () => {
    const f = rig('mixamorigRightHand');
    const middle = new Object3D();
    middle.name = 'mixamorigRightHandMiddle1';
    middle.position.set(0, -0.1, 0);
    f.hand.add(middle);
    castPalmWorldPosition(f.root, 'Right', f.out);
    const lookup = vi.spyOn(f.root, 'getObjectByName');
    f.hand.rotation.x = 0.5;
    expect(castPalmWorldPosition(f.root, 'Right', f.out)).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
    expect(f.out.distanceTo(f.hand.localToWorld(new Vector3(0, -0.06, 0)))).toBeLessThan(0.000001);
    f.hand.visible = false;
    expect(castPalmWorldPosition(f.root, 'Right', f.out)).toBe(false);
    f.hand.visible = true;
    f.root.matrixWorldAutoUpdate = false;
    expect(castPalmWorldPosition(f.root, 'Right', f.out)).toBe(false);
    f.root.matrixWorldAutoUpdate = true;
    f.hand.removeFromParent();
    expect(castPalmWorldPosition(f.root, 'Right', f.out)).toBe(false);
  });
  it('does not retain a missing rig across replacement', () => {
    const f = rig('not_a_hand');
    expect(castPalmWorldPosition(f.root, 'Right', f.out)).toBe(false);
    const replacement = rig('mixamorigRightHand');
    expect(castPalmWorldPosition(replacement.root, 'Right', f.out)).toBe(true);
  });
});
