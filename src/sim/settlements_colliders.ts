import { scaleColliderRange } from './architecture_scale';
import type { Collider, ObbCollider } from './colliders';
import {
  SETTLEMENT_MODELS,
  SETTLEMENTS,
  type SettlementItem,
  settlementBelfryOpenings,
  settlementDeckPlacement,
  settlementFortificationGrade,
  settlementItemPlacement,
  settlementNativePlans,
} from './settlements_layout';
import { localPoint, type Rect, type TerrainHeight } from './wickharbor_layout';

type Pose = { x: number; z: number; rot: number };
/** Movement uses the same runtime grade and native stair coordinates as rendering. */
export function buildSettlementColliders(height: TerrainHeight): Collider[] {
  const out: Collider[] = [];
  function box(pose: Pose, r: Rect, options: Partial<ObbCollider> = {}) {
    out.push({
      type: 'obb',
      ...localPoint(pose, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2),
      hw: (r.maxX - r.minX) / 2,
      hd: (r.maxZ - r.minZ) / 2,
      rot: pose.rot,
      ...options,
    });
  }
  function slab(pose: Pose, r: Rect, top: number, thickness = 0.1) {
    box(pose, r, {
      moveTopY: top,
      cameraTopY: top,
      passUnderY: top - thickness,
      standable: true,
      stairTread: true,
    });
  }
  for (const plan of settlementNativePlans(height)) {
    const start = out.length,
      height = plan.height;
    const { lot, metadata: m, placement: p } = plan,
      root = { ...localPoint(lot, 0, p.offsetZ), rot: lot.rot },
      floor = p.grade + (m.interior?.floorY ?? 0.03);
    for (const tread of [p.landing, ...p.steps]) slab(lot, tread, tread.top, 0.18);
    for (let i = 0; i < 9; i++) {
      const r = {
          ...p.approach,
          minZ: p.approach.minZ + i * 0.1,
          maxZ: p.approach.minZ + (i + 1) * 0.1,
        },
        point = localPoint(lot, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2),
        t = (i + 0.5) / 9,
        ground = height(point.x, point.z) + 0.035;
      slab(lot, r, Math.max(ground, p.approach.top * (1 - t) + ground * t), 0.08);
    }
    if (m.bellTower) chapel(plan, root, floor);
    else if (m.walkColliders?.some((r) => r.id.startsWith('wall'))) {
      const w = m.footprint!.width / 2,
        d = m.footprint!.depth / 2;
      slab(root, { minX: -w, maxX: w, minZ: -d, maxZ: d }, floor, 0.12);
      for (const r of m.walkColliders)
        if (!r.id.startsWith('props/'))
          box(root, r, { cameraTopY: p.grade + (r.id.startsWith('wall') ? 9 : 2) });
      if (plan.modelId === 'fort:barracks') {
        // Upper floor keeps the real stair opening along the right wall.
        const upper = p.grade + 3.03;
        slab(root, { minX: -3, maxX: 1, minZ: -4, maxZ: 4 }, upper, 0.15);
        slab(root, { minX: 1, maxX: 3, minZ: -4, maxZ: -2.1 }, upper, 0.15);
        slab(root, { minX: 1, maxX: 3, minZ: 2.5, maxZ: 4 }, upper, 0.15);
        for (let i = 0; i < 16; i++) {
          const z1 = 2.2 - (i * 4.4) / 16;
          slab(
            root,
            { minX: 1.05, maxX: 2.65, minZ: z1 - 4.4 / 16, maxZ: z1 },
            p.grade + 0.03 + (3 * (i + 1)) / 16,
            0.14,
          );
        }
        for (const item of m.interior?.items ?? []) {
          if (item.bounds.max[1] - item.bounds.min[1] < 0.25) continue;
          const [minX, minY, minZ] = item.bounds.min,
            [maxX, maxY, maxZ] = item.bounds.max;
          box(
            root,
            { minX, maxX, minZ, maxZ },
            {
              moveTopY: p.grade + maxY,
              cameraTopY: p.grade + maxY,
              ...(minY > 2 ? { passUnderY: p.grade + minY } : {}),
              standable: true,
            },
          );
        }
      }
    } else if (m.openWorkArea) {
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
          { minX: x - 0.15, maxX: x + 0.15, minZ: -d, maxZ: d },
          { cameraTopY: p.grade + 5 },
        );
    } else if (!p.openAir)
      box(lot, p.body, {
        cameraTopY: p.grade + (SETTLEMENT_MODELS[plan.modelId].bounds.max[1] ?? 8),
      });
    for (const prop of p.terrainProps) {
      const top = p.grade + prop.max[1] + prop.translationY;
      box(lot, prop.rect, { moveTopY: top, cameraTopY: top, standable: true });
    }
    scaleColliderRange(out, start, lot, plan.scale);
  }
  for (const settlement of SETTLEMENTS) {
    for (const item of settlement.siteDressing?.fences ?? []) {
      const b = SETTLEMENT_MODELS[item.modelId].bounds,
        scale = Array.isArray(item.scale) ? item.scale : [1, 1, 1],
        r = {
          minX: b.min[0] * scale[0],
          maxX: b.max[0] * scale[0],
          minZ: b.min[2] * scale[2],
          maxZ: b.max[2] * scale[2],
        },
        top = height(item.x, item.z) + b.max[1] * scale[1];
      box({ ...item, rot: item.yaw ?? item.rot ?? 0 }, r, {
        cameraTopY: top,
        moveTopY: top,
        isFence: true,
      });
    }
    // Eastbrook's established harbor surface remains the single authority.
    for (const item of settlement.id === 'eastbrook'
      ? []
      : (settlement.siteDressing?.decks ?? [])) {
      const deck = settlementDeckPlacement(item, height);
      // Small surfaces sample the same sloping walkway as rendering.
      const count = Math.max(1, Math.ceil((deck.rect.maxX - deck.rect.minX) / 0.18));
      for (let i = 0; i < count; i++) {
        const r = {
          ...deck.rect,
          minX: deck.rect.minX + ((deck.rect.maxX - deck.rect.minX) * i) / count,
          maxX: deck.rect.minX + ((deck.rect.maxX - deck.rect.minX) * (i + 1)) / count,
        };
        slab({ ...item, rot: deck.rot }, r, deck.top + ((r.minX + r.maxX) / 2) * deck.slope, 0.12);
      }
    }
    for (const tree of settlement.trees ?? []) {
      const r = tree.r ?? tree.radius ?? 0.4;
      out.push({
        type: 'circle',
        x: tree.x,
        z: tree.z,
        r,
        cameraTopY: height(tree.x, tree.z) + (tree.targetHeight ?? 8),
      });
    }
    for (const lamp of settlement.lamps ?? []) itemBox(lamp);
    for (const item of [...settlement.dressing, ...settlement.landmarks]) {
      // Interactable services already have a canonical collider from their entity data.
      if (item.id === 'mailbox' || item.id === 'noticeboard') continue;
      itemBox(item);
    }
    for (const item of settlement.fortifications) {
      const model = SETTLEMENT_MODELS[item.modelId],
        m = model.metadata,
        base = settlementFortificationGrade(item, height),
        pose = { ...item, rot: item.rot ?? 0 };
      if (settlement.id === 'wolf-run-fort' && item.id === 'gate') {
        for (const [minX, maxX] of [
          [-3.5, -2.4],
          [2.4, 3.6],
        ])
          box(pose, { minX, maxX, minZ: -0.82, maxZ: 0.82 }, { cameraTopY: base + 7.4 });
      } else if (settlement.id === 'wolf-run-fort') {
        const b = model.bounds;
        box(
          pose,
          { minX: b.min[0], maxX: b.max[0], minZ: b.min[2], maxZ: b.max[2] },
          { cameraTopY: base + b.max[1] },
        );
      } else if (item.type === 'gate' || item.kind === 'gate' || /gate/.test(item.id)) {
        // Open gate leaves run into the village; the centre passage stays open.
        for (const x of [-2.05, 2.05])
          box(
            pose,
            { minX: x - 0.18, maxX: x + 0.18, minZ: -0.3, maxZ: 0.3 },
            { cameraTopY: base + 4 },
          );
        for (const x of [-1.9, 1.9])
          box(
            pose,
            { minX: x - 0.12, maxX: x + 0.12, minZ: 0, maxZ: 1.8 },
            { cameraTopY: base + 2.8 },
          );
      } else if (m.deckHeight) {
        for (const x of [-1.35, 1.35])
          for (const z of [-1.35, 1.35])
            box(
              pose,
              { minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2 },
              { cameraTopY: base + m.deckHeight },
            );
        // The native vertical ladder is cosmetic; no ladder traversal mechanic
        // is introduced here. The upper platform retains its real opening.
        const opening = m.ladderOpening!,
          h = m.deckHeight;
        slab(pose, { minX: -1.55, maxX: 1.55, minZ: -1.55, maxZ: opening.minZ }, base + h);
        for (const [minX, maxX] of [
          [-1.55, opening.minX],
          [opening.maxX, 1.55],
        ])
          slab(pose, { minX, maxX, minZ: opening.minZ, maxZ: 1.55 }, base + h);
        for (const x of [-1.5, 1.5])
          box(
            pose,
            { minX: x - 0.08, maxX: x + 0.08, minZ: -1.55, maxZ: 1.55 },
            { moveTopY: base + h + 1, passUnderY: base + h, cameraTopY: base + h + 1 },
          );
        box(
          pose,
          { minX: -1.55, maxX: 1.55, minZ: -1.58, maxZ: -1.42 },
          { moveTopY: base + h + 1, passUnderY: base + h, cameraTopY: base + h + 1 },
        );
      } else itemBox(item);
    }
  }
  return out;

  function itemBox(item: SettlementItem) {
    const m = SETTLEMENT_MODELS[item.modelId];
    if (!m) return;
    if (m.metadata.campShell) {
      const grade = height(item.x, item.z);
      const scale = typeof item.scale === 'number' ? item.scale : 1;
      for (const r of m.metadata.campShell)
        box({ ...item, rot: item.rot ?? 0 }, { minX: r.minX * scale, maxX: r.maxX * scale, minZ: r.minZ * scale, maxZ: r.maxZ * scale }, { cameraTopY: grade + m.bounds.max[1] * scale });
      if (item.kind === 'tent' && item.modelId === 'bandit:emerald')
        box({ ...item, rot: item.rot ?? 0 }, { minX: 0.3 * scale, maxX: 1.5 * scale, minZ: 4.35 * scale, maxZ: 4.65 * scale }, { cameraTopY: grade + m.bounds.max[1] * scale });
      return;
    }
    const seated = settlementItemPlacement(item, height),
      r = seated.seating.rect,
      top = seated.grade + seated.seating.max[1] + seated.seating.translationY;
    if (item.terrainFeet) {
      // Attached wood shelters have open storage space, not a solid box.
      for (const x of [r.minX + 0.1, r.maxX - 0.1])
        box(
          { ...item, rot: item.rot ?? 0 },
          { minX: x - 0.08, maxX: x + 0.08, minZ: r.maxZ - 0.16, maxZ: r.maxZ },
          { cameraTopY: top, moveTopY: top },
        );
      return;
    }
    box({ ...item, rot: item.rot ?? 0 }, r, { cameraTopY: top, moveTopY: top, standable: true });
  }
  function chapel(
    { metadata: m, placement: p }: ReturnType<typeof settlementNativePlans>[number],
    root: Pose,
    floor: number,
  ) {
    const w = m.footprint!.width / 2,
      d = m.footprint!.depth / 2,
      t = m.bellTower!,
      door = (m.entrance?.width ?? 1.12) / 2,
      width = t.width / 2,
      depth = t.depth / 2;
    slab(root, { minX: -w, maxX: w, minZ: -d, maxZ: d }, floor, 0.12);
    for (const x of [-w, w])
      box(
        root,
        { minX: x - 0.17, maxX: x + 0.17, minZ: -d - 0.17, maxZ: d + 0.17 },
        { cameraTopY: p.grade + 7 },
      );
    for (const z of [-d, d])
      for (const [minX, maxX] of [
        [-w - 0.17, -door],
        [door, w + 0.17],
      ])
        box(root, { minX, maxX, minZ: z - 0.17, maxZ: z + 0.17 }, { cameraTopY: p.grade + 7 });
    slab(root, { minX: -width, maxX: width, minZ: t.centerZ - depth, maxZ: -d }, floor, 0.12);
    for (const x of [-width, width])
      box(
        root,
        { minX: x - 0.2, maxX: x + 0.2, minZ: t.centerZ - depth - 0.2, maxZ: -d + 0.2 },
        { cameraTopY: p.grade + 15, moveTopY: p.grade + t.platformY },
      );
    box(
      root,
      {
        minX: -width - 0.2,
        maxX: width + 0.2,
        minZ: t.centerZ - depth - 0.2,
        maxZ: t.centerZ - depth + 0.2,
      },
      { cameraTopY: p.grade + 15, moveTopY: p.grade + t.platformY },
    );
    box(
      root,
      { minX: -width, maxX: width, minZ: -d - 0.17, maxZ: -d + 0.17 },
      { cameraTopY: p.grade + 9, moveTopY: p.grade + 9, passUnderY: p.grade + 3 },
    );
    for (const flight of t.flights) {
      const alongX = Math.abs(flight.to[0] - flight.from[0]) > 1,
        stepRun =
          flight.steps.length > 1
            ? Math.hypot(
                flight.steps[1].x - flight.steps[0].x,
                flight.steps[1].z - flight.steps[0].z,
              )
            : 0.25;
      for (const step of flight.steps)
        slab(
          root,
          {
            minX: step.x - (alongX ? stepRun / 2 : 0.55),
            maxX: step.x + (alongX ? stepRun / 2 : 0.55),
            minZ: step.z - (alongX ? 0.55 : stepRun / 2),
            maxZ: step.z + (alongX ? 0.55 : stepRun / 2),
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
    const wells = settlementBelfryOpenings(m),
      xs = [...new Set([-width, width, ...wells.flatMap((r) => [r.minX, r.maxX])])].sort(
        (a, b) => a - b,
      ),
      zs = [...new Set([-depth, depth, ...wells.flatMap((r) => [r.minZ, r.maxZ])])].sort(
        (a, b) => a - b,
      );
    for (let i = 1; i < xs.length; i++)
      for (let j = 1; j < zs.length; j++) {
        const x = (xs[i - 1] + xs[i]) / 2,
          z = (zs[j - 1] + zs[j]) / 2;
        if (wells.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ)) continue;
        slab(
          root,
          { minX: xs[i - 1], maxX: xs[i], minZ: t.centerZ + zs[j - 1], maxZ: t.centerZ + zs[j] },
          p.grade + t.platformY,
          0.08,
        );
      }
    const guard = wells[1];
    if (guard) {
      const options = {
        moveTopY: p.grade + t.platformY + 1,
        cameraTopY: p.grade + t.platformY + 1,
        passUnderY: p.grade + t.platformY,
      };
      box(
        root,
        {
          minX: guard.maxX,
          maxX: guard.maxX + 0.13,
          minZ: t.centerZ + guard.minZ,
          maxZ: t.centerZ + guard.maxZ,
        },
        options,
      );
      box(
        root,
        {
          minX: guard.minX,
          maxX: guard.maxX,
          minZ: t.centerZ + guard.maxZ,
          maxZ: t.centerZ + guard.maxZ + 0.13,
        },
        options,
      );
    }
    for (const item of m.interior?.items ?? []) {
      if (item.bounds.min[1] > 0.1) continue;
      box(
        root,
        {
          minX: item.bounds.min[0],
          maxX: item.bounds.max[0],
          minZ: item.bounds.min[2],
          maxZ: item.bounds.max[2],
        },
        {
          moveTopY: p.grade + item.bounds.max[1],
          cameraTopY: p.grade + item.bounds.max[1],
          standable: true,
        },
      );
    }
  }
}
