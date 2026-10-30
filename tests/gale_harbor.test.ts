// Wickharbor's stilt-pier harbor (src/sim/gale_harbor.ts): every deck's
// surface stays level with its shore anchor and above the waterline, the
// connected deck network joins flush (no step taller than a stride), the
// surface is -Infinity off the planks, and a real player must be able to
// WALK from the shore out to a pier tip through the live movement kernel.

import { describe, expect, it } from 'vitest';
import { resolveMovement } from '../src/sim/colliders';
import {
  GALE_DECK_FREEBOARD,
  GALE_HARBOR_AXIS,
  GALE_HARBOR_DECKS,
  GALE_HARBOR_JUNCTIONS,
  galeDeckSurface,
  galeDeckSurfaceAt,
} from '../src/sim/gale_harbor';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { MAX_STEP_HEIGHT, moveCharacter } from '../src/sim/physics';
import { groundHeight, terrainHeight, WATER_LEVEL } from '../src/sim/world';

const SEED = 20061;
const terrain = (x: number, z: number): number => terrainHeight(x, z, SEED);

describe('the harbor decks', () => {
  it('anchors every deck to dry shore ground, above the waterline', () => {
    for (const d of GALE_HARBOR_DECKS) {
      expect(terrain(d.ax, d.az), `anchor of deck at ${d.x},${d.z}`).toBeGreaterThan(WATER_LEVEL);
      for (const along of [-d.hl, 0, d.hl]) {
        const y = galeDeckSurfaceAt(d, along, terrain, WATER_LEVEL);
        expect(y, `surface of deck at ${d.x},${d.z}`).toBeGreaterThan(
          WATER_LEVEL + GALE_DECK_FREEBOARD - 1e-6,
        );
      }
    }
  });

  it('lifts groundHeight to the plank plane on a pier and not beside it', () => {
    const pier = GALE_HARBOR_DECKS[0];
    const dirx = Math.sin(pier.rot);
    const dirz = Math.cos(pier.rot);
    const mid = { x: pier.x, z: pier.z };
    const onDeck = groundHeight(mid.x, mid.z, SEED);
    expect(onDeck).toBeCloseTo(galeDeckSurfaceAt(pier, 0, terrain, WATER_LEVEL), 5);
    // Mid-channel between the parallel piers there is only sea.
    const off = {
      x: mid.x - dirz * (pier.hw + 3),
      z: mid.z + dirx * (pier.hw + 3),
    };
    expect(galeDeckSurface(off.x, off.z, terrain, WATER_LEVEL)).toBe(-Infinity);
    expect(groundHeight(off.x, off.z, SEED)).toBeLessThan(WATER_LEVEL);
  });

  it('uses parallel fingers and only right-angle axes on the connected shore network', () => {
    for (const index of [0, 1, 2]) expect(GALE_HARBOR_DECKS[index].rot).toBe(GALE_HARBOR_AXIS);
    for (const index of [0, 1, 2, 3, 4, 5, 6, 9]) {
      const angle = (GALE_HARBOR_DECKS[index].rot - GALE_HARBOR_AXIS) / (Math.PI / 2);
      expect(angle).toBeCloseTo(Math.round(angle), 10);
    }
    expect(GALE_HARBOR_DECKS[7].rot).toBe(GALE_HARBOR_DECKS[8].rot);
  });

  it('joins flat deck rectangles edge to edge without overlapping plank areas', () => {
    const ids = [0, 1, 2, 3, 4, 9],
      s = Math.sin(GALE_HARBOR_AXIS),
      c = Math.cos(GALE_HARBOR_AXIS);
    const boxes = ids.map((id) => {
      const d = GALE_HARBOR_DECKS[id],
        u = d.x * s + d.z * c,
        v = d.x * c - d.z * s;
      const parallel = Math.abs(Math.cos(d.rot - GALE_HARBOR_AXIS)) > 0.9;
      const hu = parallel ? d.hl : d.hw,
        hv = parallel ? d.hw : d.hl;
      return { id, u0: u - hu, u1: u + hu, v0: v - hv, v1: v + hv };
    });
    for (let i = 0; i < boxes.length; i++)
      for (let j = 0; j < i; j++) {
        const a = boxes[i],
          b = boxes[j];
        const u = Math.max(0, Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0));
        const v = Math.max(0, Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0));
        expect(u * v, `coplanar overlap ${a.id}/${b.id}`).toBeLessThan(1e-6);
      }
  });

  it('walks the three shore landings in both directions without a raised plank lip', () => {
    for (const index of [5, 6, 8]) {
      const d = GALE_HARBOR_DECKS[index],
        side = d.endFlush ? 1 : -1;
      const point = (offset: number) => ({
        x: d.x + Math.sin(d.rot) * (side * d.hl + offset),
        z: d.z + Math.cos(d.rot) * (side * d.hl + offset),
      });
      const inside = point(-side * (d.hl * 2 - 0.3)),
        outside = point(side * 0.6);
      for (const reverse of [false, true]) {
        const from = reverse ? outside : inside,
          to = reverse ? inside : outside;
        let x = from.x,
          z = from.z,
          y = groundHeight(x, z, SEED);
        const out = { x, y, z, blocked: false, stepped: 0 };
        for (let i = 0; i < 400; i++) {
          const dx = to.x - x,
            dz = to.z - z,
            length = Math.hypot(dx, dz);
          if (length < 0.03) break;
          const step = Math.min(length, 0.08);
          moveCharacter(
            {
              seed: SEED,
              radius: 0.5,
              stepHeight: MAX_STEP_HEIGHT,
              maxSlope: PLAYER_MAX_CLIMB_SLOPE,
              grounded: true,
              swimming: false,
              ignoreFences: false,
            },
            x,
            y,
            z,
            (dx / length) * step,
            (dz / length) * step,
            out,
          );
          x = out.x;
          z = out.z;
          y = groundHeight(x, z, SEED);
        }
        expect(Math.hypot(x - to.x, z - to.z), `shore ${index}, reverse ${reverse}`).toBeLessThan(
          0.1,
        );
      }
    }
  });

  it('walks every pier/quay/stair joint in both directions without a gap or blocking rail', () => {
    for (const joint of GALE_HARBOR_JUNCTIONS) {
      expect(
        galeDeckSurface(joint.x, joint.z, terrain, WATER_LEVEL),
        `joint ${joint.a}/${joint.b} surface`,
      ).not.toBe(-Infinity);
      const inset = (index: number) => {
        const d = GALE_HARBOR_DECKS[index],
          dx = d.x - joint.x,
          dz = d.z - joint.z,
          length = Math.hypot(dx, dz);
        return { x: joint.x + (dx / length) * 0.85, z: joint.z + (dz / length) * 0.85 };
      };
      for (const reverse of [false, true]) {
        const from = inset(reverse ? joint.b : joint.a),
          to = inset(reverse ? joint.a : joint.b);
        let x = from.x,
          z = from.z,
          y = groundHeight(x, z, SEED);
        const out = { x, y, z, blocked: false, stepped: 0 };
        for (let i = 0; i < 70; i++) {
          const dx = to.x - x,
            dz = to.z - z,
            length = Math.hypot(dx, dz);
          if (length < 0.03) break;
          const step = Math.min(0.08, length);
          moveCharacter(
            {
              seed: SEED,
              radius: 0.5,
              stepHeight: MAX_STEP_HEIGHT,
              maxSlope: PLAYER_MAX_CLIMB_SLOPE,
              grounded: true,
              swimming: false,
              ignoreFences: false,
            },
            x,
            y,
            z,
            (dx / length) * step,
            (dz / length) * step,
            out,
          );
          const next = groundHeight(out.x, out.z, SEED);
          expect(Math.abs(next - y), `vertical gap ${joint.a}/${joint.b}`).toBeLessThan(0.22);
          x = out.x;
          z = out.z;
          y = next;
        }
        expect(
          Math.hypot(x - to.x, z - to.z),
          `joint ${joint.a}/${joint.b}, reverse ${reverse}`,
        ).toBeLessThan(0.1);
      }
    }
  });

  it('joins the north shore network flush: no step taller than a stride', () => {
    // walk the seam points where piers meet the boardwalk
    const seams: [number, number][] = [
      [469.5, 351], // north pier root on the boardwalk
      [467, 361.5], // mid pier root near the boardwalk elbow
      [453.5, 375.5], // ramp's south end at the deepwater pier root
    ];
    for (const [x, z] of seams) {
      const here = groundHeight(x, z, SEED);
      for (const [ox, oz] of [
        [1.2, 0],
        [-1.2, 0],
        [0, 1.2],
        [0, -1.2],
      ]) {
        const there = groundHeight(x + ox, z + oz, SEED);
        expect(Math.abs(there - here), `step at seam ${x},${z}`).toBeLessThan(1.1);
      }
    }
  });

  it('a player can walk from the shore out to the north pier tip', () => {
    const pier = GALE_HARBOR_DECKS[0];
    const dirx = Math.sin(pier.rot);
    const dirz = Math.cos(pier.rot);
    // start on dry land behind the boardwalk root
    let x = 468;
    let z = 347.5;
    const tip = { x: pier.x + dirx * (pier.hl - 1), z: pier.z + dirz * (pier.hl - 1) };
    // onto the boardwalk, then out along the pier centerline
    const waypoints = [{ x: 468.5, z: 351 }, { x: pier.x, z: pier.z }, tip];
    for (const wp of waypoints) {
      for (let i = 0; i < 60; i++) {
        const step = resolveMovement(SEED, x, z, wp.x, wp.z, 0.5);
        x = step.x;
        z = step.z;
        if (Math.hypot(x - wp.x, z - wp.z) < 0.6) break;
      }
    }
    expect(Math.hypot(x - tip.x, z - tip.z), 'reached the pier tip').toBeLessThan(1.5);
    const h = groundHeight(x, z, SEED);
    expect(h, 'standing on planks over the sea').toBeGreaterThan(WATER_LEVEL + 0.5);
    expect(terrain(x, z), 'water below the deck').toBeLessThan(WATER_LEVEL);
  });
});
