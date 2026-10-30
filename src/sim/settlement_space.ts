import { NATIVE_ENTRANCE_MAX_TREADS } from './architecture_scale';
import type { Rect, WickharborLot, WickharborMetadata } from './wickharbor_layout';

export interface ArchitectureFootprint {
  id: string;
  x: number;
  z: number;
  rot: number;
  rect: Rect;
}

/** Include rear wings and eaves, rather than only the centre of a house lot. */
export function architectureFootprints(
  lot: Pick<WickharborLot, 'id' | 'x' | 'z' | 'w' | 'd' | 'rot'> & {
    metadata?: Pick<WickharborMetadata, 'footprint' | 'additionalFoundations' | 'modelScale'>;
  },
  metadata = lot.metadata ?? {},
): ArchitectureFootprint[] {
  const width = metadata.footprint?.width ?? lot.w,
    depth = metadata.footprint?.depth ?? lot.d;
  const offset = (lot.d - depth) / 2,
    pad = 0.55 * (metadata.modelScale ?? 1);
  return [
    { minX: -width / 2, maxX: width / 2, minZ: -depth / 2, maxZ: depth / 2 },
    ...(metadata.additionalFoundations ?? []),
  ].map((rect) => ({
    id: lot.id,
    x: lot.x,
    z: lot.z,
    rot: lot.rot,
    rect: {
      minX: rect.minX - pad,
      maxX: rect.maxX + pad,
      minZ: rect.minZ + offset - pad,
      maxZ: rect.maxZ + offset + pad,
    },
  }));
}

export function insideArchitecture(
  footprints: readonly ArchitectureFootprint[],
  x: number,
  z: number,
  radius = 0,
): boolean {
  return footprints.some((f) => {
    const dx = x - f.x,
      dz = z - f.z,
      c = Math.cos(f.rot),
      s = Math.sin(f.rot);
    const px = dx * c - dz * s,
      pz = dx * s + dz * c;
    const ex = Math.max(f.rect.minX - px, 0, px - f.rect.maxX),
      ez = Math.max(f.rect.minZ - pz, 0, pz - f.rect.maxZ);
    return ex * ex + ez * ez <= radius * radius;
  });
}

function corners(f: ArchitectureFootprint) {
  const c = Math.cos(f.rot),
    s = Math.sin(f.rot);
  return [
    [f.rect.minX, f.rect.minZ],
    [f.rect.minX, f.rect.maxZ],
    [f.rect.maxX, f.rect.maxZ],
    [f.rect.maxX, f.rect.minZ],
  ].map(([x, z]) => ({ x: f.x + x * c + z * s, z: f.z - x * s + z * c }));
}

/** Signed separation for oriented boxes, including their roof overhangs. */
export function architectureGap(a: ArchitectureFootprint, b: ArchitectureFootprint): number {
  const ac = corners(a),
    bc = corners(b);
  let separation = -Infinity;
  for (const angle of [a.rot, a.rot + Math.PI / 2, b.rot, b.rot + Math.PI / 2]) {
    const c = Math.cos(angle),
      s = -Math.sin(angle);
    const av = ac.map((p) => p.x * c + p.z * s),
      bv = bc.map((p) => p.x * c + p.z * s);
    separation = Math.max(
      separation,
      Math.min(...av) - Math.max(...bv),
      Math.min(...bv) - Math.max(...av),
    );
  }
  return separation;
}

/** Reserve the complete supported stair run and its approach for every doorway. */
export function architectureApproachFootprint(
  lot: Pick<WickharborLot, 'id' | 'x' | 'z' | 'w' | 'd' | 'rot'> & {
    metadata?: Pick<WickharborMetadata, 'footprint' | 'entrance' | 'modelScale'>;
  },
): ArchitectureFootprint {
  const metadata = lot.metadata ?? {},
    scale = metadata.modelScale ?? 1;
  const entry = metadata.entrance;
  const depth = metadata.footprint?.depth ?? lot.d;
  const front = (lot.d - depth) / 2 + (entry?.z ?? depth / 2);
  const x = entry?.x ?? 0;
  const halfWidth = Math.max(0.75 * scale, (entry?.width ?? 1.12 * scale) / 2 + 0.16 * scale);
  return {
    id: `${lot.id}:approach`,
    x: lot.x,
    z: lot.z,
    rot: lot.rot,
    rect: {
      minX: x - halfWidth,
      maxX: x + halfWidth,
      minZ: front,
      maxZ: front + (0.72 + NATIVE_ENTRANCE_MAX_TREADS * 0.3 + 0.9) * scale,
    },
  };
}

/** Conservative crown radius from the shipped geometry, including off-centre branches. */
export function settlementTreeRadius(
  tree: { scale?: number | number[] },
  bounds: { min: number[]; max: number[] },
): number {
  const scale = Array.isArray(tree.scale)
    ? tree.scale
    : [tree.scale ?? 1, tree.scale ?? 1, tree.scale ?? 1];
  const x = Math.max(Math.abs(bounds.min[0] * scale[0]), Math.abs(bounds.max[0] * scale[0]));
  const z = Math.max(Math.abs(bounds.min[2] * scale[2]), Math.abs(bounds.max[2] * scale[2]));
  return Math.max(2.5, Math.hypot(x, z) + 0.5);
}
