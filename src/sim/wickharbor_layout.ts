// Approved coastal settlement geometry shared by simulation and rendering.
// The JSON is exported from the source GLB scene extras, preserving real door,
// tread, furniture and terrain-contact coordinates instead of estimating them.

import { architecturePropOffset } from './architecture_placements';
import {
  ARCHITECTURE_SCALE,
  architectureFrame,
  architectureNativeHeight,
  architectureScaleFor,
  NATIVE_ENTRANCE_MAX_TREADS,
  scaleArchitectureMetadata,
  scaleCoordinates,
} from './architecture_scale';
import type { BuildingDef } from './types';
import data from './wickharbor_data.json';

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export type TerrainHeight = (x: number, z: number) => number;
export interface TerrainProp {
  placementOffset?: [number, number];
  id?: string;
  name: string;
  min: number[];
  max: number[];
  supportPoints: number[][];
}
export interface TerrainPropPlacement extends TerrainProp {
  rect: Rect;
  pivot: number[];
  quaternion: number[];
  translationY: number;
  tilt: number;
  contactGaps: { min: number; max: number };
}
export interface WickharborMetadata {
  modelScale?: number;
  footprint?: { width: number; depth: number };
  entrance?: { x: number; z: number; thresholdY: number; width: number };
  foundationPad?: number;
  foundationTop?: number;
  additionalFoundations?: Rect[];
  openAirMarket?: boolean;
  openWorkArea?: boolean;
  terrainProps?: TerrainProp[];
  walkColliders?: (Rect & { id: string })[];
  interior?: { floorY: number; doorwayWidth: number };
  bellTower?: {
    footprint: Rect;
    width: number;
    depth: number;
    levels: number;
    centerZ: number;
    platformY: number;
    stairwell: Rect[];
    flights: { from: number[]; to: number[]; steps: { x: number; z: number; top: number }[] }[];
  };
  staircase?: {
    count: number;
    angleStep: number;
    endAngle: number;
    portalAngle: number;
    inner: number;
    outer: number;
    walkRadius: number;
    baseY: number;
    topY: number;
  };
}
export interface WickharborLot {
  id: string;
  kind: string;
  x: number;
  z: number;
  w: number;
  d: number;
  front: { x: number; z: number };
  rot: number;
  yard?: string;
  modelId: string;
  metadata: WickharborMetadata;
}
export interface Placement {
  grade: number;
  offsetZ: number;
  body: Rect;
  additionalFoundations: Rect[];
  landing: Rect & { top: number };
  steps: (Rect & { top: number })[];
  rise: number;
  endZ: number;
  groundAtFoot?: { min: number; max: number };
  approach: Rect & { top: number };
  terrainProps: TerrainPropPlacement[];
  openAir?: boolean;
}
export type Lot = WickharborLot;
export const WICKHARBOR_NATIVE_METADATA = data.metadata as unknown as Record<
  string,
  WickharborMetadata
>;
// The game controller needs 2.1m head clearance and a 1m wide body. The study
// camera used a smaller probe, so open its belfry well and shorten the first
// lighthouse treads until the player's head has cleared the doorway lintel.
export const WICKHARBOR_ACCESS = {
  entryTreads: 3,
  entryOuterRadius: 1.85,
  galleryHoleTreads: 18,
  chapelWellEnd: 0.65,
};
WICKHARBOR_NATIVE_METADATA['civic-chapel'].bellTower!.stairwell[1].maxZ =
  WICKHARBOR_ACCESS.chapelWellEnd;
