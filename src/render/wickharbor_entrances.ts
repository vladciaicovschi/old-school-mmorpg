import * as THREE from 'three';
import type { Placement } from '../sim/wickharbor_layout';

/** Keep native pack stair geometry and stretch only the tread's horizontal span. */
export function placeWickharborEntrance(
  parent: THREE.Group,
  placement: Placement,
  models: Readonly<Record<string, THREE.Group>>,
): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const pieces: [string, Placement['landing']][] = [
    ['entrance-platform', placement.landing],
    ...placement.steps.map((step): [string, Placement['landing']] => ['entrance-step', step]),
  ];
  for (const [id, rect] of pieces) {
    const source = models[id];
    const box = new THREE.Box3().setFromObject(source);
    const clone = source.clone(true);
    const sx = (rect.maxX - rect.minX) / (box.max.x - box.min.x);
    const sz = (rect.maxZ - rect.minZ) / (box.max.z - box.min.z);
    const treadY = id === 'entrance-platform' ? 0.989 : box.max.y;
    clone.scale.set(sx, 1, sz);
    clone.position.set(
      (rect.minX + rect.maxX) / 2 - ((box.min.x + box.max.x) / 2) * sx,
      rect.top - placement.grade - treadY,
      (rect.minZ + rect.maxZ) / 2 - ((box.min.z + box.max.z) / 2) * sz,
    );
    clone.name = `wickharbor:${id}`;
    parent.add(clone);
    objects.push(clone);
  }
  return objects;
}
