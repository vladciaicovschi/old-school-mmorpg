import * as THREE from 'three';
import { attachBiomeHaze } from './biome_haze_field';
import { GFX } from './gfx';
import { cloneMaterialWithHooks } from './material_clone_hooks';

/** Loader templates and their textures remain immutable across renderer rebuilds. */
export function cloneSettlementModels(
  sources: Readonly<Record<string, THREE.Group>>,
  ids: readonly string[],
  standard = GFX.standardMaterials,
): Record<string, THREE.Group> {
  const materials = new Map<THREE.Material, THREE.Material>();
  function material(source: THREE.Material): THREE.Material {
    const cached = materials.get(source);
    if (cached) return cached;
    const from = source as THREE.MeshStandardMaterial;
    const target = standard
      ? cloneMaterialWithHooks(source)
      : new THREE.MeshLambertMaterial({
          name: source.name,
          color: from.color?.clone() ?? new THREE.Color(0xffffff),
          map: from.map ?? null,
          alphaMap: from.alphaMap ?? null,
          alphaTest: source.alphaTest,
          opacity: source.opacity,
          transparent: source.transparent,
          side: source.side,
          depthWrite: source.depthWrite,
          vertexColors: from.vertexColors,
          emissive: from.emissive?.clone() ?? new THREE.Color(0),
          emissiveMap: from.emissiveMap ?? null,
          emissiveIntensity: from.emissiveIntensity ?? 1,
        });
    attachBiomeHaze(target);
    materials.set(source, target);
    return target;
  }
  return Object.fromEntries(
    ids.map((id) => {
      if (!sources[id]) throw new Error(`Settlement asset was not preloaded: ${id}`);
      const model = sources[id].clone(true);
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.material = Array.isArray(object.material)
          ? object.material.map(material)
          : material(object.material);
      });
      return [id, model];
    }),
  );
}
