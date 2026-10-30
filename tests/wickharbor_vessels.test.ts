import { describe, expect, it } from 'vitest';
import { BUILTIN_WORLD } from '../src/sim/data';
import { GALE_HARBOR_DECKS } from '../src/sim/gale_harbor';
import { emptyZoneProps } from '../src/sim/types';
import { rebuildWickharborProps } from '../src/sim/wickharbor_props';
import {
  WICKHARBOR_ROWBOAT,
  WICKHARBOR_SAILSHIP_KEYS,
  WICKHARBOR_SHIP_PROFILES,
  WICKHARBOR_VESSELS,
  wickharborShipProfile,
} from '../src/sim/wickharbor_vessels';
import { groundHeight, terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

type Rectangle = { x: number; z: number; rot?: number; hw: number; hd: number };
const isSailship = (p: { key: string }) => WICKHARBOR_SAILSHIP_KEYS.some((key) => key === p.key);
function rectanglePoints(rectangle: Rectangle) {
  const c = Math.cos(rectangle.rot ?? 0),
    s = Math.sin(rectangle.rot ?? 0);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, z]) => ({
    x: rectangle.x + x * rectangle.hw * c + z * rectangle.hd * s,
    z: rectangle.z - x * rectangle.hw * s + z * rectangle.hd * c,
  }));
}

// A positive separating-axis gap proves that two complete rectangles cannot
// overlap, including the long hull edges that center-distance tests miss.
function rectangleGap(a: Rectangle, b: Rectangle): number {
  const first = rectanglePoints(a),
    second = rectanglePoints(b);
  let gap = -Infinity;
  for (const rot of [a.rot ?? 0, b.rot ?? 0]) {
    for (const [x, z] of [
      [Math.cos(rot), -Math.sin(rot)],
      [Math.sin(rot), Math.cos(rot)],
    ]) {
      const p = first.map((v) => v.x * x + v.z * z),
        q = second.map((v) => v.x * x + v.z * z);
      gap = Math.max(gap, Math.min(...p) - Math.max(...q), Math.min(...q) - Math.max(...p));
    }
  }
  return gap;
}

function vesselBox(vessel: (typeof WICKHARBOR_VESSELS)[number]): Rectangle {
  return { ...vessel, hw: vessel.hw, hd: vessel.hd };
}

function bedHeights(vessel: Rectangle): number[] {
  const heights: number[] = [],
    c = Math.cos(vessel.rot ?? 0),
    s = Math.sin(vessel.rot ?? 0),
    acrossSteps = Math.ceil((vessel.hw * 2) / 0.5),
    alongSteps = Math.ceil((vessel.hd * 2) / 0.5);
  for (let x = 0; x <= acrossSteps; x++) {
    for (let z = 0; z <= alongSteps; z++) {
      const u = (x / acrossSteps - 0.5) * 2 * vessel.hw,
        v = (z / alongSteps - 0.5) * 2 * vessel.hd;
      heights.push(terrainHeight(vessel.x + u * c + v * s, vessel.z - u * s + v * c, WORLD_SEED));
    }
  }
  return heights;
}

