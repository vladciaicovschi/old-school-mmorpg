// Approved settlement assemblies. These pure readouts are shared by rendering,
// terrain seating, service spawning and movement collision on every host.

import {
  architectureFrame,
  architectureNativeHeight,
  architectureScaleFor,
  scaleCoordinates,
} from './architecture_scale';
import { EASTBROOK_NPC_PLACEMENTS_BY_ID, EASTBROOK_STATIONS_BY_ID } from './eastbrook_layout';
import { settlementChurchyardItems, settlementLegacyChurchyards } from './settlement_churchyards';
import {
  placeSettlementDressing,
  settlementDressingHost,
  settlementFixtureOffset,
} from './settlement_dressing_placements';
import {
  architectureFootprints,
  insideArchitecture,
  settlementTreeRadius,
} from './settlement_space';
import raw from './settlements_data.json';
import type { BuildingDef, ZonePropsDef } from './types';
import {
  groundRange,
  planBuildingPlacement,
  seatTerrainProp,
  type TerrainHeight,
  type WickharborLot,
  type WickharborMetadata,
} from './wickharbor_layout';

export interface Bounds3 {
  min: number[];
  max: number[];
}
export interface SettlementMetadata extends Omit<WickharborMetadata, 'interior'> {
  interior?: {
    floorY: number;
    doorwayWidth?: number;
    items?: { id: string; source: string; bounds: Bounds3 }[];
  };
  groundSupport?: { min: number[]; max: number[]; supportPoints: number[][] };
  deckHeight?: number;
  ladderOpening?: { minX: number; maxX: number; minZ: number; maxZ: number };
}
export interface SettlementModel {
  url: string;
  metadata: SettlementMetadata;
  bounds: Bounds3;
}
export interface SettlementItem {
  id: string;
  modelId: string;
  x: number;
  z: number;
  rot?: number;
  scale?: number | number[];
  type?: string;
  kind?: string;
  r?: number;
  support?: { min: number[]; max: number[]; supportPoints: number[][] };
  terrainFeet?: boolean;
  foundationRects?: { minX: number; maxX: number; minZ: number; maxZ: number }[];
}
export interface SettlementFixed {
  id: string;
  x: number;
  z: number;
  rot?: number;
  r?: number;
  type?: string;
  host?: string;
}
export interface SettlementSiteItem extends SettlementItem {
  yaw?: number;
  pitch?: number;
  top?: number;
  shiftY?: number;
}
export interface Settlement {
  id: string;
  zoneId: string;
  decorationOnly?: boolean;
  models: Record<string, string>;
  bounds: { xMin: number; xMax: number; zMin: number; zMax: number };
  lots: (Omit<WickharborLot, 'metadata'> & { metadata?: SettlementMetadata })[];
  roads: { id: string; width: number; points: number[][] }[];
  plazas?: { id: string; x: number; z: number; w: number; d: number }[];
  paths?: { id: string; width: number; points: number[][] }[];
  fixed: SettlementFixed[];
  dressing: SettlementItem[];
  landmarks: SettlementItem[];
  fortifications: SettlementItem[];
  siteDressing?: {
    fences: SettlementSiteItem[];
    decks: SettlementSiteItem[];
    piles: SettlementSiteItem[];
  };
  trees?: (SettlementItem & { radius?: number; targetHeight?: number })[];
  lamps?: SettlementItem[];
}
const data = raw as unknown as {
  settlements: Settlement[];
  models: Record<string, SettlementModel>;
};
export const SETTLEMENT_MODELS = data.models;
// The native open leaf protrudes into the jamb. Move the complete leaf into
// the left reveal, keeping the full player-width centre of the doorway clear.
export const SETTLEMENT_ACCESS = {
  innDoorShiftX: -0.12,
  innDoorBounds: {
    min: [-0.5775575567781925, -0.01, 2.9283969402313232],
    max: [-0.45685728311538676, 3.1, 4.046263106167316],
  },
};
const frames = new Map(
  data.settlements.flatMap((settlement) =>
    settlement.lots.map((source) => {
      const sourceMetadata = source.metadata ?? SETTLEMENT_MODELS[source.modelId].metadata,
        original =
          settlement.id === 'eastbrook' && source.id === 'smith-house'
            ? {
                ...sourceMetadata,
                terrainProps: sourceMetadata.terrainProps?.map((prop) =>
                  prop.name === 'Crate_Wooden'
                    ? { ...prop, placementOffset: [-2, 0] as [number, number] }
                    : prop,
                ),
              }
            : sourceMetadata,
        metadata = original.walkColliders?.some((r) => r.id === 'inn-open-door')
          ? {
              ...original,
              walkColliders: original.walkColliders.map((r) =>
                r.id === 'inn-open-door'
                  ? {
                      ...r,
                      minX: r.minX + SETTLEMENT_ACCESS.innDoorShiftX,
                      maxX: r.maxX + SETTLEMENT_ACCESS.innDoorShiftX,
                    }
                  : r,
              ),
            }
          : original;
      return [
        `${settlement.id}:${source.id}`,
        architectureFrame({ ...source, metadata } as WickharborLot),
      ] as const;
    }),
  ),
);
function scaleDressing<T extends SettlementItem>(item: T, settlement: Settlement): T {
  const host = settlementDressingHost(item, settlement.lots);
  const frame = host ? frames.get(`${settlement.id}:${host.id}`) : undefined;
  return placeSettlementDressing(item, settlement.id, host, frame);
}
export const SETTLEMENTS: Settlement[] = data.settlements.map((settlement) => {
  const lots = settlement.lots.map((lot) => frames.get(`${settlement.id}:${lot.id}`)!.lot);
  const footprints = lots.flatMap((lot) => architectureFootprints(lot));
  return {
    ...settlement,
    lots,
    fixed: settlement.fixed.map((item) => {
      const canonical =
        settlement.id === 'eastbrook'
          ? (EASTBROOK_NPC_PLACEMENTS_BY_ID[item.id] ?? EASTBROOK_STATIONS_BY_ID[item.id])
          : undefined;
      if (canonical) return { ...item, x: canonical.position.x, z: canonical.position.z };
      const host = settlement.lots.find((lot) => lot.id === item.host);
      const frame = host ? frames.get(`${settlement.id}:${host.id}`) : undefined;
      const placed =
        frame && host
          ? {
              ...item,
              x: frame.lot.x + (item.x - host.x) * frame.scale,
              z: frame.lot.z + (item.z - host.z) * frame.scale,
            }
          : item;
      const [dx, dz] = settlementFixtureOffset(settlement.id, item.id);
      return dx || dz ? { ...placed, x: placed.x + dx, z: placed.z + dz } : placed;
    }),
    dressing: [
      ...settlement.dressing.map((item) => scaleDressing(item, settlement)),
      ...settlementChurchyardItems(settlement.id),
    ],
    lamps: settlement.lamps?.map((item) => scaleDressing(item, settlement)),
    siteDressing: settlement.siteDressing
      ? {
          ...settlement.siteDressing,
          fences: settlement.siteDressing.fences.map((item) =>
            settlementDressingHost(item, settlement.lots) ? scaleDressing(item, settlement) : item,
          ),
        }
      : undefined,
    trees: settlement.trees?.filter(
      (tree) =>
        !insideArchitecture(
          footprints,
          tree.x,
          tree.z,
          settlementTreeRadius(tree, SETTLEMENT_MODELS[tree.modelId].bounds),
        ),
    ),
  };
});
export function settlementService(id: string, key: string) {
  return SETTLEMENTS.find((s) => s.id === id)?.fixed?.find((p) => p.id === key);
}
export function settlementRoads(id: string, legacy: { x: number; z: number }[][]) {
  const settlement = SETTLEMENTS.find((s) => s.id === id);
  if (!settlement || settlement.decorationOnly) return legacy;
  const b = settlement.bounds,
    inside = (p: { x: number; z: number }) =>
      p.x >= b.xMin && p.x <= b.xMax && p.z >= b.zMin && p.z <= b.zMax;
  const kept: { x: number; z: number }[][] = [];
  for (const road of legacy)
    for (let i = 1; i < road.length; i++)
      if (!(inside(road[i - 1]) && inside(road[i]))) kept.push([road[i - 1], road[i]]);
  return [...kept, ...settlement.roads.map((r) => r.points.map(([x, z]) => ({ x, z })))];
}
export function isSettlementBuilding(building: Pick<BuildingDef, 'id'>) {
  return building.id?.startsWith('settlement:') ?? false;
}
export function settlementNativePlans(height: TerrainHeight) {
  return data.settlements.flatMap((settlement) =>
    settlement.lots.map((source) => {
      const frame = frames.get(`${settlement.id}:${source.id}`)!;
      const nativeHeight = architectureNativeHeight(height, frame.nativeLot, frame.scale);
      const lot = frame.nativeLot;
      return {
        settlement: SETTLEMENTS.find((s) => s.id === settlement.id)!,
        lot,
        metadata: lot.metadata as SettlementMetadata,
        modelId: lot.modelId,
        scale: frame.scale,
        height: nativeHeight,
        placement: planBuildingPlacement(lot, lot.metadata, nativeHeight),
      };
    }),
  );
}
export function settlementPlans(height: TerrainHeight) {
  return settlementNativePlans(height).map((native) => {
    const frame = frames.get(`${native.settlement.id}:${native.lot.id}`)!;
    return {
      ...native,
      lot: frame.lot,
      metadata: frame.lot.metadata as SettlementMetadata,
      nativeMetadata: native.metadata,
      placement: scaleCoordinates(native.placement, native.scale),
    };
  });
}
export type SettlementPlan = ReturnType<typeof settlementPlans>[number];
/** Keep the entire rising flight open overhead, including its front landing. */
export function settlementBelfryOpenings(metadata: SettlementMetadata) {
  const tower = metadata.bellTower;
  if (!tower) return [];
  return tower.stairwell.map((r, i) =>
    i === 1
      ? { ...r, maxZ: Math.max(r.maxZ, tower.depth / 2 - 0.25 * (metadata.modelScale ?? 1)) }
      : r,
  );
}
export function settlementDeckPlacement(item: SettlementSiteItem, height: TerrainHeight) {
  const model = SETTLEMENT_MODELS[item.modelId],
    b = model.bounds,
    scale = Array.isArray(item.scale)
      ? item.scale
      : [item.scale ?? 1, item.scale ?? 1, item.scale ?? 1],
    rot = item.rot ?? item.yaw ?? 0,
    pitch = item.pitch ?? 0,
    minX = b.min[0] * scale[0] * Math.cos(pitch),
    maxX = b.max[0] * scale[0] * Math.cos(pitch),
    minZ = b.min[2] * scale[2],
    maxZ = b.max[2] * scale[2],
    top = item.top ?? height(item.x, item.z) + 0.12,
    slope = Math.tan(pitch);
  return { rot, rect: { minX, maxX, minZ, maxZ }, top, slope, axis: 'x' as const };
}
export function settlementFortificationGrade(item: SettlementItem, height: TerrainHeight) {
  const model = SETTLEMENT_MODELS[item.modelId],
    b = model.bounds,
    rects = item.foundationRects ?? [
      { minX: b.min[0], maxX: b.max[0], minZ: b.min[2], maxZ: b.max[2] },
    ],
    ranges = rects.map((r) =>
      groundRange({ ...item, rot: item.rot ?? 0 } as WickharborLot, r, height),
    );
  return (Math.min(...ranges.map((r) => r.min)) + Math.max(...ranges.map((r) => r.max))) / 2;
}
export function settlementItemPlacement(item: SettlementItem, height: TerrainHeight) {
  const model = SETTLEMENT_MODELS[item.modelId],
    scale = Array.isArray(item.scale)
      ? item.scale
      : [item.scale ?? 1, item.scale ?? 1, item.scale ?? 1],
    support = model.metadata.groundSupport?.supportPoints?.length
      ? model.metadata.groundSupport
      : {
          ...model.bounds,
          supportPoints: [
            [model.bounds.min[0], model.bounds.min[1], model.bounds.min[2]],
            [model.bounds.max[0], model.bounds.min[1], model.bounds.min[2]],
            [model.bounds.min[0], model.bounds.min[1], model.bounds.max[2]],
            [model.bounds.max[0], model.bounds.min[1], model.bounds.max[2]],
          ],
        },
    grade = height(item.x, item.z),
    scaled = item.support?.supportPoints?.length
      ? item.support
      : {
          min: support.min.map((v, i) => v * scale[i]),
          max: support.max.map((v, i) => v * scale[i]),
          supportPoints: support.supportPoints.map((p) => p.map((v, i) => v * scale[i])),
        },
    prop = { ...scaled, name: item.modelId };
  return {
    grade,
    scale,
    seating: seatTerrainProp({ ...item, rot: item.rot ?? 0 }, prop, 0, grade, height),
  };
}

