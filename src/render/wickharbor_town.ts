import * as THREE from 'three';
import { BUILTIN_WORLD, getActiveWorldContent } from '../sim/data';
import {
  approachSurface,
  platformGeometryData,
  type Rect,
  type TerrainHeight,
  WICKHARBOR_LIGHTHOUSE,
  type WickharborLot,
  wickharborPlans,
} from '../sim/wickharbor_layout';
import { terrainHeight } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';
import { attachBiomeHaze } from './biome_haze_field';
import { GFX } from './gfx';
import { cloneMaterialWithHooks } from './material_clone_hooks';
import { freezeStaticSubtreeMatrices } from './static_matrix';
import { adaptWickharborAccess } from './wickharbor_access';
import { placeWickharborEntrance } from './wickharbor_entrances';
import { placeWickharborTerrainProps } from './wickharbor_ground_props';
import { wickharborOcclusion } from './wickharbor_occlusion';
import { buildWickharborYards } from './wickharbor_yards';

export const WICKHARBOR_MODEL_IDS = Object.freeze([
  'home',
  'home-salter',
  'home-compact',
  'home-shuttered',
  'inn',
  'lighthouse-round',
  'entrance-step',
  'entrance-platform',
  'civic-hall',
  'civic-chapel',
  'civic-market',
  'civic-office',
  'civic-warehouse',
  'civic-shipyard',
  'civic-smokehouse',
  'civic-workshop',
  'civic-beacon-store',
  'yard-fence',
  'yard-leek',
  'yard-carrot',
  'yard-log',
  'yard-bench',
  'yard-deck',
  'yard-post',
  'fixture-well',
  'fixture-mailbox',
  'fixture-noticeboard',
  'fixture-monument',
]);
const sources: Record<string, THREE.Group> = {};
export const wickharborAssetUrl = (id: string): string =>
  `/models/wickharbor/${id.replaceAll('-', '_')}.glb`;
export const wickharborPreloadInternalsForTest = {
  assetUrls: Object.freeze(WICKHARBOR_MODEL_IDS.map(wickharborAssetUrl)),
};
for (const id of WICKHARBOR_MODEL_IDS) {
  registerDeferredPreload(() =>
    loadGltf(wickharborAssetUrl(id)).then((gltf) => {
      sources[id] = gltf.scene;
    }),
  );
}

/** Source GLTF graphs and textures remain loader owned throughout renderer rebuilds. */
export function wickharborModels(
  input: Readonly<Record<string, THREE.Group>>,
  standardMaterials = GFX.standardMaterials,
): Record<string, THREE.Group> {
  const materials = new Map<THREE.Material, THREE.Material>();
  const result: Record<string, THREE.Group> = {};
  function material(source: THREE.Material): THREE.Material {
    const cached = materials.get(source);
    if (cached) return cached;
    let target: THREE.Material;
    if (standardMaterials) target = cloneMaterialWithHooks(source);
    else {
      const from = source as THREE.MeshStandardMaterial;
      target = new THREE.MeshLambertMaterial({
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
    }
    attachBiomeHaze(target);
    materials.set(source, target);
    return target;
  }
  for (const id of WICKHARBOR_MODEL_IDS) {
    if (!input[id]) throw new Error(`Wickharbor asset was not preloaded: ${id}`);
    const model = input[id].clone(true);
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.material = Array.isArray(object.material)
        ? object.material.map(material)
        : material(object.material);
    });
    result[id] = model;
  }
  adaptWickharborAccess(result);
  return result;
}

export interface WickharborTownView {
  group: THREE.Group;
  cullGroups: THREE.Group[];
  update(camera: THREE.Vector3, eye: THREE.Vector3, dt: number, reducedMotion?: boolean): void;
  dispose(): void;
}

export function buildWickharborTown(seed: number): WickharborTownView {
  const group = new THREE.Group();
  group.name = 'wickharbor-megakit';
  const cullGroups: THREE.Group[] = [];
  if (getActiveWorldContent() !== BUILTIN_WORLD)
    return { group, cullGroups, update() {}, dispose() {} };
  return assembleWickharborTown(wickharborModels(sources), (x, z) => terrainHeight(x, z, seed));
}

