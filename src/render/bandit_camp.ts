import * as THREE from 'three';
import { banditCampPlacement } from '../sim/bandit_camp_placement';
import type { SettlementItem } from '../sim/settlements_layout';
import type { TerrainHeight } from '../sim/wickharbor_layout';
import { cloneMaterialWithHooks } from './material_clone_hooks';

/** Whole native models, posed rigidly. Never change loader-owned materials. */
export function buildBanditCampItem(
  item: SettlementItem,
  template: THREE.Group,
  height: TerrainHeight,
) {
  const frame = banditCampPlacement(item, height),
    holder = new THREE.Group();
  holder.name = `settlementItem:gorrak-camp:${item.id}`;
  holder.userData.itemId = item.id;
  holder.position.fromArray(frame.origin);
  holder.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...frame.right),
      new THREE.Vector3(...frame.up),
      new THREE.Vector3(...frame.forward),
    ),
  );
  const model = template.clone(true);
  model.scale.setScalar(frame.scale);
  model.position.y = -frame.minY * frame.scale;
  if (item.kind === 'tent') {
    // The cutaway partitions the complete mesh at load time, without deleting
    // source geometry or making every wall transparent when the player enters.
    model.userData.footprint = { width: item.modelId.endsWith('pavilion') ? 12 : 10, depth: 10 };
    model.userData.facades = [{ level: 0 }];
    model.userData.storeyHeight = item.modelId.endsWith('pavilion') ? 5 : 4;
    if (item.modelId.endsWith('pavilion')) model.userData.role = 'circular-shell';
    const materials = new Map<THREE.Material, THREE.Material>();
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const tint = (source: THREE.Material) => {
        let material = materials.get(source);
        if (!material) {
          material = cloneMaterialWithHooks(source);
          if ('color' in material)
            (material as THREE.MeshStandardMaterial).color.multiply(
              new THREE.Color(item.tint ?? '#ffffff'),
            );
          materials.set(source, material);
        }
        return material;
      };
      o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
    });
  }
  holder.add(model);
  return holder;
}