export const WICKHARBOR_METADATA = Object.fromEntries(
  Object.entries(WICKHARBOR_NATIVE_METADATA).map(([id, metadata]) => [
    id,
    scaleArchitectureMetadata(metadata, architectureScaleFor(id)),
  ]),
);
const architectureFrames = data.lots.map((lot) =>
  architectureFrame({ ...lot, metadata: WICKHARBOR_NATIVE_METADATA[lot.modelId] }),
);
export const WICKHARBOR_LOTS: WickharborLot[] = architectureFrames.map((frame) => frame.lot);
export const WICKHARBOR_ROADS = data.roads;
export const WICKHARBOR_FIXED = data.fixtures;
export const WICKHARBOR_LIGHTHOUSE = {
  x: 498,
  z: 308,
  metadata: WICKHARBOR_METADATA['lighthouse-round'],
  nativeMetadata: WICKHARBOR_NATIVE_METADATA['lighthouse-round'],
  scale: ARCHITECTURE_SCALE,
};
export function isWickharborBuilding(building: Pick<BuildingDef, 'id'>): boolean {
  return building.id?.startsWith('wickharbor:') ?? false;
}
export const WICKHARBOR_BUILDINGS: BuildingDef[] = WICKHARBOR_LOTS.map((lot) => ({
  id: `wickharbor:${lot.id}`,
  kind: lot.id === 'inn' ? 'inn' : lot.id === 'chapel' ? 'chapel' : 'house',
  assetId: `/models/wickharbor/${lot.modelId.replaceAll('-', '_')}.glb`,
  x: lot.x,
  z: lot.z,
  w: lot.w,
  d: lot.d,
  rot: lot.rot,
  height:
    (lot.id === 'chapel' ? 14.3 : lot.id === 'hall' || lot.id === 'inn' ? 11 : 8) *
    architectureScaleFor(lot.modelId),
}));
export function localPoint(lot: { x: number; z: number; rot: number }, x: number, z: number) {
  const c = Math.cos(lot.rot),
    s = Math.sin(lot.rot);
  return { x: lot.x + x * c + z * s, z: lot.z - x * s + z * c };
}
export function groundRange(lot: WickharborLot, rect: Rect, height: TerrainHeight) {
  const nx = Math.max(1, Math.ceil((rect.maxX - rect.minX) / 0.18)),
    nz = Math.max(1, Math.ceil((rect.maxZ - rect.minZ) / 0.18));
  let min = Infinity,
    max = -Infinity;
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const p = localPoint(
        lot,
        rect.minX + ((rect.maxX - rect.minX) * i) / nx,
        rect.minZ + ((rect.maxZ - rect.minZ) * j) / nz,
      );
      const y = height(p.x, p.z);
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
  return { min, max };
}
export function planBuildingPlacement(
  lot: WickharborLot,
  metadata: WickharborMetadata,
  height: TerrainHeight,
): Placement {
  const footprint = metadata.footprint ?? { width: lot.w, depth: lot.d };
  const offsetZ = (lot.d - footprint.depth) / 2,
    pad = metadata.foundationPad ?? 0.05;
  const body = {
    minX: -footprint.width / 2 - pad,
    maxX: footprint.width / 2 + pad,
    minZ: offsetZ - footprint.depth / 2 - pad,
    maxZ: lot.d / 2 + pad,
  };
  const entry = metadata.entrance ?? {
    x: 0,
    z: footprint.depth / 2,
    thresholdY: 0.03,
    width: 1.12,
  };
  const front = offsetZ + entry.z,
    halfWidth = Math.max(0.75, entry.width / 2 + 0.16);
  const landing = {
    minX: entry.x - halfWidth,
    maxX: entry.x + halfWidth,
    minZ: front + 0.02,
    maxZ: front + 0.72,
  };
  const additionalFoundations = (metadata.additionalFoundations ?? []).map((rect) => ({
    ...rect,
    minZ: rect.minZ + offsetZ,
    maxZ: rect.maxZ + offsetZ,
  }));
  const grade =
    Math.max(
      ...[body, landing, ...additionalFoundations].map(
        (rect) => groundRange(lot, rect, height).max,
      ),
    ) + 0.04;
  const terrainProps = (metadata.terrainProps ?? []).map((prop) =>
    seatTerrainProp(lot, prop, offsetZ, grade, height),
  );
  if (metadata.openAirMarket) {
    const endZ = landing.maxZ;
    return {
      grade,
      offsetZ,
      body,
      additionalFoundations,
      openAir: true,
      landing: { ...landing, top: grade },
      steps: [],
      rise: 0,
      endZ,
      approach: {
        minX: landing.minX,
        maxX: landing.maxX,
        minZ: endZ,
        maxZ: endZ + 0.9,
        top: grade,
      },
      terrainProps,
    };
  }
  const top = grade + entry.thresholdY;
  for (let count = 0; count <= NATIVE_ENTRANCE_MAX_TREADS; count++) {
    const endZ = landing.maxZ + count * 0.3;
    const endGround = groundRange(lot, { ...landing, minZ: endZ, maxZ: endZ + 0.025 }, height);
    const footTop = endGround.max + 0.025,
      rise = (top - footTop) / (count + 1);
    if (rise < -0.001 || rise > 0.18) continue;
    const steps = Array.from({ length: count }, (_, i) => ({
      minX: landing.minX,
      maxX: landing.maxX,
      minZ: landing.maxZ + i * 0.3,
      maxZ: landing.maxZ + (i + 1) * 0.3,
      top: top - rise * (i + 1),
    }));
    if (steps.some((step) => groundRange(lot, step, height).max > step.top - 0.002)) continue;
    return {
      grade,
      offsetZ,
      body,
      additionalFoundations,
      landing: { ...landing, top },
      steps,
      rise,
      endZ,
      groundAtFoot: endGround,
      approach: {
        minX: landing.minX,
        maxX: landing.maxX,
        minZ: endZ,
        maxZ: endZ + 0.9,
        top: footTop,
      },
      terrainProps,
    };
  }
  throw new Error(`Wickharbor ${lot.id}: cannot fit grounded entrance stair`);
}
export function wickharborNativePlans(height: TerrainHeight) {
  return architectureFrames.map(({ nativeLot: lot, scale }) => {
    const nativeHeight = architectureNativeHeight(height, lot, scale);
    return {
      lot,
      scale,
      height: nativeHeight,
      metadata: lot.metadata,
      modelId: lot.modelId,
      placement: planBuildingPlacement(lot, lot.metadata, nativeHeight),
    };
  });
}
export function wickharborPlans(height: TerrainHeight) {
  return wickharborNativePlans(height).map((native, index) => ({
    lot: architectureFrames[index].lot,
    metadata: architectureFrames[index].lot.metadata,
    nativeMetadata: native.metadata,
    modelId: native.modelId,
    scale: native.scale,
    placement: scaleCoordinates(native.placement, native.scale),
  }));
}
export function rotateContact(point: number[], quaternion: number[]) {
  const [x, y, z] = point,
    [qx, qy, qz, qw] = quaternion;
  const tx = 2 * (qy * z - qz * y),
    ty = 2 * (qz * x - qx * z),
    tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + qy * tz - qz * ty,
    y + qw * ty + qz * tx - qx * tz,
    z + qw * tz + qx * ty - qy * tx,
  ];
}
export function seatTerrainProp(
  lot: Pick<WickharborLot, 'x' | 'z' | 'rot'>,
  prop: TerrainProp,
  offsetZ: number,
  grade: number,
  height: TerrainHeight,
): TerrainPropPlacement {
  if (!prop.supportPoints?.length) throw new Error(`${prop.name}: missing ground contacts`);
  const [placementX, placementZ] = architecturePropOffset(prop.name, prop.placementOffset);
  const points = prop.supportPoints,
    cx = points.reduce((sum, p) => sum + p[0], 0) / points.length,
    cz = points.reduce((sum, p) => sum + p[2], 0) / points.length;
  const pivot = [cx, prop.min[1], cz],
    samples = points.map((p) => {
      const world = localPoint(lot, p[0] + placementX, p[2] + offsetZ + placementZ);
      return height(world.x, world.z);
    });
  const mean = samples.reduce((sum, y) => sum + y, 0) / samples.length;
  let xx = 0,
    zz = 0,
    xz = 0,
    xy = 0,
    zy = 0;
  for (let i = 0; i < points.length; i++) {
    const x = points[i][0] - cx,
      z = points[i][2] - cz,
      y = samples[i] - mean;
    xx += x * x;
    zz += z * z;
    xz += x * z;
    xy += x * y;
    zy += z * y;
  }
  const determinant = xx * zz - xz * xz;
  let a = determinant > 1e-10 ? (xy * zz - zy * xz) / determinant : 0,
    b = determinant > 1e-10 ? (zy * xx - xy * xz) / determinant : 0;
  const slope = Math.hypot(a, b);
  if (slope > 0.15) {
    a *= 0.15 / slope;
    b *= 0.15 / slope;
  }
  const length = Math.hypot(a, 1, b),
    raw = [-b / length, 0, a / length, 1 + 1 / length],
    qLength = Math.hypot(...raw),
    quaternion = raw.map((v) => v / qLength);
  const rotated = points.map((p) =>
    rotateContact(
      p.map((v, i) => v - pivot[i]),
      quaternion,
    ),
  );
  const deltas = rotated.map((p) => {
    const world = localPoint(lot, cx + p[0] + placementX, cz + p[2] + offsetZ + placementZ);
    return height(world.x, world.z) - grade - pivot[1] - p[1];
  });
  const translationY = Math.min(...deltas) - 0.004,
    gaps = deltas.map((delta) => translationY - delta);
  const rect = {
    minX: prop.min[0] + placementX - 0.04,
    maxX: prop.max[0] + placementX + 0.04,
    minZ: prop.min[2] + offsetZ + placementZ - 0.04,
    maxZ: prop.max[2] + offsetZ + placementZ + 0.04,
  };
  return {
    ...prop,
    placementOffset: [placementX, placementZ],
    rect,
    pivot,
    quaternion,
    translationY,
    tilt: Math.atan(Math.min(slope, 0.15)),
    contactGaps: { min: Math.min(...gaps), max: Math.max(...gaps) },
  };
}
export function platformGeometryData(
  lot: WickharborLot,
  rect: Rect,
  top: number | TerrainHeight,
  grade: number,
  height: TerrainHeight,
) {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [],
    topAt = typeof top === 'function' ? top : () => top;
  const corners = [
    [rect.minX, rect.minZ],
    [rect.maxX, rect.minZ],
    [rect.maxX, rect.maxZ],
    [rect.minX, rect.maxZ],
  ];
  for (let edge = 0; edge < 4; edge++) {
    const a = corners[edge],
      b = corners[(edge + 1) % 4],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      count = Math.max(1, Math.ceil(length / 0.18));
    for (let i = 0; i < count; i++) {
      const base = positions.length / 3;
      for (const [t, upper] of [
        [i / count, false],
        [(i + 1) / count, false],
        [(i + 1) / count, true],
        [i / count, true],
      ] as [number, boolean][]) {
        const x = a[0] + (b[0] - a[0]) * t,
          z = a[1] + (b[1] - a[1]) * t,
          world = localPoint(lot, x, z),
          surface = topAt(x, z);
        const y = upper ? surface : Math.min(surface - 0.025, height(world.x, world.z) - 0.035);
        positions.push(x, y - grade, z);
        uvs.push((t * length) / 2, y / 3);
      }
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  if (typeof top === 'function') {
    const nx = Math.ceil((rect.maxX - rect.minX) / 0.18),
      nz = Math.ceil((rect.maxZ - rect.minZ) / 0.18),
      base = positions.length / 3;
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = rect.minX + ((rect.maxX - rect.minX) * i) / nx,
          z = rect.minZ + ((rect.maxZ - rect.minZ) * j) / nz;
        positions.push(x, topAt(x, z) - grade, z);
        uvs.push(x / 2, z / 2);
        if (i < nx && j < nz) {
          const a = base + j * (nx + 1) + i;
          indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
        }
      }
  } else {
    const base = positions.length / 3;
    for (const [x, z] of corners) {
      positions.push(x, top - grade, z);
      uvs.push(x / 2, z / 2);
    }
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return { positions, uvs, indices };
}
export function approachSurface(
  lot: WickharborLot,
  approach: Rect & { top: number },
  height: TerrainHeight,
): TerrainHeight {
  return (x, z) => {
    const p = localPoint(lot, x, z),
      ground = height(p.x, p.z) + 0.035,
      t = Math.max(0, Math.min(1, (z - approach.minZ) / (approach.maxZ - approach.minZ)));
    return Math.max(ground, approach.top * (1 - t) + ground * t);
  };
}
