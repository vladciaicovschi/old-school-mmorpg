import * as THREE from 'three';
import { BUILTIN_WORLD, getActiveWorldContent } from '../sim/data';
import {
  SETTLEMENT_MODELS,
  SETTLEMENTS,
  type Settlement,
  settlementPlans,
} from '../sim/settlements_layout';
import type { TerrainHeight } from '../sim/wickharbor_layout';
import { terrainHeight } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';
import { buildEastbrookHarbor } from './eastbrook_harbor';
import {
  buildRealmBuilderMonumentFx,
  type RealmBuilderMonumentFx,
} from './realm_builder_monument_fx';
import type { RevealGateCore } from './reveal_gate_core';
import { adaptSettlementChapelAccess } from './settlement_chapel_access';
import { buildSettlementFortifications } from './settlement_fortifications';
import { settlementFoundationBuilder } from './settlement_foundations';
import { adaptSettlementInnDoor } from './settlement_inn_access';
import { cloneSettlementModels } from './settlement_materials';
import { buildSettlementScenery } from './settlement_scenery';
import { prepareSettlementTextures } from './settlement_textures';
import {
  newTownPiecewiseReveal,
  orderTownRootsNearestFirst,
  townPiecewiseRevealInto,
  townRootVisible,
  townStaticReveal,
} from './town_reveal_core';
import { placeWickharborTerrainProps } from './wickharbor_ground_props';
import { wickharborOcclusion } from './wickharbor_occlusion';
import {
  type FeatureFootprint,
  isZoneFeatureShadowCasting,
  isZoneFeatureVisible,
} from './zone_feature_visibility_core';

export const SETTLEMENT_MODEL_IDS = Object.freeze(Object.keys(SETTLEMENT_MODELS));
export const settlementsPreloadInternalsForTest = {
  assetUrls: Object.freeze(SETTLEMENT_MODEL_IDS.map((id) => SETTLEMENT_MODELS[id].url)),
};
const sources: Record<string, THREE.Group> = {};
for (const id of SETTLEMENT_MODEL_IDS) {
  registerDeferredPreload(() =>
    loadGltf(SETTLEMENT_MODELS[id].url).then(async (gltf) => {
      sources[id] = await prepareSettlementTextures(gltf.scene);
    }),
  );
}

export interface SettlementsTownView {
  group: THREE.Group;
  update(
    camX: number,
    camY: number,
    camZ: number,
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    fogFar: number,
    dt: number,
    reducedMotion?: boolean,
  ): void;
  setRevealGate(gate: RevealGateCore | null): void;
  staticRevealRoots(key?: string): readonly THREE.Object3D[];
  setRealmBuilderHonouree(name: string): void;
  dispose(): void;
}

function footprint(root: THREE.Object3D): FeatureFootprint {
  const box = new THREE.Box3().setFromObject(root);
  return {
    centerX: (box.min.x + box.max.x) / 2,
    centerZ: (box.min.z + box.max.z) / 2,
    halfX: (box.max.x - box.min.x) / 2,
    halfZ: (box.max.z - box.min.z) / 2,
  };
}

/** Uses the established town reveal lane, native stairs and camera-fade gate. */
export function buildSettlementsTownView(seed: number): SettlementsTownView {
  if (getActiveWorldContent() !== BUILTIN_WORLD) {
    return {
      group: new THREE.Group(),
      update() {},
      setRevealGate() {},
      staticRevealRoots: () => [],
      setRealmBuilderHonouree() {},
      dispose() {},
    };
  }
  const view = assembleSettlementsTown(
    cloneSettlementModels(sources, SETTLEMENT_MODEL_IDS),
    (x, z) => terrainHeight(x, z, seed),
  );
  // Existing ferry decks keep exactly the movement system's sea-level geometry.
  const harbor = buildEastbrookHarbor(seed);
  view.addEastbrookHarbor(harbor);
  return view;
}

