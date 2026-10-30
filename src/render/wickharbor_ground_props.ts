import * as THREE from 'three';
import type { Placement } from '../sim/wickharbor_layout';

/** All material batches and tabletop contents move with the item's shared anchor. */
export function placeWickharborTerrainProps(
  model: THREE.Group,
  plans: Placement['terrainProps'],
): void {
  const parts: THREE.Object3D[] = [];
  model.traverse((object) => {
    if (object.userData.terrainProp) parts.push(object);
  });
  for (const prop of plans) {
    const anchor = new THREE.Group();
    anchor.name = `grounded:${prop.name}`;
    anchor.position.set(prop.pivot[0], prop.pivot[1], prop.pivot[2]);
    model.add(anchor);
    for (const part of parts) {
      if (part.userData.terrainProp === prop.id) anchor.attach(part);
    }
    anchor.quaternion.set(...(prop.quaternion as [number, number, number, number]));
    anchor.position.y += prop.translationY;
  }
}
