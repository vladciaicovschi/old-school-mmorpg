import { page } from '@vitest/browser/context';
import * as THREE from 'three';
import { expect, it } from 'vitest';
import { loadGltf } from '../../src/render/assets/loader';
import { propPreloadInternalsForTest } from '../../src/render/props';
import { buildWickharborYards } from '../../src/render/wickharbor_yards';
import {
  GALE_HARBOR_DECKS,
  GALE_HARBOR_JUNCTIONS,
  galeDeckSurface,
} from '../../src/sim/gale_harbor';
import { isWickharborShip, wickharborBoardingRuns } from '../../src/sim/wickharbor_boarding';
import { WICKHARBOR_PIER_CARGO, wickharborCargoSurface } from '../../src/sim/wickharbor_pier_cargo';
import { WICKHARBOR_VESSELS } from '../../src/sim/wickharbor_vessels';
import { terrainHeight, WATER_LEVEL } from '../../src/sim/world';
import { WORLD_SEED } from '../../src/sim/world_seed';

it('renders the shipping pier kit, gangways and cargo with real compressed textures', async () => {
  await page.viewport(1200, 740);
  document.body.style.margin = '0';
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  canvas.style.display = 'block';
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(1200, 740);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa3bac0);
  scene.fog = new THREE.Fog(0xa3bac0, 150, 450);
  scene.add(new THREE.HemisphereLight(0xdaedff, 0x8e775e, 2.8));
  const sun = new THREE.DirectionalLight(0xffedcf, 3);
  sun.position.set(470, 60, 350);
  scene.add(sun);
  const terrain = (x: number, z: number) => terrainHeight(x, z, WORLD_SEED);
  const ids = [
    'yard-post',
    'yard-deck',
    'yard-fence',
    'yard-bench',
    'fixture-well',
    'fixture-monument',
  ];
  const models = Object.fromEntries(
    await Promise.all(
      ids.map(async (id) => [
        id,
        (await loadGltf(`/models/wickharbor/${id.replaceAll('-', '_')}.glb`)).scene,
      ]),
    ),
  );
  const yards = buildWickharborYards([], new Map(), models, terrain);
  scene.add(yards);
  yards.updateWorldMatrix(true, true);
  for (const joint of GALE_HARBOR_JUNCTIONS) {
    const inset = (index: number) => {
      const d = GALE_HARBOR_DECKS[index],
        dx = d.x - joint.x,
        dz = d.z - joint.z,
        length = Math.hypot(dx, dz);
      return new THREE.Vector3(joint.x + (dx / length) * 0.8, 0, joint.z + (dz / length) * 0.8);
    };
    const from = inset(joint.a),
      to = inset(joint.b);
    for (const t of [0, 0.23, 0.5, 0.77, 1]) {
      const p = from.clone().lerp(to, t),
        y = galeDeckSurface(p.x, p.z, terrain, WATER_LEVEL);
      expect(Number.isFinite(y)).toBe(true);
      const hit = new THREE.Raycaster(
        new THREE.Vector3(p.x, y + 1, p.z),
        new THREE.Vector3(0, -1, 0),
        0,
        2,
      ).intersectObject(yards, true)[0];
      expect(hit, `Missing plank at joint ${joint.a}/${joint.b}, t ${t}`).toBeDefined();
      expect(
        Math.abs(hit.point.y - y),
        `joint ${joint.a}/${joint.b} ${JSON.stringify({ t, x: p.x, z: p.z, y, actual: hit.point.y })}`,
      ).toBeLessThan(0.19);
    }
    const height =
      Math.max(
        galeDeckSurface(from.x, from.z, terrain, WATER_LEVEL),
        galeDeckSurface(to.x, to.z, terrain, WATER_LEVEL),
      ) + 0.7;
    from.y = height;
    to.y = height;
    const direction = to.clone().sub(from),
      length = direction.length();
    expect(
      new THREE.Raycaster(from, direction.normalize(), 0, length).intersectObject(yards, true),
      `Guard blocks joint ${joint.a}/${joint.b}`,
    ).toHaveLength(0);
  }
  async function prop(
    url: string,
    placement: { x: number; z: number; rot?: number; scale?: number },
    y: number,
    yaw = 0,
  ) {
    const native = (await loadGltf(url)).scene.clone(true),
      frame = new THREE.Group();
    native.rotation.y = yaw;
    native.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(native),
      center = box.getCenter(new THREE.Vector3());
    native.position.set(-center.x, -box.min.y, -center.z);
    frame.add(native);
    frame.position.set(placement.x, y, placement.z);
    frame.rotation.y = placement.rot ?? 0;
    frame.scale.setScalar(placement.scale ?? 1);
    scene.add(frame);
    return frame;
  }
  const ships = new Map<number, THREE.Group>();
  for (const [index, p] of WICKHARBOR_VESSELS.entries()) {
    if (!isWickharborShip(p.key)) continue;
    const ship = await prop(
      propPreloadInternalsForTest.propAssetUrl[p.key],
      p,
      WATER_LEVEL - (p.float ?? 0),
      Math.PI / 2,
    );
    ships.set(index, ship);
  }
  scene.updateWorldMatrix(true, true);
  // Rendering all piers with only a subset of the fleet made valid gangways
  // look orphaned. Every visible boarding run must have its actual ship and
  // land across the width of that ship's real deck geometry.
  for (const run of wickharborBoardingRuns(terrain, WATER_LEVEL)) {
    const ship = ships.get(run.vessel);
    expect(ship).toBeDefined();
    if (!ship) throw new Error(`Missing rendered ship for berth ${run.vessel}`);
    const dx = run.end.x - run.start.x,
      dz = run.end.z - run.start.z,
      length = Math.hypot(dx, dz);
    for (const side of [-0.4, 0, 0.4]) {
      const x = run.end.x + (dz / length) * run.width * side,
        z = run.end.z - (dx / length) * run.width * side;
      const hit = new THREE.Raycaster(
        new THREE.Vector3(x, run.yEnd + 0.12, z),
        new THREE.Vector3(0, -1, 0),
        0,
        0.3,
      ).intersectObject(ship, true)[0];
      expect(hit, `Unsupported gangway at berth ${run.vessel}, side ${side}`).toBeDefined();
    }
  }
  for (const p of WICKHARBOR_PIER_CARGO)
    await prop(
      `/models/props/${p.key === 'barrel' ? 'barrel' : 'crate_wooden'}.glb`,
      p,
      wickharborCargoSurface(p, terrain, WATER_LEVEL) ?? 0,
    );
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x386f7a, roughness: 0.7 }),
  );
  sea.position.set(490, WATER_LEVEL, 360);
  scene.add(sea);
  const camera = new THREE.PerspectiveCamera(43, 1200 / 740, 0.1, 400);
  camera.position.set(509, 28, 382);
  camera.lookAt(483, -1, 357);
  try {
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    expect(renderer.info.render.triangles).toBeGreaterThan(1000);
    expect(renderer.getContext().getError()).toBe(0);
    await page.screenshot({
      path: '../../docs/screenshots/wickharbor-pier/alongside-boarding.png',
    });
    for (const view of [
      { name: 'gangway-close', eye: [487, 3, 359], target: [484, -1.7, 367] },
      { name: 'from-pier', eye: [478, -1.2, 361.5], target: [491, -1.4, 364] },
      { name: 'ropes-and-cargo', eye: [483, 2.8, 360], target: [488, -3, 363] },
      { name: 'quay-junctions', eye: [476, 15, 343], target: [465, -2, 361] },
    ]) {
      camera.position.set(...(view.eye as [number, number, number]));
      camera.lookAt(...(view.target as [number, number, number]));
      renderer.render(scene, camera);
      await page.screenshot({
        path: `../../docs/screenshots/wickharbor-pier/${view.name}.png`,
      });
    }
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
}, 60000);