/** Geometry-only entry; tests supply immutable decoded templates without WebGL. */
export function assembleSettlementsTown(
  models: Readonly<Record<string, THREE.Group>>,
  height: TerrainHeight,
) {
  const group = new THREE.Group();
  group.name = 'approved-settlements';
  const plans = settlementPlans(height);
  const occlusion = wickharborOcclusion();
  const camera = new THREE.Vector3(),
    eye = new THREE.Vector3();
  const projections: RealmBuilderMonumentFx[] = [];
  const sourceGeometry = new Set<THREE.BufferGeometry>();
  const ownedMaterials = new Set<THREE.Material>();
  for (const model of Object.values(models))
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      sourceGeometry.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) ownedMaterials.add(m);
    });
  const states = SETTLEMENTS.map((settlement) => buildSettlement(settlement));
  let gate: RevealGateCore | null = null;
  let camX = 0,
    camZ = 0;
  let disposed = false;

  function buildSettlement(settlement: Settlement) {
    const roots: THREE.Group[] = [];
    if (settlement.lots.length) {
      const foundation = settlementFoundationBuilder(models, settlement.models, height);
      for (const { lot, placement: p, metadata, nativeMetadata, scale, modelId } of plans.filter(
        (p) => p.settlement.id === settlement.id,
      )) {
        const holder = new THREE.Group();
        holder.name = `settlementBuilding:${settlement.id}:${lot.id}`;
        holder.userData.lotId = lot.id;
        holder.userData.settlementId = settlement.id;
        holder.position.set(lot.x, p.grade, lot.z);
        holder.rotation.y = lot.rot;
        if (!p.openAir) {
          const top = p.grade + (metadata.foundationTop ?? 0.02);
          foundation.platform(holder, lot, p.body, top, p.grade);
          for (const rect of p.additionalFoundations)
            foundation.platform(holder, lot, rect, top, p.grade);
          foundation.entranceSteps(holder, lot, p);
        }
        const native = models[modelId].clone(true);
        if (metadata.walkColliders?.some((r) => r.id === 'inn-open-door'))
          adaptSettlementInnDoor(native);
        if (metadata.bellTower)
          adaptSettlementChapelAccess(
            native,
            nativeMetadata,
            models[settlement.models.deck],
            models[settlement.models.fence],
          );
        const model = new THREE.Group();
        native.scale.multiplyScalar(scale);
        model.add(native);
        model.position.z = p.offsetZ;
        holder.add(model);
        placeWickharborTerrainProps(model, p.terrainProps);
        roots.push(holder);
        if (!p.openAir)
          occlusion.register(model, {
            x: lot.x,
            z: lot.z,
            halfWidth: lot.w / 2,
            halfDepth: lot.d / 2,
            cosine: Math.cos(lot.rot),
            sine: Math.sin(lot.rot),
            topY: p.grade + SETTLEMENT_MODELS[modelId].bounds.max[1] * scale,
            cullRadius: Math.hypot(lot.w, lot.d) / 2,
          });
      }
    }
    const scenery = buildSettlementScenery(settlement, models, height);
    for (const root of scenery.roots) {
      const item = settlement.dressing.find(
        (p) => p.id === root.userData.itemId && p.kind === 'tent',
      );
      if (!item) continue;
      const b = SETTLEMENT_MODELS[item.modelId].bounds;
      const scale = typeof item.scale === 'number' ? item.scale : 1;
      occlusion.register(root, {
        x: item.x,
        z: item.z,
        halfWidth: ((b.max[0] - b.min[0]) * scale) / 2,
        halfDepth: ((b.max[2] - b.min[2]) * scale) / 2,
        cosine: Math.cos(item.rot ?? 0),
        sine: Math.sin(item.rot ?? 0),
        topY: height(item.x, item.z) + b.max[1] * scale,
        cullRadius: Math.hypot(b.max[0], b.max[2]) * scale,
      });
    }
    if (scenery.monument) {
      const { holder, item } = scenery.monument;
      const box = new THREE.Box3().setFromObject(holder);
      const fx = buildRealmBuilderMonumentFx({
        x: item.x,
        z: item.z,
        groundY: box.min.y,
        rotation: item.rot ?? 0,
        nativeWidth: box.max.x - box.min.x,
        nativeHeight: box.max.y - box.min.y,
        nativeDepth: box.max.z - box.min.z,
      });
      // The new paladin has no lantern ring. Keep the existing named-player
      // projection and interaction contract without old statue-specific flames.
      for (const child of [...fx.group.children]) {
        if (/Halos|Embers/.test(child.name)) fx.group.remove(child);
      }
      const root = new THREE.Group();
      root.name = 'settlementMonument:eastbrook';
      root.userData.itemId = item.id;
      root.add(holder, fx.group);
      scenery.roots[scenery.roots.indexOf(holder)] = root;
      projections.push(fx);
    }
    roots.push(...scenery.roots, ...buildSettlementFortifications(settlement, models, height));

    for (const root of roots) group.add(root);
    const footprints = roots.map(footprint);
    const key = `approved-settlement:${settlement.id}`;
    const reveal = newTownPiecewiseReveal(
      key,
      roots,
      footprints.map((f) => f.centerX),
      footprints.map((f) => f.centerZ),
      roots.map((root) => !root.name.startsWith('settlementStreets:')),
    );
    const casters = roots.map((root) => {
      const meshes: THREE.Mesh[] = [];
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.castShadow) meshes.push(o);
      });
      return meshes;
    });
    return {
      settlement,
      roots,
      footprints,
      key,
      reveal,
      casters,
      shadow: roots.map(() => true),
      revealed: false,
      ordered: [] as THREE.Object3D[],
    };
  }
  const view = {
    group,
    addEastbrookHarbor(harbor: THREE.Group): void {
      const state = states.find((s) => s.settlement.id === 'eastbrook');
      if (!state) return;
      group.add(harbor);
      state.roots.push(harbor);
      state.footprints.push(footprint(harbor));
      const meshes: THREE.Mesh[] = [];
      harbor.traverse((o) => {
        if (o instanceof THREE.Mesh && o.castShadow) meshes.push(o);
      });
      state.casters.push(meshes);
      state.shadow.push(true);
      state.reveal = newTownPiecewiseReveal(
        state.key,
        state.roots,
        state.footprints.map((f) => f.centerX),
        state.footprints.map((f) => f.centerZ),
        state.roots.map((r) => r !== harbor && !r.name.startsWith('settlementStreets:')),
      );
    },
    setRealmBuilderHonouree(name: string): void {
      if (disposed) return;
      for (const fx of projections) fx.setHonouree(name);
    },
    setRevealGate(value: RevealGateCore | null): void {
      gate = value;
    },
    staticRevealRoots(key?: string): readonly THREE.Object3D[] {
      const state = states.find((s) => s.key === key);
      if (!state) return states.flatMap((s) => s.roots);
      return orderTownRootsNearestFirst(
        state.roots,
        state.reveal.x,
        state.reveal.z,
        camX,
        camZ,
        state.ordered,
      );
    },
    update(
      x: number,
      y: number,
      z: number,
      ex: number,
      ey: number,
      ez: number,
      fogFar: number,
      dt: number,
      reducedMotion = false,
    ): void {
      if (disposed) return;
      camX = x;
      camZ = z;
      camera.set(x, y, z);
      eye.set(ex, ey, ez);
      for (const state of states) {
        const b = state.settlement.bounds;
        const centerX = (b.xMin + b.xMax) / 2,
          centerZ = (b.zMin + b.zMax) / 2;
        const radius = Math.hypot(b.xMax - b.xMin, b.zMax - b.zMin) / 2;
        const distanceSq = (x - centerX) ** 2 + (z - centerZ) ** 2;
        const fogVisible = state.footprints.some((f) => isZoneFeatureVisible(f, x, z, fogFar));
        const reveal = townStaticReveal(
          fogVisible,
          state.revealed,
          distanceSq,
          radius,
          gate,
          state.key,
        );
        if (reveal === 'revealed') state.revealed = true;
        townPiecewiseRevealInto(state.reveal, reveal, x, z, gate);
        for (let i = 0; i < state.roots.length; i++) {
          state.roots[i].visible =
            isZoneFeatureVisible(state.footprints[i], x, z, fogFar) &&
            townRootVisible(reveal, state.reveal, i);
          const casting = isZoneFeatureShadowCasting(state.footprints[i], x, z, state.shadow[i]);
          if (casting !== state.shadow[i]) {
            state.shadow[i] = casting;
            for (const mesh of state.casters[i]) mesh.castShadow = casting;
          }
        }
      }
      occlusion.update(camera, eye, dt, reducedMotion);
      for (const fx of projections) fx.update(reducedMotion, Math.hypot(x + 14.75, z + 102));
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      occlusion.dispose();
      for (const fx of projections) fx.dispose();
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      group.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        if (!sourceGeometry.has(o.geometry)) geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          materials.add(m);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of ownedMaterials) materials.add(material);
      for (const material of materials) material.dispose();
      group.clear();
    },
  };
  return view;
}
