import type { Collider, ObbCollider } from './colliders';
import {
  localPoint,
  type Rect,
  type TerrainHeight,
  WICKHARBOR_ACCESS,
  WICKHARBOR_LIGHTHOUSE,
  wickharborPlans,
} from './wickharbor_layout';
import { yardLayout } from './wickharbor_yard_layout';

type Pose = { x: number; z: number; rot: number };
/** Authored wall segments and stacked supports, never a single-valued stair heightfield. */
export function buildWickharborColliders(height: TerrainHeight): Collider[] {
  const out: Collider[] = [],
    plans = wickharborPlans(height),
    lots = plans.map((p) => p.lot);
  function box(pose: Pose, rect: Rect, options: Partial<ObbCollider> = {}) {
    const p = localPoint(pose, (rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2);
    out.push({
      type: 'obb',
      ...p,
      hw: (rect.maxX - rect.minX) / 2,
      hd: (rect.maxZ - rect.minZ) / 2,
      rot: pose.rot,
      ...options,
    });
  }
  function slab(pose: Pose, rect: Rect, top: number, thickness = 0.1) {
    box(pose, rect, {
      moveTopY: top,
      cameraTopY: top,
      passUnderY: top - thickness,
      standable: true,
      stairTread: true,
    });
  }
  for (const { lot, placement: p, metadata: m } of plans) {
    const shifted = (r: Rect): Rect => ({
      ...r,
      minZ: r.minZ + p.offsetZ,
      maxZ: r.maxZ + p.offsetZ,
    });
    const root: Pose = { ...localPoint(lot, 0, p.offsetZ), rot: lot.rot };
    const floor = p.grade + (m.interior?.floorY ?? 0.03);
    if (!p.openAir) {
      for (const tread of [p.landing, ...p.steps]) slab(lot, tread, tread.top, 0.18);
      // Short strips follow the rendered terrain apron, including its downhill end.
      for (let i = 0; i < 9; i++) {
        const r = {
          ...p.approach,
          minZ: p.approach.minZ + i * 0.1,
          maxZ: p.approach.minZ + (i + 1) * 0.1,
        };
        const c = localPoint(lot, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2),
          t = (i + 0.5) / 9,
          ground = height(c.x, c.z) + 0.035;
        slab(lot, r, Math.max(ground, p.approach.top * (1 - t) + ground * t), 0.08);
      }
    }
    if (lot.id === 'inn') {
      slab(root, { minX: -2.8, maxX: 2.8, minZ: -3.8, maxZ: 4.1 }, floor, 0.12);
      for (const r of m.walkColliders ?? []) {
        // Outdoor props are seated below; wall and furniture volumes stay authored.
        if (r.id.startsWith('props/')) continue;
        box(root, r, { cameraTopY: p.grade + (r.id.startsWith('wall') ? 9 : 2) });
      }
    } else if (lot.id === 'chapel') {
      slab(root, { minX: -3, maxX: 3, minZ: -5, maxZ: 5 }, floor, 0.12);
      box(root, { minX: -3.17, maxX: -2.83, minZ: -5.17, maxZ: 5.17 }, { cameraTopY: p.grade + 7 });
      box(root, { minX: 2.83, maxX: 3.17, minZ: -5.17, maxZ: 5.17 }, { cameraTopY: p.grade + 7 });
      for (const z of [-5, 5])
        for (const [minX, maxX] of [
          [-3.17, -0.56],
          [0.56, 3.17],
        ])
          box(root, { minX, maxX, minZ: z - 0.17, maxZ: z + 0.17 }, { cameraTopY: p.grade + 7 });
      const tower = m.bellTower!;
      slab(root, { minX: -2.25, maxX: 2.25, minZ: -9.5, maxZ: -5 }, floor, 0.12);
      for (const x of [-2.25, 2.25])
        box(
          root,
          { minX: x - 0.17, maxX: x + 0.17, minZ: -9.67, maxZ: -4.83 },
          { cameraTopY: p.grade + 12, moveTopY: p.grade + 9 },
        );
      box(
        root,
        { minX: -2.42, maxX: 2.42, minZ: -9.67, maxZ: -9.33 },
        { cameraTopY: p.grade + 12, moveTopY: p.grade + 9 },
      );
      box(
        root,
        { minX: -2.25, maxX: 2.25, minZ: -5.17, maxZ: -4.83 },
        { cameraTopY: p.grade + 9, moveTopY: p.grade + 9, passUnderY: p.grade + 3 },
      );
      for (const flight of tower.flights) {
        const alongX = Math.abs(flight.to[0] - flight.from[0]) > 1;
        for (const step of flight.steps)
          slab(
            root,
            {
              minX: step.x - (alongX ? 0.125 : 0.55),
              maxX: step.x + (alongX ? 0.125 : 0.55),
              minZ: step.z - (alongX ? 0.55 : 0.125),
              maxZ: step.z + (alongX ? 0.55 : 0.125),
            },
            p.grade + step.top,
          );
        const [x, y, z] = flight.to;
        slab(
          root,
          { minX: x - 0.55, maxX: x + 0.55, minZ: z - 0.55, maxZ: z + 0.55 },
          p.grade + y,
          0.08,
        );
      }
      const xs = [
        ...new Set([-2.25, 2.25, ...tower.stairwell.flatMap((r) => [r.minX, r.maxX])]),
      ].sort((a, b) => a - b);
      const zs = [
        ...new Set([-2.25, 2.25, ...tower.stairwell.flatMap((r) => [r.minZ, r.maxZ])]),
      ].sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++)
        for (let j = 1; j < zs.length; j++) {
          const x = (xs[i - 1] + xs[i]) / 2,
            z = (zs[j - 1] + zs[j]) / 2;
          if (tower.stairwell.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ))
            continue;
          slab(
            root,
            {
              minX: xs[i - 1],
              maxX: xs[i],
              minZ: tower.centerZ + zs[j - 1],
              maxZ: tower.centerZ + zs[j],
            },
            p.grade + tower.platformY,
            0.08,
          );
        }
      for (const x of [-2.18, 2.18])
        box(
          root,
          { minX: x - 0.07, maxX: x + 0.07, minZ: -9.5, maxZ: -5 },
          { moveTopY: p.grade + 10.03, passUnderY: p.grade + 9.03 },
        );
      for (const z of [-9.43, -5.07])
        box(
          root,
          { minX: -2.25, maxX: 2.25, minZ: z - 0.07, maxZ: z + 0.07 },
          { moveTopY: p.grade + 10.03, passUnderY: p.grade + 9.03 },
        );
    } else if (m.openWorkArea && !p.openAir) {
      const w = m.footprint!.width / 2,
        d = m.footprint!.depth / 2;
      slab(root, { minX: -w, maxX: w, minZ: -d, maxZ: d }, floor, 0.12);
      box(
        root,
        { minX: -w, maxX: w, minZ: -d - 0.15, maxZ: -d + 0.15 },
        { cameraTopY: p.grade + 5 },
      );
      for (const x of [-w, w])
        box(
          root,
          { minX: x - 0.15, maxX: x + 0.15, minZ: -d, maxZ: lot.id === 'shipyard' ? 0 : d },
          { cameraTopY: p.grade + 5 },
        );
      if (lot.id === 'shipyard')
        box(
          root,
          { minX: -0.9, maxX: 0.9, minZ: -2.15, maxZ: 2.05 },
          { cameraTopY: p.grade + 1.1, moveTopY: p.grade + 1.1, standable: true },
        );
    } else if (!p.openAir) {
      box(lot, p.body, { cameraTopY: p.grade + (lot.id === 'hall' ? 11 : 8) });
    }
    for (const prop of p.terrainProps) {
      const top = p.grade + prop.max[1] + prop.translationY;
      box(lot, prop.rect, { cameraTopY: top, moveTopY: top, standable: true });
    }
    for (const { a, b } of yardLayout(lot, p, lots).fences) {
      const pose = {
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        rot: Math.atan2(b.x - a.x, b.z - a.z),
      };
      box(
        pose,
        {
          minX: -0.07,
          maxX: 0.07,
          minZ: -Math.hypot(b.x - a.x, b.z - a.z) / 2,
          maxZ: Math.hypot(b.x - a.x, b.z - a.z) / 2,
        },
        { cameraTopY: Math.max(height(a.x, a.z), height(b.x, b.z)) + 1, isFence: true },
      );
    }
  }
  out.push({ type: 'circle', x: 427, z: 362, r: 1.05, cameraTopY: height(427, 362) + 3.7 });
  out.push({ type: 'circle', x: 447, z: 321, r: 2, cameraTopY: height(447, 321) + 6 });
  lighthouse();
  return out;

  function lighthouse() {
    const { x, z, metadata } = WICKHARBOR_LIGHTHOUSE,
      base = height(x, z),
      stairs = metadata.staircase!,
      pose = { x, z, rot: 0 };
    const tau = Math.PI * 2,
      wrap = (a: number) => ((((a + Math.PI) % tau) + tau) % tau) - Math.PI;
    function radial(
      a: number,
      inner: number,
      outer: number,
      halfAngle: number,
      options: Partial<ObbCollider>,
    ) {
      const r = (inner + outer) / 2,
        p = localPoint(pose, Math.sin(a) * r, Math.cos(a) * r);
      box(
        { ...p, rot: a },
        {
          minX: -outer * Math.sin(halfAngle),
          maxX: outer * Math.sin(halfAngle),
          minZ: -(outer - inner) / 2,
          maxZ: (outer - inner) / 2,
        },
        options,
      );
    }
    slab(pose, { minX: -0.7, maxX: 0.7, minZ: 2.4, maxZ: 3.2 }, base + 0.03, 0.25);
    out.push({
      type: 'circle',
      x,
      z,
      r: 2.65,
      moveTopY: base + 0.03,
      cameraTopY: base + 0.03,
      standable: true,
    });
    for (let i = 0; i < 96; i++) {
      const a = ((i + 0.5) * tau) / 96,
        door = Math.abs(wrap(a)) < Math.asin(0.59 / 2.9) + tau / 192;
      radial(a, 2.65, 2.9, tau / 192, {
        cameraTopY: base + 19,
        moveTopY: base + 19,
        ...(door ? { passUnderY: base + 2.22 } : {}),
      });
      const portal = Math.abs(wrap(a - stairs.portalAngle)) < Math.asin(0.55 / 2.4) + tau / 192;
      if (!portal)
        radial(a, 2.37, 2.43, tau / 192, {
          moveTopY: base + 22,
          cameraTopY: base + 22,
          passUnderY: base + 19.225,
        });
      radial(a, 3.45, 3.55, tau / 192, {
        moveTopY: base + 20.05,
        cameraTopY: base + 20.05,
        passUnderY: base + 19,
      });
      const relative =
        (((a - (stairs.endAngle - WICKHARBOR_ACCESS.galleryHoleTreads * stairs.angleStep)) % tau) +
          tau) %
        tau;
      const inHole = relative < WICKHARBOR_ACCESS.galleryHoleTreads * stairs.angleStep;
      for (const [inner, outer] of inHole
        ? [[2.66, 3.7]]
        : [
            [1.05, 2.66],
            [2.66, 3.7],
          ])
        radial(a, inner, outer, tau / 192, {
          moveTopY: base + 19,
          cameraTopY: base + 19,
          passUnderY: base + 18.76,
          standable: true,
        });
    }
    out.push({
      type: 'circle',
      x,
      z,
      r: 1.1,
      moveTopY: base + 19,
      cameraTopY: base + 19,
      passUnderY: base + 18.86,
      standable: true,
    });
    for (let i = 0; i < stairs.count; i++) {
      const a = (i + 0.5) * stairs.angleStep,
        top = base + stairs.baseY + ((i + 1) * (stairs.topY - stairs.baseY)) / stairs.count;
      radial(
        a,
        stairs.inner,
        i < WICKHARBOR_ACCESS.entryTreads ? WICKHARBOR_ACCESS.entryOuterRadius : stairs.outer,
        stairs.angleStep / 2 + 0.003,
        {
          moveTopY: top,
          cameraTopY: top,
          passUnderY: top - 0.08,
          standable: true,
          stairTread: true,
        },
      );
    }
  }
}