describe('Wickharbor modular fleet', () => {
  it('replaces only the harbor fleet and keeps existing land fixtures and other regions', () => {
    const outsideShip = { key: 'hexShipBlue', x: -115, z: -45, scale: 7 },
      outsideBoat = { key: 'hexBoat', x: -107.5, z: -47, scale: 6 },
      rack = { key: 'hexBoatrack', x: 486, z: 340, scale: 6 },
      anchor = { key: 'hexAnchor', x: 452, z: 326, scale: 7 },
      legacy = {
        ...emptyZoneProps(),
        decorProps: [
          outsideShip,
          outsideBoat,
          rack,
          anchor,
          { key: 'hexShipBlue', x: 492.9, z: 350.2, scale: 6 },
          { key: 'hexBoat', x: 474, z: 354, scale: 6 },
        ],
      },
      before = structuredClone(legacy),
      result = rebuildWickharborProps(legacy);
    expect(result.decorProps).toContain(outsideShip);
    expect(result.decorProps).toContain(outsideBoat);
    expect(result.decorProps).toContain(rack);
    expect(result.decorProps).toContain(anchor);
    expect(result.decorProps?.filter(isSailship)).toHaveLength(7);
    expect(result.decorProps?.filter((p) => p.key === 'wickRowboat')).toHaveLength(3);
    expect(result.decorProps?.filter((p) => p.key === 'hexShipBlue')).toEqual([outsideShip]);
    expect(result.decorProps?.filter((p) => p.key === 'hexBoat')).toEqual([outsideBoat]);
    expect(legacy).toEqual(before);
    expect(rebuildWickharborProps(legacy)).toEqual(result);
  });

  it('reaches the assembled world with seven ships, three ordinary rowboats and unchanged distant ships', () => {
    const props = BUILTIN_WORLD.props.decorProps ?? [];
    expect(props.filter(isSailship)).toHaveLength(7);
    expect(props.filter((p) => p.key === 'wickRowboat')).toHaveLength(3);
    expect(props.some((p) => p.key === 'hexShipBlue' && p.x === -115 && p.z === -45)).toBe(true);
    expect(props.some((p) => p.key === 'hexBoat' && p.x === -107.5 && p.z === -47)).toBe(true);
    expect(props.some((p) => p.key === 'hexBoatrack' && p.x === 486 && p.z === 340)).toBe(true);
    expect(props.some((p) => p.key === 'wickFishingBoat')).toBe(false);
  });

  it('floats on the real waterline with clearance under the complete conservative hull envelopes', () => {
    const afloat = WICKHARBOR_VESSELS.filter(
      (p): p is (typeof WICKHARBOR_VESSELS)[number] & { float: number } => p.float !== undefined,
    );
    expect(afloat).toHaveLength(9);
    for (const vessel of afloat) {
      const scale = vessel.scale,
        profile = isSailship(vessel) ? wickharborShipProfile(vessel.key) : WICKHARBOR_ROWBOAT,
        expectedBase = WATER_LEVEL - profile.nativeDraft * scale,
        renderedBase = Math.max(
          terrainHeight(vessel.x, vessel.z, WORLD_SEED),
          WATER_LEVEL - vessel.float,
        ),
        highestBed = Math.max(...bedHeights(vesselBox(vessel)));
      expect(renderedBase, `${vessel.key} (${vessel.x}, ${vessel.z})`).toBeCloseTo(expectedBase, 6);
      expect(highestBed, `Bed beneath ${JSON.stringify(vessel)}`).toBeLessThan(expectedBase - 0.15);
      if (isSailship(vessel)) {
        expect(groundHeight(vessel.x, vessel.z, WORLD_SEED) + vessel.h).toBeGreaterThanOrEqual(
          WATER_LEVEL + wickharborShipProfile(vessel.key).mastHeightAboveWater * scale,
        );
      }
    }
  });

  it('distributes three rig families and four sail colors with measured hull envelopes', () => {
    const ships = WICKHARBOR_VESSELS.filter(isSailship);
    expect(
      WICKHARBOR_SAILSHIP_KEYS.map((key) => ships.filter((p) => p.key === key).length),
    ).toEqual([1, 1, 1, 1, 1, 1, 1]);
    const profiles = ships.map((p) => wickharborShipProfile(p.key));
    expect(
      ['brigantine', 'ketch', 'brig'].map((rig) => profiles.filter((p) => p.rig === rig).length),
    ).toEqual([3, 2, 2]);
    expect(
      ['linen', 'blue', 'ochre', 'russet'].map(
        (color) => profiles.filter((p) => p.color === color).length,
      ),
    ).toEqual([2, 2, 2, 1]);
    expect(Object.keys(WICKHARBOR_SHIP_PROFILES)).toEqual([...WICKHARBOR_SAILSHIP_KEYS]);
    for (const ship of ships) {
      expect(ship.scale).toBe(0.9);
      expect(ship.hw).toBe(wickharborShipProfile(ship.key).hullHalfWidth * ship.scale);
      expect(ship.hd).toBe(wickharborShipProfile(ship.key).hullHalfDepth * ship.scale);
      expect(ship.float).toBe(wickharborShipProfile(ship.key).nativeDraft * ship.scale);
    }
  });

  it('keeps every hull box off all walkable pier and ramp rectangles', () => {
    for (const vessel of WICKHARBOR_VESSELS) {
      for (const dock of GALE_HARBOR_DECKS) {
        expect(
          rectangleGap(vesselBox(vessel), { ...dock, hd: dock.hl }),
          `Hull ${JSON.stringify(vessel)} intersects dock ${JSON.stringify(dock)}`,
        ).toBeGreaterThan(0.35);
      }
    }
  });

  it('keeps distinct hulls apart without relying on circle radii or only testing centers', () => {
    for (let i = 0; i < WICKHARBOR_VESSELS.length; i++) {
      for (let j = 0; j < i; j++) {
        expect(
          rectangleGap(vesselBox(WICKHARBOR_VESSELS[i]), vesselBox(WICKHARBOR_VESSELS[j])),
          `Vessel hulls ${i} and ${j}`,
        ).toBeGreaterThan(0.5);
      }
    }
  });

  it('hauls one ordinary rowboat onto dry, gently graded ground near the preserved rack', () => {
    const hauled = WICKHARBOR_VESSELS.filter((p) => p.float === undefined);
    expect(hauled).toHaveLength(1);
    const boat = hauled[0],
      heights = bedHeights(vesselBox(boat));
    expect(boat.key).toBe('wickRowboat');
    expect(Math.min(...heights)).toBeGreaterThan(WATER_LEVEL + 0.5);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.8);
    expect(Math.hypot(boat.x - 486, boat.z - 340)).toBeLessThan(6);
  });
});
