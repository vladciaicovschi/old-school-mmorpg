import * as THREE from 'three';
import { type CutawayBounds, type CutawayShape, cutawayPartKey } from './visibility_core';

export interface CutawayTemplate {
  geometry: THREE.BufferGeometry;
  key: string;
  bounds: CutawayBounds;
}
export type CutawayGeometryCache = WeakMap<THREE.BufferGeometry, Map<string, CutawayTemplate[]>>;

/** Compact vertex subsets, retaining every source attribute and material group. */
export function partitionCutawayGeometry(
  source: THREE.BufferGeometry,
  relative: THREE.Matrix4,
  shape: CutawayShape,
  role: string,
  cache: CutawayGeometryCache,
): CutawayTemplate[] {
  const signature = JSON.stringify([
    relative.elements.map((v) => Math.round(v * 1e6)),
    shape,
    role,
  ]);
  let cached = cache.get(source);
  if (!cached) {
    cached = new Map();
    cache.set(source, cached);
  }
  const known = cached.get(signature);
  if (known) return known;
  const position = source.getAttribute('position'),
    index = source.getIndex();
  const bins = new Map<
    string,
    { vertices: number[]; materials: number[]; bounds: CutawayBounds }
  >();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const count = index?.count ?? position.count,
    start = source.drawRange.start,
    end = Math.min(count, start + source.drawRange.count);
  for (let i = start; i + 2 < end; i += 3) {
    const ia = index ? index.getX(i) : i,
      ib = index ? index.getX(i + 1) : i + 1,
      ic = index ? index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(position, ia).applyMatrix4(relative);
    b.fromBufferAttribute(position, ib).applyMatrix4(relative);
    c.fromBufferAttribute(position, ic).applyMatrix4(relative);
    const key = cutawayPartKey(
      (a.x + b.x + c.x) / 3,
      (a.y + b.y + c.y) / 3,
      (a.z + b.z + c.z) / 3,
      shape,
      role,
    );
    let bin = bins.get(key);
    if (!bin) {
      bin = {
        vertices: [],
        materials: [],
        bounds: {
          minX: Infinity,
          maxX: -Infinity,
          minY: Infinity,
          maxY: -Infinity,
          minZ: Infinity,
          maxZ: -Infinity,
        },
      };
      bins.set(key, bin);
    }
    bin.vertices.push(ia, ib, ic);
    const group = source.groups.find((g) => i >= g.start && i < g.start + g.count);
    bin.materials.push(group?.materialIndex ?? 0);
    for (const p of [a, b, c]) {
      const v = bin.bounds;
      v.minX = Math.min(v.minX, p.x);
      v.maxX = Math.max(v.maxX, p.x);
      v.minY = Math.min(v.minY, p.y);
      v.maxY = Math.max(v.maxY, p.y);
      v.minZ = Math.min(v.minZ, p.z);
      v.maxZ = Math.max(v.maxZ, p.z);
    }
  }
  const templates: CutawayTemplate[] = [];
  for (const [key, bin] of bins) {
    if (bins.size === 1 && start === 0 && end === count) {
      templates.push({ key, geometry: source, bounds: bin.bounds });
      continue;
    }
    const geometry = new THREE.BufferGeometry(),
      mapping = new Map<number, number>(),
      originals: number[] = [],
      indices: number[] = [];
    for (const id of bin.vertices) {
      if (!mapping.has(id)) {
        mapping.set(id, mapping.size);
        originals.push(id);
      }
      indices.push(mapping.get(id)!);
    }
    for (const [name, attribute] of Object.entries(source.attributes)) {
      const Component = attribute.array.constructor as { new (length: number): THREE.TypedArray };
      const array = new Component(originals.length * attribute.itemSize);
      for (let i = 0; i < originals.length; i++)
        for (let lane = 0; lane < attribute.itemSize; lane++) {
          array[i * attribute.itemSize + lane] =
            attribute instanceof THREE.InterleavedBufferAttribute
              ? attribute.data.array[originals[i] * attribute.data.stride + attribute.offset + lane]
              : attribute.array[originals[i] * attribute.itemSize + lane];
        }
      const compact =
        attribute instanceof THREE.Float16BufferAttribute
          ? new THREE.Float16BufferAttribute(array, attribute.itemSize, attribute.normalized)
          : new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized);
      if (attribute instanceof THREE.BufferAttribute) compact.gpuType = attribute.gpuType;
      geometry.setAttribute(name, compact);
    }
    geometry.setIndex(indices);
    if (source.groups.length) {
      let from = 0;
      for (let i = 1; i <= bin.materials.length; i++)
        if (bin.materials[i] !== bin.materials[from]) {
          geometry.addGroup(from * 3, (i - from) * 3, bin.materials[from]);
          from = i;
        }
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    templates.push({ key, geometry, bounds: bin.bounds });
  }
  cached.set(signature, templates);
  return templates;
}
