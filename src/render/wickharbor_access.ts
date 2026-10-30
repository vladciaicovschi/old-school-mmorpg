import * as THREE from 'three';
import { WICKHARBOR_ACCESS, WICKHARBOR_METADATA } from '../sim/wickharbor_layout';
import { cloneMaterialWithHooks } from './material_clone_hooks';

/** Native timber pieces adapted to the full game character's head clearance. */
export function adaptWickharborAccess(models: Record<string, THREE.Group>): void {
  const chapel = models['civic-chapel'],
    tower = WICKHARBOR_METADATA['civic-chapel'].bellTower!;
  const removed: THREE.Object3D[] = [];
  chapel.traverse((object) => {
    if (['tower-platform', 'tower-rail'].includes(object.userData.civicRole)) removed.push(object);
  });
  for (const object of removed) object.removeFromParent();
  function fitNativePiece(
    id: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    yaw = 0,
  ) {
    const object = models[id].clone(true),
      bounds = new THREE.Box3().setFromObject(object);
    object.scale.set(
      w / (bounds.max.x - bounds.min.x),
      h / (bounds.max.y - bounds.min.y),
      d / (bounds.max.z - bounds.min.z),
    );
    object.position.set(
      (-(bounds.min.x + bounds.max.x) / 2) * object.scale.x,
      (-(bounds.min.y + bounds.max.y) / 2) * object.scale.y,
      (-(bounds.min.z + bounds.max.z) / 2) * object.scale.z,
    );
    const frame = new THREE.Group();
    frame.userData.civicRole = id === 'yard-deck' ? 'tower-platform' : 'tower-rail';
    frame.position.set(x, y, z);
    frame.rotation.y = yaw;
    frame.add(object);
    chapel.add(frame);
  }
  const half = tower.width / 2,
    holes = tower.stairwell;
  const xs = [...new Set([-half, half, ...holes.flatMap((r) => [r.minX, r.maxX])])].sort(
    (a, b) => a - b,
  );
  const zs = [...new Set([-half, half, ...holes.flatMap((r) => [r.minZ, r.maxZ])])].sort(
    (a, b) => a - b,
  );
  for (let i = 1; i < xs.length; i++)
    for (let j = 1; j < zs.length; j++) {
      const x = (xs[i - 1] + xs[i]) / 2,
        z = (zs[j - 1] + zs[j]) / 2;
      if (holes.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ)) continue;
      fitNativePiece(
        'yard-deck',
        x,
        tower.platformY - 0.04,
        tower.centerZ + z,
        xs[i] - xs[i - 1],
        0.08,
        zs[j] - zs[j - 1],
      );
    }
  const rail = (x: number, z: number, length: number, yaw = 0) =>
    fitNativePiece(
      'yard-fence',
      x,
      tower.platformY + 0.51,
      tower.centerZ + z,
      length,
      1,
      0.13,
      yaw,
    );
  for (const z of [-half + 0.08, half - 0.08]) rail(0, z, tower.width - 0.16);
  for (const x of [-half + 0.08, half - 0.08]) rail(x, 0, tower.width - 0.16, Math.PI / 2);
  rail(0.04, -0.8, 1.82);
  rail(
    -0.8,
    (-0.87 + WICKHARBOR_ACCESS.chapelWellEnd) / 2,
    WICKHARBOR_ACCESS.chapelWellEnd + 0.87,
    Math.PI / 2,
  );
  rail(-1.445, WICKHARBOR_ACCESS.chapelWellEnd + 0.07, 1.15);

  const lighthouse = models['lighthouse-round'],
    stairs = WICKHARBOR_METADATA['lighthouse-round'].staircase!;
  lighthouse.updateWorldMatrix(true, true);
  let index = 0;
  lighthouse.traverse((object) => {
    if (object.userData.role !== 'spiral-tread' || index++ >= WICKHARBOR_ACCESS.entryTreads) return;
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry = child.geometry.clone();
      const position = child.geometry.getAttribute('position'),
        result: number[] = [];
      const inverse = child.matrixWorld.clone().invert(),
        point = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
        const r = Math.hypot(point.x, point.z),
          target =
            stairs.inner +
            ((r - stairs.inner) * (WICKHARBOR_ACCESS.entryOuterRadius - stairs.inner)) /
              (stairs.outer - stairs.inner);
        if (r > 0) {
          point.x *= target / r;
          point.z *= target / r;
        }
        point.applyMatrix4(inverse);
        result.push(point.x, point.y, point.z);
      }
      child.geometry.setAttribute('position', new THREE.Float32BufferAttribute(result, 3));
      child.geometry.computeVertexNormals();
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();
    });
  });
  const replace: THREE.Object3D[] = [];
  let deckMaterial: THREE.Material | undefined, guardMaterial: THREE.Material | undefined;
  lighthouse.traverse((object) => {
    if (!['gallery-deck', 'stairwell-guard'].includes(object.userData.role)) return;
    replace.push(object);
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = Array.isArray(child.material) ? child.material[0] : child.material;
      if (object.userData.role === 'gallery-deck') deckMaterial ??= material;
      else guardMaterial ??= material;
    });
  });
  for (const object of replace) object.removeFromParent();
  if (!deckMaterial || !guardMaterial)
    throw new Error('Lighthouse gallery source materials unavailable');
  const start = stairs.endAngle - WICKHARBOR_ACCESS.galleryHoleTreads * stairs.angleStep;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 3.7, 0, Math.PI * 2, false);
  const hole = new THREE.Path(),
    outline: THREE.Vector2[] = [];
  for (const [radius, reverse] of [
    [2.66, false],
    [1.1, true],
  ] as const)
    for (let i = 0; i <= 60; i++) {
      const a = start + ((stairs.endAngle - start) * (reverse ? 60 - i : i)) / 60;
      outline.push(new THREE.Vector2(Math.sin(a) * radius, -Math.cos(a) * radius));
    }
  hole.setFromPoints(outline);
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.24,
    bevelEnabled: false,
    curveSegments: 96,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 18.76, 0);
  const uv = geometry.getAttribute('uv'),
    p = geometry.getAttribute('position');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
  const material = cloneMaterialWithHooks(deckMaterial);
  (material as THREE.MeshStandardMaterial).vertexColors = false;
  const deck = new THREE.Mesh(geometry, material);
  deck.castShadow = deck.receiveShadow = true;
  deck.name = 'wickharbor-gallery-headroom';
  deck.userData.role = 'gallery-deck';
  lighthouse.add(deck);
  const points = Array.from({ length: 61 }, (_, i) => {
    const a = start + ((stairs.endAngle - start) * i) / 60;
    return new THREE.Vector3(Math.sin(a) * 2.69, 19.95, Math.cos(a) * 2.69);
  });
  const guard = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 80, 0.035, 6, false),
    guardMaterial,
  );
  guard.castShadow = guard.receiveShadow = true;
  guard.userData.role = 'stairwell-guard';
  lighthouse.add(guard);
}
