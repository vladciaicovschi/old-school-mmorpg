import { afterEach, describe, expect, it } from 'vitest';
import {
  eastbrookGrassExclusions,
  insideEastbrookGrassExclusion,
} from '../src/render/foliage_core';
import { architectureNativeHeight, scaleArchitectureMetadata } from '../src/sim/architecture_scale';
import { BUILTIN_WORLD, setActiveWorldContent } from '../src/sim/data';
import { buildingDecorationExcluded, buildingFootprints } from '../src/sim/settlement_clearance';
import {
  architectureFootprints,
  architectureGap,
  insideArchitecture,
  settlementTreeRadius,
} from '../src/sim/settlement_space';
import { SETTLEMENT_MODELS, SETTLEMENTS } from '../src/sim/settlements_layout';
import { type BuildingDef, emptyZoneProps } from '../src/sim/types';
import { localPoint, WICKHARBOR_LOTS } from '../src/sim/wickharbor_layout';
import { generateDecorationsInBounds } from '../src/sim/world';

afterEach(() => setActiveWorldContent(null));

describe('enlarged settlement clearance', () => {
  it('widens village passages between neighboring roof eaves and annexes', () => {
    const towns = [
      ...SETTLEMENTS.filter((s) => !s.decorationOnly),
      { id: 'wickharbor', lots: WICKHARBOR_LOTS },
    ];
    expect(towns.reduce((count, town) => count + town.lots.length, 0)).toBe(56);
    for (const town of towns) {
      for (let i = 0; i < town.lots.length; i++) {
        for (let j = i + 1; j < town.lots.length; j++) {
          const a = architectureFootprints(town.lots[i]),
            b = architectureFootprints(town.lots[j]);
          const gap = Math.min(...a.flatMap((x) => b.map((y) => architectureGap(x, y))));
          expect(gap, `${town.id}: ${town.lots[i].id}/${town.lots[j].id}`).toBeGreaterThanOrEqual(
            town.id === 'gullhaven' ? 4.5 : 3.5,
          );
        }
      }
    }
  });

  it('samples enlarged world terrain in native space without scaling angles or source data', () => {
    const pose = { x: 11, z: 28 },
      scale = 1.35;
    const height = (x: number, z: number) => 7 + x * 0.11 - z * 0.04;
    const native = architectureNativeHeight(height, pose, scale);
    expect(native(13, 25) * scale).toBeCloseTo(height(13.7, 23.95), 12);
    const source = {
      interior: { floorY: 0.03, doorwayWidth: 1.12, benchCount: 6, doorOpenRadians: 1.57 },
      entrance: { x: 0, z: 2, width: 1, thresholdY: 0.2 },
      staircase: {
        count: 10,
        angleStep: 0.4,
        endAngle: 4,
        portalAngle: 1,
        inner: 1,
        outer: 2,
        walkRadius: 1.5,
        baseY: 0.03,
        topY: 5,
      },
    };
    const snapshot = JSON.stringify(source);
    const scaled = scaleArchitectureMetadata(source, scale);
    expect(scaled.interior.benchCount).toBe(6);
    expect(scaled.interior.doorOpenRadians).toBe(1.57);
    expect(scaled.staircase.count).toBe(10);
    expect(scaled.staircase.angleStep).toBe(0.4);
    expect(scaled.staircase.walkRadius).toBeCloseTo(2.025);
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  it('keeps procedural trees and their collision field outside enlarged roofs', () => {
    let trees = 0;
    for (const town of SETTLEMENTS.filter((s) => !s.decorationOnly)) {
      const b = town.bounds;
      const decorations = generateDecorationsInBounds(20061, {
        minX: b.xMin,
        maxX: b.xMax,
        minZ: b.zMin,
        maxZ: b.zMax,
      });
      const footprints = town.lots.flatMap((lot) => architectureFootprints(lot));
      for (const tree of decorations.filter((d) => d.kind !== 'rock')) {
        trees++;
        expect(
          insideArchitecture(footprints, tree.x, tree.z, 4.5),
          `${town.id}: ${tree.x},${tree.z}`,
        ).toBe(false);
      }
    }
    expect(trees).toBeGreaterThan(0);
  }, 60000);

  it('keeps every authored tree crown outside enlarged houses', () => {
    for (const town of SETTLEMENTS) {
      const roofs = town.lots.flatMap((lot) => architectureFootprints(lot));
      for (const tree of town.trees ?? []) {
        const radius = settlementTreeRadius(tree, SETTLEMENT_MODELS[tree.modelId].bounds);
        expect(insideArchitecture(roofs, tree.x, tree.z, radius), `${town.id}:${tree.id}`).toBe(
          false,
        );
      }
    }
  });

  it('uses active custom geometry and excludes grass from enlarged rear wings', () => {
    const custom: BuildingDef = {
      id: 'settlement:eastbrook:chapel',
      kind: 'chapel',
      x: 100,
      z: 200,
      w: 4,
      d: 6,
      rot: Math.PI / 3,
    };
    expect(buildingDecorationExcluded([custom], 100, 200, 4.5)).toBe(true);
    expect(buildingDecorationExcluded([], 100, 200, 4.5)).toBe(false);
    expect(buildingDecorationExcluded([custom], -60, -100, 4.5)).toBe(false);
    setActiveWorldContent({
      ...BUILTIN_WORLD,
      props: { ...emptyZoneProps(), buildings: [custom] },
    });
    expect(buildingFootprints(custom)[0].rect.maxX).toBe(2);
    setActiveWorldContent(null);
    const exclusions = eastbrookGrassExclusions(BUILTIN_WORLD.props.buildings, true);
    for (const building of BUILTIN_WORLD.props.buildings.filter(
      (b) => b.id?.startsWith('settlement:') || b.id?.startsWith('wickharbor:'),
    )) {
      for (const footprint of buildingFootprints(building)) {
        const r = footprint.rect;
        const point = localPoint(footprint, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2);
        expect(insideEastbrookGrassExclusion(exclusions, point.x, point.z, 0), building.id).toBe(
          true,
        );
      }
    }
  });
});
