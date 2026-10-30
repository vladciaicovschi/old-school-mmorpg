import { describe, expect, it } from 'vitest';
import {
  distancePointToObb,
  EASTBROOK_NPC_PLACEMENTS_BY_ID,
  EASTBROOK_STATIONS_BY_ID,
} from '../src/sim/eastbrook_layout';
import { settlementDressingHost } from '../src/sim/settlement_dressing_placements';
import { architectureGap } from '../src/sim/settlement_space';
import source from '../src/sim/settlements_data.json';
import {
  SETTLEMENT_MODELS,
  SETTLEMENTS,
  type SettlementItem,
  settlementItemPlacement,
  settlementPlans,
} from '../src/sim/settlements_layout';
import { terrainHeight } from '../src/sim/world';

const height = (x: number, z: number) => terrainHeight(x, z, 20061);

function itemFootprint(item: SettlementItem) {
  const bounds = SETTLEMENT_MODELS[item.modelId].bounds;
  const scale = Array.isArray(item.scale)
    ? item.scale
    : [item.scale ?? 1, item.scale ?? 1, item.scale ?? 1];
  return {
    id: item.id,
    x: item.x,
    z: item.z,
    rot: item.rot ?? 0,
    rect: {
      minX: bounds.min[0] * scale[0],
      maxX: bounds.max[0] * scale[0],
      minZ: bounds.min[2] * scale[2],
      maxZ: bounds.max[2] * scale[2],
    },
  };
}

