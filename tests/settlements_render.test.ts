import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { activateGfxProfile, getActiveGfxProfile } from '../src/render/gfx';
import { disposeRendererPrewarmAndGroundFx } from '../src/render/renderer_resource_lifecycle';
import type { RevealGateCore } from '../src/render/reveal_gate_core';
import { adaptSettlementChapelAccess } from '../src/render/settlement_chapel_access';
import { buildSettlementFortifications } from '../src/render/settlement_fortifications';
import { cloneSettlementModels } from '../src/render/settlement_materials';
import { fitSettlementTimber } from '../src/render/settlement_scenery';
import {
  assembleSettlementsTown,
  SETTLEMENT_MODEL_IDS,
  settlementsPreloadInternalsForTest,
} from '../src/render/settlements_town';
import {
  SETTLEMENT_MODELS,
  SETTLEMENTS,
  settlementBelfryOpenings,
  settlementDeckPlacement,
  settlementPlans,
} from '../src/sim/settlements_layout';
import { localPoint } from '../src/sim/wickharbor_layout';
import { terrainHeight } from '../src/sim/world';
import { settlementScene } from './helpers/settlement_scene';

const root = path.resolve(import.meta.dirname, '..');
const height = (x: number, z: number) => terrainHeight(x, z, 20061);
let sources: Record<string, THREE.Group>;
beforeAll(async () => {
  sources = Object.fromEntries(
    await Promise.all(
      SETTLEMENT_MODEL_IDS.map(async (id) => [
        id,
        await settlementScene(path.join(root, 'public', SETTLEMENT_MODELS[id].url)),
      ]),
    ),
  );
}, 60000);

