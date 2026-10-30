import * as THREE from 'three';
import { hash2 } from '../sim/rng';
import { terrainHeight } from '../sim/world';
import { GFX } from './gfx';
import { buildWickharborTown, wickharborPreloadInternalsForTest } from './wickharbor_town';

export const galeFeaturesPreloadInternalsForTest = {
  towerAssetUrl: wickharborPreloadInternalsForTest.assetUrls,
};

export interface GaleFeaturesView {
  group: THREE.Group;
  glowLights: THREE.PointLight[];
  cullGroups: THREE.Group[];
  dispose(): void;
  update(
    time: number,
    camera: THREE.Camera,
    eye: THREE.Vector3,
    dt: number,
    reducedMotion?: boolean,
  ): void;
}

const BEACON = { x: 498, z: 308 };
// hull ribs on the Wreckfields beach: position, heading, rib count, size
const WRECKS = [
  { x: 322, z: 656, rot: 0.7, ribs: 7, r: 5.2 },
  { x: 356, z: 666, rot: -0.9, ribs: 5, r: 3.8 },
  { x: 300, z: 634, rot: 2.2, ribs: 6, r: 4.4 },
] as const;

function mat(color: number, rough = 0.85): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
  return GFX.standardMaterials
    ? new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true })
    : new THREE.MeshLambertMaterial({ color, flatShading: true });
}

export function buildGaleFeatures(seed: number): GaleFeaturesView {
  const group = new THREE.Group();
  group.name = 'gale-features';
  const town = buildWickharborTown(seed);
  group.add(town.group);
  const cullGroups = [...town.cullGroups];
  const glowLights: THREE.PointLight[] = [];

  // The rebuilt round plaster lighthouse retains its turning beacon.
  const beaconY = terrainHeight(BEACON.x, BEACON.z, seed);
  const beam = new THREE.Group();
  {
    const lampY = beaconY + 20.6;
    // the turning light: two opposed additive cones riding a pivot. Real-beam
    // treatment: per-vertex alpha runs each cone from a hot core at the lamp
    // to nothing at its mouth, so the beam melts into the night instead of
    // ending in a hard elliptical cap (the open mouth's far wall used to read
    // as one), and the HDR material color pushes the near-lamp core over the
    // bloom threshold so the light genuinely glares on composer tiers.
    const beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffe9a8).multiplyScalar(2.1), // HDR, pre-tonemap
      transparent: true,
      opacity: 0.45,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    for (const flip of [1, -1]) {
      // 8 height segments so the alpha falloff curve interpolates smoothly
      const coneGeo = new THREE.ConeGeometry(4.2, 60, 12, 8, true);
      const conePos = coneGeo.getAttribute('position');
      const fade = new Float32Array(conePos.count * 4);
      for (let vi = 0; vi < conePos.count; vi++) {
        // apex (+y, at the lamp) alpha 1; mouth (-y) alpha 0, eased so the
        // core stays hot and the tail falls off long and soft
        const along = (conePos.getY(vi) + 30) / 60;
        const a = along ** 1.6;
        fade[vi * 4 + 0] = 1;
        fade[vi * 4 + 1] = 1;
        fade[vi * 4 + 2] = 1;
        fade[vi * 4 + 3] = a;
      }
      coneGeo.setAttribute('color', new THREE.BufferAttribute(fade, 4));
      const cone = new THREE.Mesh(coneGeo, beamMat);
      cone.rotation.z = (flip * Math.PI) / 2;
      cone.position.x = flip * 30;
      beam.add(cone);
    }
    beam.position.set(BEACON.x, lampY, BEACON.z);
    group.add(beam);
    cullGroups.push(beam);
    const light = new THREE.PointLight(0xffd890, 5, 40, 2);
    light.position.set(BEACON.x, lampY, BEACON.z);
    light.userData.baseIntensity = 5;
    glowLights.push(light);
    group.add(light);
  }

  // --- the Wreckfields: hull ribs arcing out of the shingle ---
  {
    const ribGeo = new THREE.TorusGeometry(1, 0.08, 5, 10, Math.PI);
    const ribMat = mat(0x5a5048, 0.9);
    let count = 0;
    for (const w of WRECKS) count += w.ribs;
    const mesh = new THREE.InstancedMesh(ribGeo.toNonIndexed(), ribMat, count);
    const m = new THREE.Matrix4();
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let i = 0;
    for (const w of WRECKS) {
      const dx = Math.sin(w.rot);
      const dz = Math.cos(w.rot);
      for (let k = 0; k < w.ribs; k++) {
        const t = (k - (w.ribs - 1) / 2) * 1.7;
        const x = w.x + dx * t;
        const z = w.z + dz * t;
        const y = terrainHeight(x, z, seed);
        // ribs shrink toward bow and stern, like a keel picked clean
        const shape = 1 - Math.abs(k - (w.ribs - 1) / 2) / w.ribs;
        const r = w.r * (0.6 + shape * 0.5);
        q.setFromEuler(e.set(0, w.rot + Math.PI / 2, (hash2(x, z, seed + 7401) - 0.5) * 0.24));
        v.set(x, y - 0.4, z);
        sc.set(r, r, r);
        mesh.setMatrixAt(i, m.compose(v, q, sc));
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    const wreckGroup = new THREE.Group();
    wreckGroup.name = 'gale-wreckfields';
    wreckGroup.add(mesh);
    group.add(wreckGroup);
    cullGroups.push(wreckGroup);
  }

  return {
    group,
    glowLights,
    cullGroups,
    dispose: town.dispose,
    update(time, camera, eye, dt, reducedMotion): void {
      town.update(camera.position, eye, dt, reducedMotion);
      // the beacon turns, slow and steady, the way it always has
      beam.rotation.y = time * 0.45;
    },
  };
}
