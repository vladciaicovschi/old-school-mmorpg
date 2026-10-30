// Selective atlas palettes reuse the outfit dye shader, including on low tier.
// Only materials change. Geometry, UVs, maps and animation data stay shared.
import type * as THREE from 'three';
import { cloneMaterialWithHooks } from '../material_clone_hooks';
import { type ArmorDyeSpec, attachArmorDye } from './armor_dye';

const variants = new WeakMap<THREE.Material, WeakMap<ArmorDyeSpec, THREE.Material>>();

export function applyAtlasDye(root: THREE.Object3D, spec: ArmorDyeSpec): void {
  const dyed = (source: THREE.Material): THREE.Material => {
    let bySpec = variants.get(source);
    if (!bySpec) {
      bySpec = new WeakMap();
      variants.set(source, bySpec);
    }
    let material = bySpec.get(spec);
    if (!material) {
      material = cloneMaterialWithHooks(source);
      material.userData.selectiveAtlasDye = true;
      attachArmorDye(material, spec);
      bySpec.set(spec, material);
    }
    return material;
  };
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData.bodyMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(dyed) : dyed(mesh.material);
  });
}