/** Shared assembly entry for geometry-only tests; no renderer or browser is required. */
export function assembleWickharborTown(
  models: Readonly<Record<string, THREE.Group>>,
  height: TerrainHeight,
): WickharborTownView {
  const group = new THREE.Group();
  group.name = 'wickharbor-megakit';
  const cullGroups: THREE.Group[] = [];
  let masonry: THREE.Material | undefined;
  models['entrance-platform'].traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
      if (mat.name === 'MI_UnevenBrick') masonry ??= mat;
    }
  });
  if (!masonry) throw new Error('Wickharbor native foundation masonry unavailable');
  masonry = cloneMaterialWithHooks(masonry);
  (masonry as THREE.MeshStandardMaterial).vertexColors = false;
  masonry.name = 'Wickharbor foundation masonry';

  const platform = (
    parent: THREE.Group,
    lot: WickharborLot,
    rect: Rect,
    top: number | ((x: number, z: number) => number),
    grade: number,
  ): void => {
    const data = platformGeometryData(lot, rect, top, grade, height);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, masonry);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  };
  const plans = wickharborPlans(height);
  const occlusion = wickharborOcclusion();
  for (const { lot, placement, metadata, modelId, scale } of plans) {
    const holder = new THREE.Group();
    holder.name = `wickharborBuilding:${lot.id}`;
    holder.userData.lotId = lot.id;
    holder.position.set(lot.x, placement.grade, lot.z);
    holder.rotation.y = lot.rot;
    if (!placement.openAir) {
      const top = placement.grade + (metadata.foundationTop ?? -0.12);
      platform(holder, lot, placement.body, top, placement.grade);
      for (const rect of placement.additionalFoundations) {
        platform(holder, lot, rect, top, placement.grade);
      }
      placeWickharborEntrance(holder, placement, models);
      for (const step of [placement.landing, ...placement.steps]) {
        platform(holder, lot, step, step.top - 0.06, placement.grade);
      }
      platform(
        holder,
        lot,
        placement.approach,
        approachSurface(lot, placement.approach, height),
        placement.grade,
      );
    }
    const model = new THREE.Group();
    const native = models[modelId].clone(true);
    native.scale.multiplyScalar(scale);
    model.add(native);
    model.position.z = placement.offsetZ;
    holder.add(model);
    placeWickharborTerrainProps(model, placement.terrainProps);
    if (lot.kind === 'inn') {
      for (const x of [-2.9 * scale, 2.9 * scale]) {
        platform(
          holder,
          lot,
          {
            minX: x - 0.13 * scale,
            maxX: x + 0.13 * scale,
            minZ: 5.12 * scale,
            maxZ: 5.38 * scale,
          },
          placement.grade - 0.005 * scale,
          placement.grade,
        );
      }
    }
    group.add(holder);
    cullGroups.push(holder);
    if (!placement.openAir)
      occlusion.register(model, {
        x: lot.x,
        z: lot.z,
        halfWidth: lot.w / 2,
        halfDepth: lot.d / 2,
        cosine: Math.cos(lot.rot),
        sine: Math.sin(lot.rot),
        topY: placement.grade + (lot.id === 'chapel' ? 14.3 : 11) * scale,
        cullRadius: Math.hypot(lot.w, lot.d) / 2,
      });
  }
  const lighthouse = new THREE.Group();
  const nativeLighthouse = models['lighthouse-round'].clone(true);
  nativeLighthouse.scale.multiplyScalar(WICKHARBOR_LIGHTHOUSE.scale);
  lighthouse.add(nativeLighthouse);
  lighthouse.name = 'wickharbor:old-beacon';
  lighthouse.position.set(498, height(498, 308), 308);
  group.add(lighthouse);
  cullGroups.push(lighthouse);
  occlusion.register(lighthouse, {
    x: 498,
    z: 308,
    halfWidth: 2.9 * WICKHARBOR_LIGHTHOUSE.scale,
    halfDepth: 2.9 * WICKHARBOR_LIGHTHOUSE.scale,
    cosine: 1,
    sine: 0,
    topY: height(498, 308) + 25.6 * WICKHARBOR_LIGHTHOUSE.scale,
    cullRadius: 3.7 * WICKHARBOR_LIGHTHOUSE.scale,
  });
  const yards = buildWickharborYards(
    plans.map(({ lot }) => lot),
    new Map(plans.map(({ lot, placement }) => [lot.id, placement])),
    models,
    height,
  );
  group.add(yards);
  for (const child of yards.children) {
    if (child instanceof THREE.Group) cullGroups.push(child);
  }
  if (!yards.children.some((child) => child instanceof THREE.Group)) cullGroups.push(yards);
  freezeStaticSubtreeMatrices(group);
  return { group, cullGroups, update: occlusion.update, dispose: occlusion.dispose };
}
