import * as THREE from 'three';
import { loadKtx2Texture } from './assets/loader';
import { cloneMaterialWithHooks } from './material_clone_hooks';

interface Binding {
  material: string;
  slots: Partial<
    Record<'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'emissiveMap', string>
  >;
  normalScale: number;
  aoMapIntensity: number;
}

/** Geometry templates stay loader-owned; shared atlases ride the existing texture cache. */
export async function prepareSettlementTextures(
  source: THREE.Group,
  load: (url: string) => Promise<THREE.Texture> = (url) => loadKtx2Texture(url, { repeat: true }),
): Promise<THREE.Group> {
  const bindings = source.userData.settlementTextureBindings as Binding[] | undefined;
  if (!bindings?.length) return source;
  const urls = [...new Set(bindings.flatMap((binding) => Object.values(binding.slots)))];
  const textures = new Map(
    await Promise.all(urls.map(async (url) => [url, await load(url)] as const)),
  );
  const byName = new Map(bindings.map((binding) => [binding.material, binding]));
  const materials = new Map<THREE.Material, THREE.Material>();
  const template = source.clone(true);
  function material(original: THREE.Material): THREE.Material {
    const cached = materials.get(original);
    if (cached) return cached;
    const binding = byName.get(original.name);
    if (!binding) return original;
    const clone = cloneMaterialWithHooks(original) as THREE.MeshStandardMaterial;
    for (const [slot, url] of Object.entries(binding.slots)) {
      clone[slot as keyof Binding['slots']] = textures.get(url)!;
    }
    // GLTFLoader flips Y for derivative tangents. Restore the authored strength
    // without discarding that per-material tangent convention.
    clone.normalScale.set(
      Math.sign(clone.normalScale.x) * binding.normalScale,
      Math.sign(clone.normalScale.y) * binding.normalScale,
    );
    clone.aoMapIntensity = binding.aoMapIntensity;
    materials.set(original, clone);
    return clone;
  }
  template.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(material)
      : material(object.material);
  });
  return template;
}
