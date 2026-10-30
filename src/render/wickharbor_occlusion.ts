import * as THREE from 'three';
import {
  type EastbrookRoofVisibilityTarget,
  eastbrookCameraSegmentHitsRoof,
} from './eastbrook_town_visibility_core';
import { cloneMaterialWithHooks } from './material_clone_hooks';
import {
  advanceOccluderFade,
  type OccluderFadeMat,
  occluderFadeRecordFor,
  prefetchOccluderFadeWithin,
} from './occluder_fade';
import { OCCLUDER_FADE_PREFETCH_YD } from './occluder_fade_core';

const KEEP_VISIBLE = new Set([
  'interior',
  'floor',
  'tower-stair',
  'tower-platform',
  'tower-landing',
  'furniture',
  'bell',
  'spiral-tread',
  'spiral-rail',
  'lighthouse-floor',
  'gallery-deck',
  'stairwell-guard',
  'beacon-lamp',
]);
function exterior(object: THREE.Object3D, root: THREE.Object3D): boolean {
  let parent: THREE.Object3D | null = object;
  while (parent) {
    const data = parent.userData;
    if (
      data.terrainProp ||
      KEEP_VISIBLE.has(data.innSection) ||
      KEEP_VISIBLE.has(data.civicRole) ||
      KEEP_VISIBLE.has(data.role)
    )
      return false;
    if (parent === root) break;
    parent = parent.parent;
  }
  return true;
}
export function wickharborOcclusion() {
  const targets: {
    footprint: EastbrookRoofVisibilityTarget;
    mats: OccluderFadeMat[];
    alpha: number;
  }[] = [];
  return {
    register(root: THREE.Group, footprint: EastbrookRoofVisibilityTarget): void {
      const clones = new Map<THREE.Material, THREE.Material>(),
        mats: OccluderFadeMat[] = [];
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !exterior(object, root)) return;
        const clone = (source: THREE.Material) => {
          let material = clones.get(source);
          if (!material) {
            material = cloneMaterialWithHooks(source);
            clones.set(source, material);
          }
          occluderFadeRecordFor(mats, material, object);
          return material;
        };
        object.material = Array.isArray(object.material)
          ? object.material.map(clone)
          : clone(object.material);
      });
      targets.push({ footprint, mats, alpha: 1 });
    },
    update(camera: THREE.Vector3, eye: THREE.Vector3, dt: number, reducedMotion = false): void {
      for (const target of targets) {
        const f = target.footprint;
        if (
          Math.hypot(camera.x - f.x, camera.z - f.z) > OCCLUDER_FADE_PREFETCH_YD + f.cullRadius &&
          target.alpha === 1
        )
          continue;
        prefetchOccluderFadeWithin(target.mats, f.x, f.z, camera.x, camera.z);
        const hidden = eastbrookCameraSegmentHitsRoof(
          f,
          eye.x,
          eye.y,
          eye.z,
          camera.x,
          camera.y,
          camera.z,
        );
        target.alpha = advanceOccluderFade(target.mats, target.alpha, hidden, dt, reducedMotion);
      }
    },
  };
}