describe('shipping approved settlement geometry', () => {
  it('preloads every tier from immutable, meshopt and KTX2 manifest-owned assets', () => {
    expect(settlementsPreloadInternalsForTest.assetUrls).toEqual(
      SETTLEMENT_MODEL_IDS.map((id) => SETTLEMENT_MODELS[id].url),
    );
    for (const id of SETTLEMENT_MODEL_IDS) {
      const logical = SETTLEMENT_MODELS[id].url.replace(/^\//, '');
      const file = path.join(root, 'public', logical);
      expect(existsSync(file), id).toBe(true);
      expect(MEDIA_ASSETS[logical], id).toMatch(/^\/media\//);
      const bytes = readFileSync(file),
        json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      expect(json.extensionsUsed, id).toContain('EXT_meshopt_compression');
      for (const image of json.images ?? []) expect(image.mimeType, id).toBe('image/ktx2');
      const bindings = json.scenes[json.scene ?? 0].extras?.settlementTextureBindings ?? [];
      for (const binding of bindings)
        for (const url of Object.values(binding.slots)) {
          const shared = String(url).replace(/^\//, '');
          expect(existsSync(path.join(root, 'public', shared)), `${id}:${shared}`).toBe(true);
          expect(MEDIA_ASSETS[shared], `${id}:${shared}`).toMatch(/^\/media\//);
        }
    }
  });

  it('builds all approved lots, irregular graveyards and ambient dressing on both material tiers', () => {
    const before = Object.fromEntries(
      Object.entries(sources).map(([id, source]) => [id, new THREE.Box3().setFromObject(source)]),
    );
    for (const standard of [true, false]) {
      const previousProfile = getActiveGfxProfile();
      activateGfxProfile({
        ...previousProfile,
        settings: { ...previousProfile.settings, standardMaterials: standard },
      });
      try {
        const templates = cloneSettlementModels(sources, SETTLEMENT_MODEL_IDS, standard);
        const view = assembleSettlementsTown(templates, height);
        const buildings = view.group.children.filter((o) => o.userData.lotId);
        expect(buildings).toHaveLength(38);
        for (const id of ['eastbrook', 'icemantle', 'gullhaven', 'gibbetmere']) {
          expect(
            buildings.some((o) => o.userData.settlementId === id),
            id,
          ).toBe(true);
        }
        const itemIds: string[] = [];
        let adaptedDoor = 0;
        view.group.traverse((o) => itemIds.push(...(o.userData.itemIds ?? [])));
        view.group.traverse((o) => {
          if (!o.userData.innDoorAdaptation) return;
          adaptedDoor++;
          expect(o.userData.innDoorAdaptation.vertexCount).toBeGreaterThan(8);
          expect(o.userData.innDoorAdaptation.shift).toBe(-0.12);
        });
        expect(adaptedDoor).toBe(1);
        expect(itemIds.filter((id) => id.startsWith('chapel-grave-'))).toHaveLength(15);
        expect(itemIds).not.toContain('mailbox');
        expect(itemIds).not.toContain('noticeboard');
        expect(itemIds.some((id) => id.startsWith('tree:'))).toBe(true);
        expect(itemIds.some((id) => id.startsWith('lamp:'))).toBe(true);
        const monument = view.group.getObjectByName('settlementMonument:eastbrook')!;
        expect(monument).toBeDefined();
        const holder = monument.children[0];
        expect(new THREE.Vector3(0, 1, 0).applyQuaternion(holder.quaternion).y).toBeCloseTo(1, 8);
        let instances = 0;
        view.group.traverse((o) => {
          if (o instanceof THREE.InstancedMesh) {
            instances++;
            expect(o.boundingSphere).not.toBeNull();
          }
          if (o instanceof THREE.Mesh) {
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
              expect(
                m instanceof (standard ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial),
                `${standard}:${m.type}:${m.name}:${o.name}:${o.parent?.name}`,
              ).toBe(true);
            }
          }
        });
        expect(instances).toBeGreaterThan(10);
        view.dispose();
        view.dispose();
        expect(view.group.children).toHaveLength(0);
      } finally {
        activateGfxProfile(previousProfile);
      }
    }
    for (const [id, source] of Object.entries(sources)) {
      expect(new THREE.Box3().setFromObject(source).equals(before[id]), id).toBe(true);
    }
  }, 60000);

  it('scales the native roof bounds and keeps open doorways clear for the actual player height', () => {
    const templates = cloneSettlementModels(sources, SETTLEMENT_MODEL_IDS);
    const view = assembleSettlementsTown(templates, height);
    view.group.updateWorldMatrix(true, true);
    for (const plan of settlementPlans(height)) {
      const holder = view.group.getObjectByName(
        `settlementBuilding:${plan.settlement.id}:${plan.lot.id}`,
      )!;
      const nativeBounds = new THREE.Box3().setFromObject(sources[plan.modelId]);
      const bounds = new THREE.Box3().setFromObject(holder);
      expect(bounds.max.y, plan.modelId).toBeCloseTo(
        plan.placement.grade + nativeBounds.max.y * plan.scale,
        4,
      );
      if (plan.settlement.id === 'eastbrook' && plan.lot.id === 'smith-house') {
        const crate = plan.placement.terrainProps.find((prop) => prop.name === 'Crate_Wooden')!;
        const anchor = holder.getObjectByName('grounded:Crate_Wooden')!;
        expect(anchor).toBeDefined();
        const position = holder.worldToLocal(anchor.getWorldPosition(new THREE.Vector3()));
        expect(position.x).toBeCloseTo(crate.pivot[0] + crate.placementOffset![0], 7);
        expect(position.z).toBeCloseTo(
          plan.placement.offsetZ + crate.pivot[2] + crate.placementOffset![1],
          7,
        );
        expect(anchor.children.length).toBeGreaterThan(0);
      }
      if (
        !plan.metadata.bellTower &&
        !plan.metadata.walkColliders?.some((r) => r.id === 'inn-open-door')
      )
        continue;
      const entry = plan.metadata.entrance!;
      const start = localPoint(plan.lot, entry.x, entry.z + plan.placement.offsetZ + plan.scale);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(start.x, plan.placement.grade + entry.thresholdY + 2.6, start.z),
        new THREE.Vector3(-Math.sin(plan.lot.rot), 0, -Math.cos(plan.lot.rot)),
        0,
        2 * plan.scale,
      );
      expect(
        ray.intersectObject(holder, true),
        `${plan.modelId} player head clearance`,
      ).toHaveLength(0);
    }
    view.dispose();
  });

  it('renders the seed 1 sanctuary stair treads at their authoritative movement heights', () => {
    const height = (x: number, z: number) => terrainHeight(x, z, 1);
    const plan = settlementPlans(height).find((p) => p.lot.id === 'stone-sanctuary')!;
    const view = assembleSettlementsTown(
      cloneSettlementModels(sources, SETTLEMENT_MODEL_IDS),
      height,
    );
    view.group.updateWorldMatrix(true, true);
    const holder = view.group.getObjectByName('settlementBuilding:icemantle:stone-sanctuary')!;
    expect(plan.placement.steps).toHaveLength(23);
    for (const tread of plan.placement.steps) {
      const world = localPoint(
        plan.lot,
        (tread.minX + tread.maxX) / 2,
        (tread.minZ + tread.maxZ) / 2,
      );
      const ray = new THREE.Raycaster(
        new THREE.Vector3(world.x, tread.top + 0.2, world.z),
        new THREE.Vector3(0, -1, 0),
        0,
        0.3,
      );
      const hits = ray.intersectObject(holder, true);
      expect(hits.length).toBeGreaterThan(0);
      expect(Math.abs(hits[0].point.y - tread.top)).toBeLessThan(0.025);
    }
    view.dispose();
  });

  it('consults only the approached settlement and holds distant roots until their programs settle', () => {
    const view = assembleSettlementsTown(
      cloneSettlementModels(sources, SETTLEMENT_MODEL_IDS),
      height,
    );
    const allow = vi.fn(() => false);
    view.setRevealGate({
      allow,
      rootReady: () => false,
      noteRootRevealedAtReach() {},
    } as unknown as RevealGateCore);
    view.update(-14, 8, -100, -14, 3, -100, 120, 0.05);
    expect(allow.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      'approved-settlement:eastbrook',
      'approved-settlement:wolf-run-fort',
    ]);
    const roots = view.staticRevealRoots('approved-settlement:eastbrook');
    const queuedRoots = [...roots];
    view.staticRevealRoots('approved-settlement:icemantle');
    expect(roots).toEqual(queuedRoots);
    expect(roots.length).toBeGreaterThan(18);
    expect(roots.some((r) => r.name.includes('icemantle'))).toBe(false);
    expect(roots.some((r) => r.visible)).toBe(true);
    const ice = view.group.children.filter((r) => r.userData.settlementId === 'icemantle');
    expect(ice.every((r) => !r.visible)).toBe(true);
    view.setRevealGate(null);
    view.update(-30, 8, 1560, -30, 3, 1560, 120, 0.05);
    expect(ice.every((r) => r.visible)).toBe(true);
    view.dispose();
  }, 60000);

  it('adapts native timber feet without tilting roofs or mutating the source geometry', () => {
    const source = new THREE.Group();
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    geometry.translate(0, 1, 0);
    source.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
    const before = Array.from(geometry.getAttribute('position').array);
    const fitted = fitSettlementTimber(
      source,
      { x: 0, z: 0, rot: 0, scale: [1, 1, 1] },
      (x, z) => x * 0.1 + z * 0.03,
      0,
    );
    fitted.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y > 1) expect(y).toBeCloseTo(2, 6);
        else expect(y).toBeCloseTo(p.getX(i) * 0.1 + p.getZ(i) * 0.03 - 0.008, 6);
      }
    });
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(before);
    const quantized = new THREE.BufferGeometry();
    quantized.setAttribute(
      'position',
      new THREE.BufferAttribute(new Int16Array([-32767, 0, 0, 32767, 0, 0, 0, 32767, 0]), 3, true),
    );
    const mesh = new THREE.Mesh(quantized, new THREE.MeshStandardMaterial());
    mesh.scale.set(2, 4, 2);
    const native = new THREE.Group();
    native.add(mesh);
    const adapted = fitSettlementTimber(
      native,
      { x: 0, z: 0, rot: 0, scale: [1, 1, 1] },
      () => 0,
      0,
    );
    expect(new THREE.Box3().setFromObject(adapted).max.y).toBeCloseTo(4, 6);
    expect(quantized.getAttribute('position').array[7]).toBe(32767);
  });

  it('keeps native Gullhaven pier tread heights on the shared movement deck plane', () => {
    const settlement = SETTLEMENTS.find((s) => s.id === 'gullhaven');
    if (!settlement) throw new Error('Missing Gullhaven fixture');
    const models = cloneSettlementModels(sources, SETTLEMENT_MODEL_IDS);
    const roots = buildSettlementFortifications(settlement, models, height);
    for (const object of roots) object.updateWorldMatrix(true, true);
    const decks = settlement.siteDressing?.decks ?? [];
    expect(decks.length).toBeGreaterThan(2);
    for (const item of decks.slice(0, 8)) {
      const plan = settlementDeckPlacement(item, height);
      const x = (plan.rect.minX + plan.rect.maxX) / 2;
      const z = (plan.rect.minZ + plan.rect.maxZ) / 2;
      const world = localPoint({ ...item, rot: plan.rot }, x, z);
      const top = plan.top + x * plan.slope;
      const ray = new THREE.Raycaster(
        new THREE.Vector3(world.x, top + 0.15, world.z),
        new THREE.Vector3(0, -1, 0),
        0,
        0.3,
      );
      const hits = ray.intersectObjects(roots, true);
      expect(hits.length, `${item.x},${item.z}`).toBeGreaterThan(0);
      expect(Math.abs(hits[0].point.y - top)).toBeLessThan(0.025);
    }
  });

  it('leaves the final belfry flight open through the visible platform cap', () => {
    const plan = settlementPlans(height).find((p) => p.metadata.bellTower);
    if (!plan?.metadata.bellTower) throw new Error('Missing belfry fixture');
    const chapel = sources[plan.modelId].clone(true);
    adaptSettlementChapelAccess(
      chapel,
      plan.nativeMetadata,
      sources[plan.settlement.models.deck],
      sources[plan.settlement.models.fence],
    );
    const opening = settlementBelfryOpenings(plan.nativeMetadata)[1];
    const x = (opening.minX + opening.maxX) / 2;
    const z = plan.nativeMetadata.bellTower!.centerZ + opening.maxZ - 0.2;
    const platforms = chapel.children.filter((o) => o.userData.civicRole === 'tower-platform');
    expect(platforms.length).toBeGreaterThan(0);
    for (const platform of platforms) {
      const bounds = new THREE.Box3().setFromObject(platform);
      expect(x > bounds.min.x && x < bounds.max.x && z > bounds.min.z && z < bounds.max.z).toBe(
        false,
      );
    }
  });

  it('terminates settlement resources through the renderer lifecycle owner', () => {
    const dispose = vi.fn();
    disposeRendererPrewarmAndGroundFx(
      { prewarmDepthMaterials: new Map(), eastbrookTownView: { dispose } },
      (cleanup) => cleanup(),
    );
    expect(dispose).toHaveBeenCalledOnce();
  });
});