/** Only replace approved settlement footprints, preserving distant camps and ships. */
export function applySettlementProps(legacy: ZonePropsDef, id: string): ZonePropsDef {
  const settlement = SETTLEMENTS.find((s) => s.id === id);
  if (!settlement) return legacy;
  if (settlement.decorationOnly)
    return {
      ...legacy,
      graveyards: settlementLegacyChurchyards(legacy.graveyards, id, settlement.bounds),
    };
  const b = settlement.bounds,
    outside = (x: number, z: number) => x < b.xMin || x > b.xMax || z < b.zMin || z > b.zMax;
  const buildings: BuildingDef[] = settlement.lots.map((lot) => ({
    id: `settlement:${id}:${lot.id}`,
    assetId: SETTLEMENT_MODELS[lot.modelId].url,
    kind:
      /inn|lodge/.test(lot.id) || lot.id === 'muster-hall' || lot.id === 'trade-hall'
        ? 'inn'
        : /chapel|sanctuary/.test(lot.id)
          ? 'chapel'
          : 'house',
    x: lot.x,
    z: lot.z,
    w: lot.w,
    d: lot.d,
    rot: lot.rot,
    height: SETTLEMENT_MODELS[lot.modelId].bounds.max[1] * architectureScaleFor(lot.modelId),
  }));
  return {
    ...legacy,
    buildings: [...legacy.buildings.filter((p) => outside(p.x, p.z)), ...buildings],
    wells: legacy.wells.filter((p) => outside(p.x, p.z)),
    stalls: legacy.stalls.filter((p) => outside(p.x, p.z)),
    crates: legacy.crates.filter(([x, z]) => outside(x, z)),
    campfires: legacy.campfires.filter(([x, z]) => outside(x, z)),
    tents:
      id === 'gullhaven'
        ? legacy.tents.filter((p) => Math.hypot(p.x - 305, p.z - 70) > 25)
        : legacy.tents,
    fences: legacy.fences.filter((p) => outside((p.x1 + p.x2) / 2, (p.z1 + p.z2) / 2)),
    benches: legacy.benches?.filter((p) => outside(p.x, p.z)),
    walls: legacy.walls?.filter((p) => outside(p.x, p.z)),
    // The release markers remain services. Only their old visual clusters go.
    graveyards: settlementLegacyChurchyards(legacy.graveyards, id, settlement.bounds),
    decorProps: legacy.decorProps?.filter(
      (p) =>
        outside(p.x, p.z) ||
        /^(hexShipBlue|hexBoat|hexBoatrack|hexAnchor|hexShipGreen|hexShipRed)$/.test(p.key),
    ),
  };
}
