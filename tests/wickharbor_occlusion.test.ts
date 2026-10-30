import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it, vi } from 'vitest';
import { wickharborOcclusion } from '../src/render/wickharbor_occlusion';

const footprint = {
  x: 0,
  z: 0,
  halfWidth: 3,
  halfDepth: 4,
  cosine: 1,
  sine: 0,
  topY: 7,
  cullRadius: 6,
};
function house(shared = new THREE.MeshStandardMaterial()) {
  const root = new THREE.Group();
  root.userData = { footprint: { width: 6, depth: 8 }, facades: [{ level: 0 }], storeyHeight: 3 };
  const parts = [
    new THREE.BoxGeometry(6, 3, 0.2).translate(0, 1.5, 4),
    new THREE.BoxGeometry(6, 3, 0.2).translate(0, 1.5, -4),
    new THREE.BoxGeometry(0.2, 3, 8).translate(3, 1.5, 0),
    new THREE.BoxGeometry(0.2, 3, 8).translate(-3, 1.5, 0),
    new THREE.BoxGeometry(6, 0.04, 8),
    new THREE.BoxGeometry(6, 0.1, 8).translate(0, 3.5, 0),
  ];
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  const shell = new THREE.Mesh(merged, shared);
  shell.castShadow = true;
  root.add(shell);
  const furniture = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), shared);
  furniture.userData.civicRole = 'chapel-interior';
  root.add(furniture);
  return { root, shell, furniture, shared };
}
const pieces = (root: THREE.Group, part: string) => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.cutawayPart?.includes(part)) out.push(o);
  });
  return out;
};
const hidden = (root: THREE.Group, part: string) =>
  pieces(root, part).filter((p) => p.userData.cutawayHidden);

describe('Wickharbor selective camera cutaway', () => {
  it('drains other resources when one disposal listener fails and permits retry', () => {
    const { root, shell } = house(),
      view = wickharborOcclusion();
    view.register(root, footprint);
    const geometries = [...new Set(pieces(root, ':').map((m) => m.geometry))],
      calls = geometries.map((g) => vi.spyOn(g, 'dispose'));
    view.update(new THREE.Vector3(0, 2, 12), new THREE.Vector3(0, 1.7, 0), 0.016);
    const material = hidden(root, ':wall:front:')[0].material as THREE.Material;
    const disposal = vi.spyOn(material, 'dispose').mockImplementationOnce(() => {
      throw new Error('fixture listener');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => view.dispose()).not.toThrow();
      expect(error).toHaveBeenCalledOnce();
      for (const call of calls) expect(call).toHaveBeenCalledOnce();
      expect(root.children).toContain(shell);
      view.dispose();
      expect(disposal).toHaveBeenCalledTimes(2);
      for (const call of calls) expect(call).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
    }
  });
  it('releases owned pieces once and restores the original graph without disposing shared assets', () => {
    const { root, shell, shared } = house(),
      view = wickharborOcclusion();
    const sharedDispose = vi.spyOn(shared, 'dispose'),
      sourceDispose = vi.spyOn(shell.geometry, 'dispose');
    view.register(root, footprint);
    const derived = pieces(root, ':')
      .map((m) => m.geometry)
      .filter((g) => g !== shell.geometry);
    const geometryDisposals = [...new Set(derived)].map((g) => vi.spyOn(g, 'dispose'));
    view.update(new THREE.Vector3(0, 2, 12), new THREE.Vector3(0, 1.7, 0), 0.016);
    const material = hidden(root, ':wall:front:')[0].material as THREE.Material;
    const materialDispose = vi.spyOn(material, 'dispose');
    view.dispose();
    view.dispose();
    view.update(new THREE.Vector3(0, 2, 12), new THREE.Vector3(0, 1.7, 0), 0.016);
    expect(root.children).toContain(shell);
    expect(materialDispose).toHaveBeenCalledOnce();
    for (const dispose of geometryDisposals) expect(dispose).toHaveBeenCalledOnce();
    expect(sharedDispose).not.toHaveBeenCalled();
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(shell.material).toBe(shared);
  });
  it('cuts the near facade of a material-merged house, preserving the opposite walls and interior', () => {
    const { root, shared, shell, furniture } = house(),
      neighbor = house(shared);
    const source = shell.geometry.getAttribute('position').array.slice();
    neighbor.root.position.x = 30;
    const view = wickharborOcclusion();
    view.register(root, footprint);
    view.register(neighbor.root, { ...footprint, x: 30 });
    view.update(new THREE.Vector3(0, 2, 12), new THREE.Vector3(0, 1.7, 0), 1, true);
    expect(hidden(root, ':wall:front:').length).toBeGreaterThan(0);
    expect(hidden(root, ':wall:back:')).toHaveLength(0);
    expect(hidden(root, ':wall:left:')).toHaveLength(0);
    expect(hidden(root, ':wall:right:')).toHaveLength(0);
    expect(hidden(root, ':floor:0')).toHaveLength(0);
    expect(hidden(neighbor.root, ':wall:')).toHaveLength(0);
    expect(furniture.material).toBe(shared);
    expect(furniture.userData.cutawayPart).toBeUndefined();
    expect(shared.transparent).toBe(false);
    expect(shared.opacity).toBe(1);
    expect(shared.colorWrite).toBe(true);
    for (const piece of hidden(root, ':wall:front:')) {
      expect((piece.material as THREE.Material).colorWrite).toBe(false);
      expect((piece.material as THREE.Material).depthWrite).toBe(false);
      expect((piece.material as THREE.Material).transparent).toBe(false);
      expect((piece.material as THREE.Material).opacity).toBe(1);
      expect(piece.castShadow).toBe(true);
      expect(piece.visible).toBe(true);
    }
    expect(shell.geometry.getAttribute('position').array).toEqual(source);
    view.update(new THREE.Vector3(12, 2, 0), new THREE.Vector3(0, 1.7, 0), 0.016);
    expect(hidden(root, ':wall:front:')).toHaveLength(0);
    expect(hidden(root, ':wall:right:').length).toBeGreaterThan(0);
    view.update(new THREE.Vector3(100, 8, 100), new THREE.Vector3(100, 1.7, 100), 1);
    expect(hidden(root, ':wall:')).toHaveLength(0);
    for (const piece of pieces(root, ':wall:')) expect(piece.material).toBe(shared);
  });
  it('cuts the crossed roof without removing the supporting floor', () => {
    const { root } = house(),
      view = wickharborOcclusion();
    view.register(root, footprint);
    view.update(new THREE.Vector3(0, 10, 5), new THREE.Vector3(0, 1.7, 0), 0.016);
    expect(hidden(root, ':roof:').length).toBeGreaterThan(0);
    expect(hidden(root, ':floor:0')).toHaveLength(0);
  });
  it('follows rotated, scaled and translated building transforms', () => {
    const { root } = house();
    root.position.set(42, 7, -20);
    root.rotation.y = Math.PI / 2;
    root.scale.setScalar(1.5);
    const view = wickharborOcclusion();
    view.register(root, { ...footprint, x: 42, z: -20 });
    view.update(
      root.localToWorld(new THREE.Vector3(0, 2, 12)),
      root.localToWorld(new THREE.Vector3(0, 1.7, 0)),
      0.016,
    );
    expect(hidden(root, ':wall:front:').length).toBeGreaterThan(0);
    expect(hidden(root, ':wall:back:')).toHaveLength(0);
  });
});
