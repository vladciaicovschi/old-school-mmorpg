import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildingCutaway } from '../src/render/building_cutaway';
import { partitionCutawayGeometry } from '../src/render/building_cutaway/geometry';
import { settlementScene } from './helpers/settlement_scene';

const root = path.resolve(import.meta.dirname, '..');
function meshes(group: THREE.Group): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) result.push(o);
  });
  return result;
}
const triangles = (group: THREE.Group) =>
  meshes(group).reduce(
    (n, mesh) =>
      n + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3,
    0,
  );
const attributeTriangles = (group: THREE.Group, name: string) =>
  meshes(group)
    .filter((m) => m.geometry.hasAttribute(name))
    .reduce(
      (n, mesh) =>
        n + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3,
      0,
    );
const footprint = {
  x: 0,
  z: 0,
  halfWidth: 3,
  halfDepth: 4,
  cosine: 1,
  sine: 0,
  topY: 16,
  cullRadius: 7,
};

describe('selective cutaway on shipped building geometry', () => {
  it('keeps the Wolf Run barracks furniture and stairs visible during cutaway', async () => {
    const barracks = await settlementScene(path.join(root, 'public/models/wolf_run_fort/barracks.glb'));
    const protectedMeshes: THREE.Mesh[] = [];
    barracks.traverse((node) => {
      if (['stairs', 'ground-furniture', 'upper-furniture'].includes(node.userData.section))
        node.traverse((child) => { if (child instanceof THREE.Mesh) protectedMeshes.push(child); });
    });
    expect(protectedMeshes.length).toBeGreaterThan(2);
    const view = buildingCutaway();
    view.register(barracks, footprint);
    view.update(new THREE.Vector3(0, 4, 12), new THREE.Vector3(0, 1.7, 0), 0.016);
    expect(protectedMeshes.every((m) => m.userData.cutawayPart === undefined)).toBe(true);
    expect(meshes(barracks).some((m) => m.userData.cutawayHidden)).toBe(true);
  });
  it('preserves packed normalized attributes, UVs and multi-material groups exactly', () => {
    const source = new THREE.BoxGeometry(6, 3, 8).translate(0, 1.5, 0),
      position = source.getAttribute('position');
    const bytes = new Uint8Array(position.count * 4);
    for (let i = 0; i < position.count; i++) {
      bytes[i * 4] = i;
      bytes[i * 4 + 1] = 127;
      bytes[i * 4 + 2] = 255;
      bytes[i * 4 + 3] = 220;
    }
    source.setAttribute('color', new THREE.BufferAttribute(bytes, 4, true));
    const pieces = partitionCutawayGeometry(
      source,
      new THREE.Matrix4(),
      {
        radial: false,
        wings: [{ id: 'main', x: 0, z: 0, halfWidth: 3, halfDepth: 4, roofY: 3, storeyHeight: 3 }],
      },
      '',
      new WeakMap(),
    );
    expect(pieces.length).toBeGreaterThan(3);
    let indices = 0,
      groupIndices = 0;
    for (const piece of pieces) {
      const color = piece.geometry.getAttribute('color'),
        uv = piece.geometry.getAttribute('uv'),
        p = piece.geometry.getAttribute('position');
      expect(color.array).toBeInstanceOf(Uint8Array);
      expect(color.normalized).toBe(true);
      expect(color.itemSize).toBe(4);
      for (let i = 0; i < color.count; i++) {
        const original = Math.round(color.getX(i) * 255);
        expect(p.getX(i)).toBe(position.getX(original));
        expect(p.getY(i)).toBe(position.getY(original));
        expect(p.getZ(i)).toBe(position.getZ(original));
        expect(uv.getX(i)).toBe(source.getAttribute('uv').getX(original));
        expect(uv.getY(i)).toBe(source.getAttribute('uv').getY(original));
      }
      indices += piece.geometry.index!.count;
      groupIndices += piece.geometry.groups.reduce((n, g) => n + g.count, 0);
    }
    expect(indices).toBe(source.index!.count);
    expect(groupIndices).toBe(indices);
    expect(source.getAttribute('color').array).toBe(bytes);
  });
  it('partitions the merged home without losing triangles, source attributes or cache sharing', async () => {
    const source = await settlementScene(path.join(root, 'public/models/wickharbor/home.glb'));
    const original = meshes(source).map((m) => ({
      geometry: m.geometry,
      array: m.geometry.getAttribute('position').array.slice(),
    }));
    const first = source.clone(true),
      second = source.clone(true);
    second.position.x = 30;
    const before = triangles(source),
      view = buildingCutaway();
    view.register(first, footprint);
    view.register(second, { ...footprint, x: 30 });
    expect(triangles(first)).toBe(before);
    expect(triangles(second)).toBe(before);
    for (const name of ['uv', 'normal', 'color'])
      expect(attributeTriangles(first, name)).toBe(attributeTriangles(source, name));
    const a = meshes(first),
      b = meshes(second);
    expect(a.length).toBeLessThan(100);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].geometry).toBe(b[i].geometry);
      expect(a[i].geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true);
    }
    view.update(new THREE.Vector3(0, 3, 12), new THREE.Vector3(0, 1.7, 0), 0.016);
    const cut = a.filter((m) => m.userData.cutawayHidden);
    expect(cut.some((m) => m.userData.cutawayPart.includes(':wall:front:'))).toBe(true);
    expect(
      a
        .filter((m) => m.userData.cutawayPart?.includes(':wall:back:'))
        .every((m) => !m.userData.cutawayHidden),
    ).toBe(true);
    expect(meshes(second).every((m) => !m.userData.cutawayHidden)).toBe(true);
    expect(original.map((o) => o.geometry.getAttribute('position').array)).toEqual(
      original.map((o) => o.array),
    );
  });
  it('preserves chapel furniture and partitions the attached bell tower separately', async () => {
    const chapel = await settlementScene(
      path.join(root, 'public/models/settlements/eastbrook_chapel.glb'),
    );
    const view = buildingCutaway(),
      furniture = chapel.children.filter((n) => n.userData.civicRole === 'chapel-interior');
    expect(furniture.length).toBeGreaterThan(0);
    view.register(chapel, { ...footprint, halfWidth: 4, halfDepth: 6 });
    view.update(new THREE.Vector3(0, 5, 16), new THREE.Vector3(0, 1.7, 0), 0.016);
    for (const group of furniture)
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          expect(o.userData.cutawayPart).toBeUndefined();
          expect((o.material as THREE.Material).colorWrite).toBe(true);
        }
      });
    expect(meshes(chapel).some((m) => m.userData.cutawayPart?.startsWith('tower:wall:'))).toBe(
      true,
    );
  });
  it('opens a near sector of the lighthouse while retaining its opposite shell and spiral stairs', async () => {
    const lighthouse = await settlementScene(
      path.join(root, 'public/models/wickharbor/lighthouse_round.glb'),
    );
    const before = triangles(lighthouse),
      view = buildingCutaway();
    view.register(lighthouse, footprint);
    view.update(new THREE.Vector3(0, 3, 12), new THREE.Vector3(0, 1.7, 0), 0.016);
    expect(triangles(lighthouse)).toBe(before);
    const shell = meshes(lighthouse).filter((m) =>
      m.userData.cutawayPart?.includes(':wall:sector-'),
    );
    expect(shell.length).toBeGreaterThan(12);
    expect(shell.filter((m) => m.userData.cutawayHidden).length).toBeGreaterThan(0);
    expect(shell.filter((m) => !m.userData.cutawayHidden).length).toBeGreaterThan(shell.length / 2);
    const stairs: THREE.Mesh[] = [];
    lighthouse.traverse((o) => {
      if (o.userData.role === 'spiral-tread')
        o.traverse((p) => {
          if (p instanceof THREE.Mesh) stairs.push(p);
        });
    });
    expect(stairs.length).toBeGreaterThan(50);
    expect(stairs.every((m) => !m.userData.cutawayHidden)).toBe(true);
  });
});