describe('settlement dressing after architecture enlargement', () => {
  it('publishes the canonical service poses and the same shifted well pose as rendering', () => {
    const east = SETTLEMENTS.find((value) => value.id === 'eastbrook')!;
    for (const marker of east.fixed) {
      const canonical =
        EASTBROOK_NPC_PLACEMENTS_BY_ID[marker.id] ?? EASTBROOK_STATIONS_BY_ID[marker.id];
      if (canonical) expect({ x: marker.x, z: marker.z }, marker.id).toEqual(canonical.position);
    }
    const gull = SETTLEMENTS.find((value) => value.id === 'gullhaven')!;
    const marker = gull.fixed.find((value) => value.id === 'well')!;
    const model = gull.dressing.find((value) => value.id === 'well')!;
    expect({ x: marker.x, z: marker.z }).toEqual({ x: model.x, z: model.z });
    const footprint = itemFootprint(model);
    const well = {
      id: model.id,
      center: {
        x: model.x + (footprint.rect.minX + footprint.rect.maxX) / 2,
        z: model.z + (footprint.rect.minZ + footprint.rect.maxZ) / 2,
      },
      halfWidth: (footprint.rect.maxX - footprint.rect.minX) / 2,
      halfDepth: (footprint.rect.maxZ - footprint.rect.minZ) / 2,
      rotation: model.rot ?? 0,
    };
    for (const service of gull.fixed.filter((value) => value.id !== 'well'))
      expect(distancePointToObb(service, well), service.id).toBeGreaterThan(service.r ?? 0.6);
  });

  it('moves host rear fences with shifted houses while leaving the palisade and docks alone', () => {
    const raw = source.settlements.find((settlement) => settlement.id === 'eastbrook')!;
    const actual = SETTLEMENTS.find((settlement) => settlement.id === 'eastbrook')!;
    for (const fence of actual.siteDressing!.fences) {
      const old = raw.siteDressing.fences.find((item) => item.id === fence.id)!;
      const oldHost = settlementDressingHost<{
        id: string;
        x: number;
        z: number;
        rot: number;
        w: number;
      }>(old, raw.lots)!;
      const host = actual.lots.find((lot) => lot.id === oldHost.id)!;
      const scale = host.w / oldHost.w;
      const inset =
        (oldHost.id === 'market-home' ? 0.35 : oldHost.id === 'lane-home' ? 0.3 : 0) * scale;
      expect(fence.x, fence.id).toBeCloseTo(
        host.x + (old.x - oldHost.x) * scale + Math.sin(oldHost.rot) * inset,
        8,
      );
      expect(fence.z, fence.id).toBeCloseTo(
        host.z + (old.z - oldHost.z) * scale + Math.cos(oldHost.rot) * inset,
        8,
      );
    }
    const gull = SETTLEMENTS.find((settlement) => settlement.id === 'gullhaven')!;
    const oldGull = source.settlements.find((settlement) => settlement.id === 'gullhaven')!;
    expect(gull.siteDressing).toEqual(oldGull.siteDressing);
  });

  it('joins every winter wood shelter to its host without scattering the stored wood', () => {
    const settlement = SETTLEMENTS.find((value) => value.id === 'icemantle')!;
    const shelters = settlement.dressing.filter((item) => item.id.endsWith(':wood-shelter'));
    expect(shelters).toHaveLength(6);
    for (const shelter of shelters) {
      const host = settlementDressingHost(shelter, settlement.lots)!;
      const metadata = host.metadata!,
        w = metadata.footprint!.width,
        d = metadata.footprint!.depth;
      const offset = (host.d - d) / 2;
      const wall = {
        id: host.id,
        x: host.x,
        z: host.z,
        rot: host.rot,
        rect: { minX: -w / 2, maxX: w / 2, minZ: -d / 2 + offset, maxZ: d / 2 + offset },
      };
      const seam = architectureGap(itemFootprint(shelter), wall);
      expect(seam, shelter.id).toBeGreaterThan(-0.04);
      expect(seam, shelter.id).toBeLessThan(0.025);
      const wood = settlement.dressing.filter(
        (item) => item.id.startsWith(`${host.id}:yard:`) && item !== shelter,
      );
      expect(wood.length).toBeGreaterThan(1);
      for (const pile of wood)
        expect(architectureGap(itemFootprint(pile), itemFootprint(shelter)), pile.id).toBeLessThan(
          0,
        );
    }
  });

  it('keeps movable scenery outside real doorway approaches and seated on game terrain', () => {
    const plans = settlementPlans(height);
    for (const settlement of SETTLEMENTS.filter((value) => !value.decorationOnly)) {
      for (const item of [...settlement.dressing, ...(settlement.lamps ?? [])]) {
        if (/grave/.test(item.id)) continue;
        for (const plan of plans.filter((value) => value.settlement.id === settlement.id)) {
          const approach = {
            id: plan.lot.id,
            x: plan.lot.x,
            z: plan.lot.z,
            rot: plan.lot.rot,
            rect: plan.placement.approach,
          };
          expect(
            architectureGap(itemFootprint(item), approach),
            `${settlement.id}:${item.id}:${plan.lot.id}`,
          ).toBeGreaterThanOrEqual(0.5);
          const body = { ...approach, rect: plan.placement.body };
          const isAttachedShelter = item.terrainFeet && item.id.startsWith(`${plan.lot.id}:yard:`);
          expect(
            architectureGap(itemFootprint(item), body),
            `${settlement.id}:${item.id}:${plan.lot.id}:body`,
          ).toBeGreaterThanOrEqual(isAttachedShelter ? -0.15 : 0);
        }
        if (!item.terrainFeet && item.kind !== 'lamp')
          expect(
            settlementItemPlacement(item, height).seating.contactGaps.max,
            item.id,
          ).toBeLessThanOrEqual(0.001);
      }
      for (const fence of settlement.siteDressing?.fences ?? []) {
        const item = itemFootprint({ ...fence, rot: fence.yaw ?? fence.rot });
        for (const plan of plans.filter((value) => value.settlement.id === settlement.id)) {
          const metadata = plan.metadata,
            width = metadata.footprint!.width,
            depth = metadata.footprint!.depth;
          const offset = (plan.lot.d - depth) / 2;
          const wall = {
            id: plan.lot.id,
            x: plan.lot.x,
            z: plan.lot.z,
            rot: plan.lot.rot,
            rect: {
              minX: -width / 2,
              maxX: width / 2,
              minZ: -depth / 2 + offset,
              maxZ: depth / 2 + offset,
            },
          };
          expect(architectureGap(item, wall), `${fence.id}:${plan.lot.id}`).toBeGreaterThanOrEqual(
            0,
          );
          expect(
            architectureGap(item, { ...wall, rect: plan.placement.approach }),
            `${fence.id}:${plan.lot.id}:approach`,
          ).toBeGreaterThanOrEqual(0.5);
        }
      }
    }
  });
});
