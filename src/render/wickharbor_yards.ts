import * as THREE from 'three';
import { GALE_HARBOR_DECKS, galeDeckSurfaceAt } from '../sim/gale_harbor';
import {
  WICKHARBOR_FIXED as FIXED,
  type Lot,
  localPoint,
  type Placement,
  type Rect,
  seatTerrainProp,
  type TerrainHeight,
  type TerrainProp,
} from '../sim/wickharbor_layout';
import { deckLayout, WICKHARBOR_SHARED_BENCHES, yardLayout } from '../sim/wickharbor_yard_layout';
import { WATER_LEVEL } from '../sim/world';
import { attachBiomeHaze } from './biome_haze_field';
import { GFX } from './gfx';
import { addWickharborPierDetails } from './wickharbor_pier_details';

function surfacePatch(
  lot: { x: number; z: number; rot: number },
  rect: Rect,
  height: TerrainHeight,
  color: string,
  lift = 0.045,
) {
  const vertices: number[] = [],
    indices: number[] = [],
    nx = Math.ceil((rect.maxX - rect.minX) / 0.3),
    nz = Math.ceil((rect.maxZ - rect.minZ) / 0.3);
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const p = localPoint(
        lot,
        rect.minX + ((rect.maxX - rect.minX) * i) / nx,
        rect.minZ + ((rect.maxZ - rect.minZ) * j) / nz,
      );
      vertices.push(p.x, height(p.x, p.z) + lift, p.z);
      if (i < nx && j < nz) {
        const a = j * (nx + 1) + i;
        indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    }
  const geometry = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = GFX.standardMaterials
    ? new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })
    : new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  attachBiomeHaze(material);
  return new THREE.Mesh(geometry, material);
}
export function buildWickharborYards(
  lots: readonly Lot[],
  placements: ReadonlyMap<string, Placement>,
  models: Readonly<Record<string, THREE.Group>>,
  height: TerrainHeight,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Wickharbor courtyards and native docks';
  const stats = { fencePanels: 0, plants: 0, paths: 0, deckTreads: 0, deckTiles: 0, fixtures: 0 };
  const modelBounds = (id: string) => new THREE.Box3().setFromObject(models[id]);
  const fenceBox = modelBounds('yard-fence');
  function fence(
    a: { x: number; z: number },
    b: { x: number; z: number },
    ya = height(a.x, a.z),
    yb = height(b.x, b.z),
  ) {
    const dx = b.x - a.x,
      dz = b.z - a.z,
      length = Math.hypot(dx, dz),
      yaw = Math.atan2(-dz, dx),
      roll = Math.atan2(yb - ya, length);
    const object = models['yard-fence'].clone(true),
      outer = new THREE.Group();
    outer.position.set((a.x + b.x) / 2, (ya + yb) / 2 - 0.015, (a.z + b.z) / 2);
    outer.rotation.y = yaw;
    group.add(outer);
    object.rotation.z = roll;
    object.scale.x = Math.hypot(length, yb - ya) / (fenceBox.max.x - fenceBox.min.x);
    object.position.x = (-(fenceBox.min.x + fenceBox.max.x) / 2) * object.scale.x;
    outer.add(object);
    stats.fencePanels++;
  }
  function grounded(id: string, x: number, z: number, yaw = 0) {
    const model = models[id].clone(true),
      support = models[id].userData.groundSupport as TerrainProp,
      grade = height(x, z),
      lot = { x, z, rot: yaw };
    const plan = seatTerrainProp(lot, { ...support, id: 'yard', name: id }, 0, grade, height);
    const outer = new THREE.Group();
    outer.position.set(x, grade, z);
    outer.rotation.y = yaw;
    group.add(outer);
    const anchor = new THREE.Group();
    anchor.position.fromArray(plan.pivot);
    anchor.position.y += plan.translationY;
    anchor.quaternion.fromArray(plan.quaternion);
    model.position.sub(new THREE.Vector3(...plan.pivot));
    anchor.add(model);
    outer.add(anchor);
  }
  for (const lot of lots) {
    const placement = placements.get(lot.id)!,
      yard = yardLayout(lot, placement, lots);
    for (const panel of yard.fences) fence(panel.a, panel.b);
    for (const [index, bed] of yard.beds.entries()) {
      group.add(surfacePatch(lot, bed, height, '#695c43'));
      const nx = 3,
        nz = frontRows(bed),
        asset = index % 2 ? 'yard-leek' : 'yard-carrot';
      for (let z = 0; z < nz; z++)
        for (let x = 0; x < nx; x++) {
          const p = localPoint(
              lot,
              bed.minX + ((bed.maxX - bed.minX) * (x + 0.5)) / nx,
              bed.minZ + ((bed.maxZ - bed.minZ) * (z + 0.5)) / nz,
            ),
            plant = models[asset].clone(true);
          plant.position.set(p.x, height(p.x, p.z) + 0.035, p.z);
          plant.rotation.y = lot.rot + (x + z) * 0.7;
          plant.scale.setScalar(0.65);
          group.add(plant);
          stats.plants++;
        }
    }
    for (const p of yard.logs) grounded('yard-log', p.x, p.z, lot.rot);
  }
  // Access paths and the shared yard use the game's textured terrain.
  for (const bench of WICKHARBOR_SHARED_BENCHES)
    grounded('yard-bench', bench.x, bench.z, bench.rot);
  const deckBox = modelBounds('yard-deck'),
    postBox = modelBounds('yard-post');
  for (const definition of GALE_HARBOR_DECKS) {
    const deck = {
      ...definition,
      yStart: galeDeckSurfaceAt(definition, -definition.hl, height, WATER_LEVEL),
      yEnd: galeDeckSurfaceAt(definition, definition.hl, height, WATER_LEVEL),
    };
    const outer = new THREE.Group();
    outer.position.set(deck.x, 0, deck.z);
    outer.rotation.y = deck.rot;
    group.add(outer);
    const layout = deckLayout(deck),
      acrossCount = Math.ceil((deck.hw * 2) / 1.8),
      width = (deck.hw * 2) / acrossCount;
    for (const tile of layout.tiles)
      for (let j = 0; j < acrossCount; j++) {
        const across = -deck.hw + width * (j + 0.5),
          object = models['yard-deck'].clone(true),
          box = deckBox;
        const angle = layout.stepped ? 0 : -Math.atan(tile.slope);
        const wrapper = new THREE.Group();
        wrapper.position.set(across, tile.y, tile.along);
        outer.add(wrapper);
        object.scale.set(
          width / (box.max.x - box.min.x),
          0.18 / (box.max.y - box.min.y),
          tile.length / (box.max.z - box.min.z) / Math.cos(angle),
        );
        object.position.set(
          (-(box.min.x + box.max.x) / 2) * object.scale.x,
          -deckBox.max.y * object.scale.y,
          (-(box.min.z + box.max.z) / 2) * object.scale.z,
        );
        const tilt = new THREE.Group();
        tilt.rotation.x = angle;
        wrapper.add(tilt);
        tilt.add(object);
        layout.stepped ? stats.deckTreads++ : stats.deckTiles++;
      }
    const yStart = deck.yStart,
      yEnd = deck.yEnd,
      slope = (yEnd - yStart) / (deck.hl * 2),
      angle = Math.atan(slope);
    for (const x of [-deck.hw + 0.25, deck.hw - 0.25]) {
      const beam = models['yard-post'].clone(true),
        frame = new THREE.Group();
      beam.position.y = -(postBox.min.y + postBox.max.y) / 2;
      frame.add(beam);
      frame.scale.set(
        1.2,
        Math.hypot(deck.hl * 2, yEnd - yStart) / (postBox.max.y - postBox.min.y),
        1.3,
      );
      frame.rotation.x = Math.PI / 2 - angle;
      frame.position.set(x, (yStart + yEnd) / 2 - 0.24, 0);
      outer.add(frame);
    }
    if (layout.stepped)
      for (const across of [-deck.hw + 0.06, deck.hw - 0.06]) {
        const count = Math.ceil((deck.hl * 2) / 1.8);
        for (let i = 0; i < count; i++) {
          const a = localPoint(
              { x: deck.x, z: deck.z, rot: deck.rot },
              across,
              -deck.hl + (deck.hl * 2 * i) / count,
            ),
            b = localPoint(
              { x: deck.x, z: deck.z, rot: deck.rot },
              across,
              -deck.hl + (deck.hl * 2 * (i + 1)) / count,
            );
          fence(
            a,
            b,
            yStart + ((yEnd - yStart) * i) / count,
            yStart + ((yEnd - yStart) * (i + 1)) / count,
          );
        }
      }
    // Level piers use continuous round piles supplied with their rope guards.
    // Retain native supports only beneath the stair flights.
    const postCount = Math.ceil((deck.hl * 2) / 3);
    if (layout.stepped)
      for (let i = 0; i <= postCount; i++)
        for (const across of [-deck.hw + 0.12, deck.hw - 0.12]) {
          const along = -deck.hl + (deck.hl * 2 * i) / postCount,
            p = localPoint({ x: deck.x, z: deck.z, rot: deck.rot }, across, along),
            top =
              deck.yStart + ((deck.yEnd - deck.yStart) * (along + deck.hl)) / (deck.hl * 2) - 0.14,
            base = Math.min(height(p.x, p.z) - 0.15, top - 0.3);
          const post = models['yard-post'].clone(true);
          post.scale.set(0.75, (top - base) / (postBox.max.y - postBox.min.y), 0.75);
          post.position.set(p.x, base - postBox.min.y * post.scale.y, p.z);
          post.rotation.y = deck.rot;
          group.add(post);
        }
  }
  for (const [id, fixtureId, yaw] of [
    ['fixture-well', 'well', 0],
    ['fixture-monument', 'monument', -0.4],
  ] as const) {
    const p = FIXED.find((f) => f.id === fixtureId)!;
    grounded(id, p.x, p.z, yaw);
    stats.fixtures++;
  }
  addWickharborPierDetails(group, models, height, WATER_LEVEL);
  // Partition instances into compact cells before registering distance culling.
  group.updateWorldMatrix(true, true);
  const batches = new Map<
    string,
    {
      geometry: THREE.BufferGeometry;
      material: THREE.Material | THREE.Material[];
      matrices: THREE.Matrix4[];
      cell: string;
    }
  >();
  const position = new THREE.Vector3();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    position.setFromMatrixPosition(object.matrixWorld);
    const cell = String(Math.floor(position.x / 24)) + ':' + String(Math.floor(position.z / 24));
    const materialKey = Array.isArray(object.material)
      ? object.material.map((m) => m.uuid).join(',')
      : object.material.uuid;
    const key = cell + '/' + object.geometry.uuid + '/' + materialKey;
    if (!batches.has(key))
      batches.set(key, {
        geometry: object.geometry,
        material: object.material,
        matrices: [],
        cell,
      });
    batches.get(key)!.matrices.push(object.matrixWorld.clone());
  });
  group.clear();
  const cells = new Map<string, THREE.Group>();
  for (const { geometry, material, matrices, cell } of batches.values()) {
    let bucket = cells.get(cell);
    if (!bucket) {
      bucket = new THREE.Group();
      bucket.name = 'wickharborYard:' + cell;
      cells.set(cell, bucket);
      group.add(bucket);
    }
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, i) => {
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bucket.add(mesh);
  }
  group.userData.stats = stats;
  return group;

  function frontRows(bed: Rect) {
    return Math.max(2, Math.ceil((bed.maxZ - bed.minZ) / 0.45));
  }
}
