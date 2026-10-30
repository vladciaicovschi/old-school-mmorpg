import * as THREE from 'three';
import { type SettlementMetadata, settlementBelfryOpenings } from '../sim/settlements_layout';

/** The belfry exit uses the same enlarged head opening as movement collision. */
export function adaptSettlementChapelAccess(
  chapel: THREE.Group,
  metadata: SettlementMetadata,
  deck: THREE.Group,
  fence: THREE.Group,
): void {
  const tower = metadata.bellTower;
  if (!tower) return;
  const centerZ = tower.centerZ;
  const removed: THREE.Object3D[] = [];
  chapel.traverse((object) => {
    if (['tower-platform', 'tower-rail'].includes(object.userData.civicRole)) removed.push(object);
  });
  for (const object of removed) object.removeFromParent();
  const halfX = tower.width / 2,
    halfZ = tower.depth / 2;
  const holes = settlementBelfryOpenings(metadata);
  function native(
    template: THREE.Group,
    x: number,
    y: number,
    z: number,
    width: number,
    thickness: number,
    depth: number,
    role: string,
    yaw = 0,
  ): void {
    const bounds = new THREE.Box3().setFromObject(template);
    const model = template.clone(true);
    model.scale.set(
      width / (bounds.max.x - bounds.min.x),
      thickness / (bounds.max.y - bounds.min.y),
      depth / (bounds.max.z - bounds.min.z),
    );
    model.position.set(
      -((bounds.min.x + bounds.max.x) / 2) * model.scale.x,
      -((bounds.min.y + bounds.max.y) / 2) * model.scale.y,
      -((bounds.min.z + bounds.max.z) / 2) * model.scale.z,
    );
    const root = new THREE.Group();
    root.userData.civicRole = role;
    root.position.set(x, y, centerZ + z);
    root.rotation.y = yaw;
    root.add(model);
    chapel.add(root);
  }
  const xs = [...new Set([-halfX, halfX, ...holes.flatMap((r) => [r.minX, r.maxX])])].sort(
    (a, b) => a - b,
  );
  const zs = [...new Set([-halfZ, halfZ, ...holes.flatMap((r) => [r.minZ, r.maxZ])])].sort(
    (a, b) => a - b,
  );
  for (let i = 1; i < xs.length; i++)
    for (let j = 1; j < zs.length; j++) {
      const x = (xs[i - 1] + xs[i]) / 2,
        z = (zs[j - 1] + zs[j]) / 2;
      if (holes.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ)) continue;
      native(
        deck,
        x,
        tower.platformY - 0.04,
        z,
        xs[i] - xs[i - 1],
        0.08,
        zs[j] - zs[j - 1],
        'tower-platform',
      );
    }
  // The tower's stone arches already guard its outside. Native timber rails
  // protect the widened stair opening, leaving the final flight's exit open.
  const guard = holes[1];
  if (guard) {
    native(
      fence,
      guard.maxX + 0.065,
      tower.platformY + 0.5,
      (guard.minZ + guard.maxZ) / 2,
      guard.maxZ - guard.minZ,
      1,
      0.13,
      'tower-rail',
      Math.PI / 2,
    );
    native(
      fence,
      (guard.minX + guard.maxX) / 2,
      tower.platformY + 0.5,
      guard.maxZ + 0.065,
      guard.maxX - guard.minX,
      1,
      0.13,
      'tower-rail',
    );
  }
}
