import * as THREE from 'three';
import { GALE_HARBOR_DECKS, galeDeckSurfaceAt } from '../sim/gale_harbor';
import { boardingHeight, wickharborBoardingRuns } from '../sim/wickharbor_boarding';
import { deckRailRuns } from './deck_render';
import { surfaceMat } from './gfx';
import { cloneMaterialWithHooks } from './material_clone_hooks';

/** Native pack timber and deck panels, with lightweight sagging rope spans. */
export function addWickharborPierDetails(
  group: THREE.Group,
  models: Readonly<Record<string, THREE.Group>>,
  terrain: (x: number, z: number) => number,
  water: number,
): void {
  const bounds = (id: string) => new THREE.Box3().setFromObject(models[id]);
  const deckBox = bounds('yard-deck');
  const ropeGeometry = new THREE.CylinderGeometry(0.032, 0.032, 1, 6);
  const pileGeometry = new THREE.CylinderGeometry(0.16, 0.19, 1, 10);
  let source: THREE.Material | undefined;
  let sourceGeometry: THREE.BufferGeometry | undefined;
  models['yard-post'].traverse((o) => {
    if (o instanceof THREE.Mesh && !source) {
      source = Array.isArray(o.material) ? o.material[0] : o.material;
      sourceGeometry = o.geometry;
    }
  });
  if (!source) throw new Error('Native pier timber unavailable');
  // The pack timber uses an atlas: side grain and end grain occupy separate
  // islands. Project those authored face islands onto the round pile, instead
  // of wrapping the entire atlas (including unrelated gray trim) around it.
  if (sourceGeometry) {
    const uv = sourceGeometry.getAttribute('uv'),
      normal = sourceGeometry.getAttribute('normal');
    const targetUv = pileGeometry.getAttribute('uv'),
      targetNormal = pileGeometry.getAttribute('normal');
    if (uv && normal) {
      for (const cap of [false, true]) {
        let u0 = Infinity,
          v0 = Infinity,
          u1 = -Infinity,
          v1 = -Infinity;
        for (let i = 0; i < uv.count; i++) {
          if (cap ? normal.getY(i) < 0.9 : normal.getX(i) < 0.9) continue;
          u0 = Math.min(u0, uv.getX(i));
          u1 = Math.max(u1, uv.getX(i));
          v0 = Math.min(v0, uv.getY(i));
          v1 = Math.max(v1, uv.getY(i));
        }
        if (!Number.isFinite(u0)) continue;
        for (let i = 0; i < targetUv.count; i++) {
          if (Math.abs(targetNormal.getY(i)) > 0.9 !== cap) continue;
          targetUv.setXY(i, u0 + (u1 - u0) * targetUv.getX(i), v0 + (v1 - v0) * targetUv.getY(i));
        }
      }
      targetUv.needsUpdate = true;
    }
  }
  // Native timber material needs its vertex-color switch cleared for new round piles.
  const pileMaterial = cloneMaterialWithHooks(source) as THREE.MeshStandardMaterial;
  pileMaterial.vertexColors = false;
  pileMaterial.name = 'Wickharbor round timber pile';
  // A clean surface avoids the post asset's atlas/vertex-color assumptions on rope UVs.
  const ropeMaterial = surfaceMat({ color: 0xc5aa79, roughness: 1, vertexColors: false });
  const up = new THREE.Vector3(0, 1, 0);
  function rope(a: THREE.Vector3, b: THREE.Vector3) {
    for (let i = 0; i < 6; i++) {
      const at = (t: number) =>
        a
          .clone()
          .lerp(b, t)
          .add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * 0.14, 0));
      const p = at(i / 6),
        q = at((i + 1) / 6),
        mesh = new THREE.Mesh(ropeGeometry, ropeMaterial);
      mesh.name = 'wickharbor:hemp-rope';
      mesh.position.copy(p).add(q).multiplyScalar(0.5);
      mesh.scale.y = p.distanceTo(q);
      mesh.quaternion.setFromUnitVectors(up, q.sub(p).normalize());
      group.add(mesh);
    }
  }
  function post(x: number, z: number, y: number) {
    const top = y + 1.1,
      base = Math.min(terrain(x, z) - 0.25, y - 0.5);
    const p = new THREE.Mesh(pileGeometry, pileMaterial);
    p.name = 'wickharbor:continuous-pile';
    p.userData.pileBase = base;
    p.userData.pileTop = top;
    p.scale.y = top - base;
    p.position.set(x, (top + base) / 2, z);
    group.add(p);
  }
  const gangways = wickharborBoardingRuns(terrain, water);
  // Include the gangway footprint in junction detection so no rope crosses its mouth.
  const openings = gangways.map((run) => {
    const dx = run.end.x - run.start.x,
      dz = run.end.z - run.start.z;
    return {
      x: (run.start.x + run.end.x) / 2,
      z: (run.start.z + run.end.z) / 2,
      rot: Math.atan2(dx, dz),
      hl: Math.hypot(dx, dz) / 2,
      hw: run.width / 2,
      ax: 0,
      az: 0,
    };
  });
  for (const d of GALE_HARBOR_DECKS) {
    const y0 = galeDeckSurfaceAt(d, -d.hl, terrain, water),
      y1 = galeDeckSurfaceAt(d, d.hl, terrain, water);
    if (Math.abs(y1 - y0) / (2 * d.hl) > 0.2) continue; // Native pack stair rails already supplied.
    for (const side of [-1, 1]) {
      for (const run of deckRailRuns(d, side, [...GALE_HARBOR_DECKS, ...openings])) {
        for (const p of run) post(p.x, p.z, galeDeckSurfaceAt(d, p.along, terrain, water) - 0.05);
        for (let i = 1; i < run.length; i++) {
          const a = run[i - 1],
            b = run[i];
          for (const lift of [0.52, 0.95])
            rope(
              new THREE.Vector3(a.x, galeDeckSurfaceAt(d, a.along, terrain, water) + lift, a.z),
              new THREE.Vector3(b.x, galeDeckSurfaceAt(d, b.along, terrain, water) + lift, b.z),
            );
        }
      }
    }
  }
  for (const run of gangways) {
    const dx = run.end.x - run.start.x,
      dz = run.end.z - run.start.z,
      length = Math.hypot(dx, dz),
      yaw = Math.atan2(dx, dz);
    const count = Math.ceil(length / 0.3);
    // Split exactly at the crest, preserving the continuous simulation surface.
    const stops = Array.from(
      new Set([...Array.from({ length: count + 1 }, (_, i) => i / count), 0.4, 0.83]),
    ).sort((a, b) => a - b);
    for (let i = 1; i < stops.length; i++) {
      const t0 = stops[i - 1],
        t1 = stops[i],
        y0 = boardingHeight(run, t0),
        y1 = boardingHeight(run, t1),
        span = length * (t1 - t0),
        tile = models['yard-deck'].clone(true),
        frame = new THREE.Group();
      const t = (t0 + t1) / 2;
      frame.position.set(run.start.x + dx * t, (y0 + y1) / 2, run.start.z + dz * t);
      frame.rotation.set(-Math.atan2(y1 - y0, span), yaw, 0, 'YXZ');
      tile.scale.set(
        run.width / (deckBox.max.x - deckBox.min.x),
        0.12 / (deckBox.max.y - deckBox.min.y),
        (Math.hypot(span, y1 - y0) + 0.035) / (deckBox.max.z - deckBox.min.z),
      );
      tile.position.set(
        (-(deckBox.min.x + deckBox.max.x) * tile.scale.x) / 2,
        -deckBox.max.y * tile.scale.y,
        (-(deckBox.min.z + deckBox.max.z) * tile.scale.z) / 2,
      );
      frame.add(tile);
      group.add(frame);
    }
  }
}
