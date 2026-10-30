import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { wickharborOcclusion } from '../src/render/wickharbor_occlusion';

describe('Wickharbor camera occlusion', () => {
  it('fades the obstructing shell independently and preserves its interior', () => {
    const shared = new THREE.MeshStandardMaterial(),
      geometry = new THREE.BoxGeometry(1, 1, 1);
    const first = new THREE.Group(),
      second = new THREE.Group();
    const wall = new THREE.Mesh(geometry, shared),
      neighbor = new THREE.Mesh(geometry, shared),
      furniture = new THREE.Mesh(geometry, shared);
    furniture.userData.innSection = 'interior';
    first.add(wall, furniture);
    second.add(neighbor);
    const view = wickharborOcclusion();
    const footprint = {
      x: 0,
      z: 0,
      halfWidth: 2,
      halfDepth: 3,
      cosine: 1,
      sine: 0,
      topY: 8,
      cullRadius: 4,
    };
    view.register(first, footprint);
    view.register(second, { ...footprint, x: 12 });
    view.update(new THREE.Vector3(0, 6, 6), new THREE.Vector3(0, 1.7, 0), 1, true);
    expect((wall.material as THREE.Material).opacity).toBeLessThan(0.5);
    expect((neighbor.material as THREE.Material).opacity).toBe(1);
    expect(furniture.material).toBe(shared);
    expect(shared.opacity).toBe(1);
    expect(wall.material).not.toBe(neighbor.material);
    view.update(new THREE.Vector3(60, 6, 60), new THREE.Vector3(60, 1.7, 60), 1, true);
    expect((wall.material as THREE.Material).opacity).toBe(1);
    expect((wall.material as THREE.Material).transparent).toBe(false);
  });
});
