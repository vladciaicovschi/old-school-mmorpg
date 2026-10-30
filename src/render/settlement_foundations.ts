import * as THREE from 'three';
import {
  approachSurface,
  type Placement,
  platformGeometryData,
  type Rect,
  type TerrainHeight,
  type WickharborLot,
} from '../sim/wickharbor_layout';
import { cloneMaterialWithHooks } from './material_clone_hooks';
import { placeWickharborEntrance } from './wickharbor_entrances';

/** Native rubble texture and stairs, with only the terrain-facing skirt adapted. */
export function settlementFoundationBuilder(
  models: Readonly<Record<string, THREE.Group>>,
  aliases: Readonly<Record<string, string>>,
  height: TerrainHeight,
) {
  const entrance = {
    'entrance-step': models[aliases['entrance-step']],
    'entrance-platform': models[aliases['entrance-platform']],
  };
  let source: THREE.Material | undefined;
  entrance['entrance-platform']?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.name === 'MI_UnevenBrick') source ??= material;
    }
  });
  if (!source) throw new Error('Settlement native foundation masonry unavailable');
  const masonry = cloneMaterialWithHooks(source);
  (masonry as THREE.MeshStandardMaterial).vertexColors = false;
  function platform(
    parent: THREE.Group,
    lot: WickharborLot,
    rect: Rect,
    top: number | TerrainHeight,
    grade: number,
  ): void {
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
  }
  function entranceSteps(parent: THREE.Group, lot: WickharborLot, placement: Placement): void {
    placeWickharborEntrance(parent, placement, entrance);
    for (const step of [placement.landing, ...placement.steps]) {
      platform(parent, lot, step, step.top - 0.06, placement.grade);
    }
    platform(
      parent,
      lot,
      placement.approach,
      approachSurface(lot, placement.approach, height),
      placement.grade,
    );
  }
  return { platform, entranceSteps };
}
