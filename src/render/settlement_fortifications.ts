import * as THREE from 'three';
import {
  SETTLEMENT_MODELS,
  type Settlement,
  settlementDeckPlacement,
  settlementFortificationGrade,
} from '../sim/settlements_layout';
import type { Rect, TerrainHeight } from '../sim/wickharbor_layout';
import { fitSettlementTimber, instanceSettlementScenery } from './settlement_scenery';

interface FencePiece {
  id: string;
  modelId: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  scale: number[];
  shiftY: number;
  terrainMode?: string;
}
interface DeckPiece {
  id: string;
  modelId: string;
  x: number;
  z: number;
  y: number;
  rot?: number;
  pitch?: number;
  scale: number[];
  top?: number;
}
interface PilePiece {
  modelId: string;
  x: number;
  z: number;
  bottom: number;
  scaleY: number;
}

export function buildSettlementFortifications(
  settlement: Settlement,
  models: Readonly<Record<string, THREE.Group>>,
  height: TerrainHeight,
): THREE.Group[] {
  const roots: THREE.Group[] = [];
  for (const source of settlement.fortifications) {
    const item = source as typeof source & { foundationRects?: Rect[]; terrainMode?: string };
    const lot = { ...item, rot: item.rot ?? 0 };
    const grade = settlementFortificationGrade(item, height);
    const root = new THREE.Group();
    root.name = `settlementFort:${settlement.id}:${item.id}`;
    root.userData.itemId = item.id;
    root.position.set(item.x, grade, item.z);
    root.rotation.y = lot.rot;
    const mode =
      item.terrainMode ??
      (SETTLEMENT_MODELS[item.modelId].metadata as { terrainMode?: string }).terrainMode;
    root.add(
      fitSettlementTimber(
        models[item.modelId],
        { ...lot, scale: [1, 1, 1] },
        height,
        grade,
        mode === 'follow-ground-all-vertices',
      ),
    );
    roots.push(root);
  }
  const dressing = settlement.siteDressing as
    | {
        fences?: FencePiece[];
        decks?: DeckPiece[];
        piles?: PilePiece[];
      }
    | undefined;
  const objects: THREE.Group[] = [];
  for (const item of dressing?.fences ?? []) {
    const grade = height(item.x, item.z);
    const root = new THREE.Group();
    root.userData.itemId = item.id;
    root.position.set(item.x, grade, item.z);
    root.rotation.y = item.yaw;
    const model = fitSettlementTimber(
      models[item.modelId],
      {
        ...item,
        rot: item.yaw,
      },
      height,
      grade,
      item.terrainMode === 'follow-ground-all-vertices',
    );
    model.scale.fromArray(item.scale);
    // Palisade posts fit the sampled grade individually. Only rigid rail
    // fences retain the authored slope; applying both would double the tilt.
    if (!item.terrainMode) {
      model.rotation.z = item.pitch;
      model.position.y = item.shiftY;
    }
    root.add(model);
    objects.push(root);
  }
  for (const item of settlement.id === 'eastbrook' ? [] : (dressing?.decks ?? [])) {
    const root = new THREE.Group();
    root.userData.itemId = 'boardwalk';
    const plan = settlementDeckPlacement(item, height);
    root.position.set(item.x, plan.top, item.z);
    root.rotation.y = plan.rot;
    const template = models[item.modelId];
    template.updateMatrixWorld(true);
    const point = new THREE.Vector3();
    template.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry.clone();
      const position = geometry.getAttribute('position');
      const points = new Float32Array(position.count * 3);
      const nativeTop = SETTLEMENT_MODELS[item.modelId].bounds.max[1];
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
        const x = point.x * item.scale[0] * Math.cos(item.pitch ?? 0),
          z = point.z * item.scale[2];
        points.set([x, (point.y - nativeTop) * item.scale[1] + x * plan.slope, z], i * 3);
      }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, object.material);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
    });
    objects.push(root);
  }
  for (const item of settlement.id === 'eastbrook' ? [] : (dressing?.piles ?? [])) {
    const root = new THREE.Group();
    root.userData.itemId = 'dock-pile';
    const model = models[item.modelId].clone(true);
    const closest = (dressing?.decks ?? []).reduce<DeckPiece | undefined>(
      (best, deck) =>
        !best ||
        Math.hypot(deck.x - item.x, deck.z - item.z) < Math.hypot(best.x - item.x, best.z - item.z)
          ? deck
          : best,
      undefined,
    );
    const top = closest
      ? settlementDeckPlacement(closest, height).top
      : item.bottom + SETTLEMENT_MODELS[item.modelId].bounds.max[1] * item.scaleY;
    const bottom = height(item.x, item.z) - 0.2;
    model.position.set(item.x, bottom, item.z);
    const bounds = SETTLEMENT_MODELS[item.modelId].bounds;
    model.scale.y = Math.max(0.1, (top - bottom) / (bounds.max[1] - bounds.min[1]));
    root.add(model);
    objects.push(root);
  }
  return [...roots, ...instanceSettlementScenery(objects)];
}
