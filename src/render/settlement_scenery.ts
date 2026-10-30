import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  type Settlement,
  type SettlementItem,
  settlementItemPlacement,
} from '../sim/settlements_layout';
import { localPoint, type TerrainHeight } from '../sim/wickharbor_layout';
import { attachBiomeHaze } from './biome_haze_field';
import { surfaceMat } from './gfx';
import { cloneMaterialWithHooks } from './material_clone_hooks';

export interface SettlementScenery {
  roots: THREE.Group[];
  monument?: { holder: THREE.Group; item: SettlementItem };
}

/** Adapt only native post bottoms, preserving the level roof and authored UVs. */
export function fitSettlementTimber(
  template: THREE.Group,
  item: { x: number; z: number; rot: number; scale: number[] },
  height: TerrainHeight,
  grade: number,
  followAll = false,
): THREE.Group {
  template.updateMatrixWorld(true);
  const root = new THREE.Group();
  const point = new THREE.Vector3();
  template.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry.clone();
    const positions = geometry.getAttribute('position');
    const values = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      if (followAll || point.y < 0.08) {
        const world = localPoint(item, point.x * item.scale[0], point.z * item.scale[2]);
        const ground = (height(world.x, world.z) - grade - 0.008) / item.scale[1];
        point.y = followAll ? point.y + ground : ground;
      }
      values.set([point.x, point.y, point.z], i * 3);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, object.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  });
  return root;
}

/** Repeated scenery shares geometry and draws in compact spatial instance cells. */
export function instanceSettlementScenery(objects: THREE.Group[]): THREE.Group[] {
  const cells = new Map<string, THREE.Group>();
  const batches = new Map<string, { parent: THREE.Group; meshes: THREE.Mesh[] }>();
  for (const root of objects) {
    root.updateMatrixWorld(true);
    const cell = `${Math.floor(root.position.x / 12)}:${Math.floor(root.position.z / 12)}`;
    let parent = cells.get(cell);
    if (!parent) {
      parent = new THREE.Group();
      parent.name = `settlementScenery:${cell}`;
      parent.userData.itemIds = [];
      cells.set(cell, parent);
    }
    parent.userData.itemIds.push(root.userData.itemId);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      const key = `${cell}:${object.geometry.uuid}:${mats.map((m) => m.uuid).join(',')}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = { parent, meshes: [] };
        batches.set(key, batch);
      }
      batch.meshes.push(object);
    });
  }
  for (const { parent, meshes } of batches.values()) {
    const source = meshes[0];
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, meshes.length);
    meshes.forEach((object, i) => {
      mesh.setMatrixAt(i, object.matrixWorld);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
  return [...cells.values()];
}

export function buildSettlementScenery(
  settlement: Settlement,
  models: Readonly<Record<string, THREE.Group>>,
  height: TerrainHeight,
): SettlementScenery {
  const result: SettlementScenery = { roots: [] };
  const objects: THREE.Group[] = [];
  const ambient = settlement as Settlement & { trees?: SettlementItem[]; lamps?: SettlementItem[] };
  for (const item of [
    ...settlement.dressing,
    ...settlement.landmarks,
    ...(ambient.trees ?? []),
    ...(ambient.lamps ?? []),
  ]) {
    // These interactable objects are already painted by their entity views.
    if (item.id === 'mailbox' || item.id === 'noticeboard') continue;
    const plan = settlementItemPlacement(item, height);
    const holder = new THREE.Group();
    holder.name = `settlementItem:${settlement.id}:${item.id}`;
    holder.userData.itemId = item.id;
    holder.position.set(item.x, plan.grade, item.z);
    holder.rotation.y = item.rot ?? 0;
    const fittedFeet = item.terrainFeet;
    const vertical =
      item.id === 'monument' ||
      item.kind === 'monument' ||
      item.kind === 'tree' ||
      item.kind === 'lamp';
    const template = models[item.modelId];
    const model = fittedFeet
      ? fitSettlementTimber(
          template,
          { ...item, rot: item.rot ?? 0, scale: plan.scale },
          height,
          plan.grade,
        )
      : template.clone(true);
    model.scale.fromArray(plan.scale);
    if (fittedFeet || vertical) {
      if (vertical) {
        // Tall statues, trees and lantern standards stay plumb. Seat the
        // lowest source point slightly below the local ground surface.
        const bounds = new THREE.Box3().setFromObject(model);
        model.position.y = -bounds.min.y - 0.008;
      }
      holder.add(model);
    } else {
      const { pivot, quaternion, translationY } = plan.seating;
      const anchor = new THREE.Group();
      anchor.position.fromArray(pivot);
      anchor.position.y += translationY;
      anchor.quaternion.fromArray(quaternion);
      model.position.fromArray(pivot.map((v) => -v));
      anchor.add(model);
      holder.add(anchor);
    }
    if (item.id === 'monument' || item.kind === 'monument') {
      result.roots.push(holder);
      result.monument = { holder, item };
    } else objects.push(holder);
  }
  result.roots.push(...instanceSettlementScenery(objects));
  return result;
}

export function settlementStreetSurfaces(
  settlement: Settlement,
  height: TerrainHeight,
): THREE.Group | null {
  const extra = settlement as Settlement & {
    paths?: { width: number; points: number[][] }[];
    plazas?: { x: number; z: number; w: number; d: number }[];
  };
  const geometries: THREE.BufferGeometry[] = [];
  for (const road of [...settlement.roads, ...(extra.paths ?? [])]) {
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let j = 1; j < road.points.length; j++) {
      const a = road.points[j - 1],
        b = road.points[j];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.001) continue;
      const count = Math.ceil(length / 0.4);
      const nx = -(b[1] - a[1]) / length,
        nz = (b[0] - a[0]) / length;
      for (let i = 0; i < count; i++) {
        const first = vertices.length / 3;
        for (const [t, sign] of [
          [i / count, -1],
          [i / count, 1],
          [(i + 1) / count, 1],
          [(i + 1) / count, -1],
        ]) {
          const x = a[0] + (b[0] - a[0]) * t + ((nx * road.width) / 2) * sign;
          const z = a[1] + (b[1] - a[1]) * t + ((nz * road.width) / 2) * sign;
          vertices.push(x, height(x, z) + 0.035, z);
        }
        indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
      }
    }
    if (!vertices.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometries.push(geometry);
  }
  for (const plaza of extra.plazas ?? []) {
    const geometry = new THREE.PlaneGeometry(
      plaza.w,
      plaza.d,
      Math.ceil(plaza.w * 2),
      Math.ceil(plaza.d * 2),
    );
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(plaza.x, 0, plaza.z);
    geometry.deleteAttribute('uv');
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++)
      position.setY(i, height(position.getX(i), position.getZ(i)) + 0.025);
    geometry.computeVertexNormals();
    geometries.push(geometry);
  }
  if (!geometries.length) return null;
  const merged = mergeGeometries(geometries);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) throw new Error('Settlement road geometry could not be merged');
  const material = cloneMaterialWithHooks(
    surfaceMat({
      color: settlement.id === 'icemantle' ? 0xa39b87 : 0x9e9788,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  attachBiomeHaze(material);
  const mesh = new THREE.Mesh(merged, material);
  mesh.receiveShadow = true;
  const root = new THREE.Group();
  root.name = `settlementStreets:${settlement.id}`;
  root.add(mesh);
  return root;
}
