import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { addWickharborPierDetails } from '../src/render/wickharbor_pier_details';
import { BUILTIN_WORLD } from '../src/sim/data';
import { buildDecorPropColliders } from '../src/sim/decor_prop_colliders';
import { GALE_HARBOR_DECKS } from '../src/sim/gale_harbor';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { MAX_STEP_HEIGHT, moveCharacter } from '../src/sim/physics';
import {
  boardingCoordinates,
  boardingHeight,
  SHIP_MAIN_DECK_Y,
  shipPoint,
  wickharborBoardingRuns,
} from '../src/sim/wickharbor_boarding';
import { WICKHARBOR_PIER_CARGO, wickharborCargoSurface } from '../src/sim/wickharbor_pier_cargo';
import { WICKHARBOR_VESSELS } from '../src/sim/wickharbor_vessels';
import { groundHeight, terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';
import { settlementScene } from './helpers/settlement_scene';

const terrain = (x: number, z: number) => terrainHeight(x, z, WORLD_SEED);
describe('Wickharbor boarding and working piers', () => {
  it('walks both ways across every alongside gangway using the real character solver', () => {
    const runs = wickharborBoardingRuns(terrain, WATER_LEVEL);
    expect(runs).toHaveLength(6);
    for (const run of runs) {
      const deck = GALE_HARBOR_DECKS[run.deck],
        dx = run.end.x - run.start.x,
        dz = run.end.z - run.start.z;
      expect(dx * Math.sin(deck.rot) + dz * Math.cos(deck.rot)).toBeCloseTo(0, 8);
      expect(run.width).toBeLessThanOrEqual(1.15);
    }
    for (const run of runs) {
      for (const reverse of [false, true]) {
        const a = reverse ? run.end : run.start,
          b = reverse ? run.start : run.end;
        let x = a.x,
          z = a.z,
          y = groundHeight(x, z, WORLD_SEED);
        const out = { x, y, z, blocked: false, stepped: 0 };
        for (let i = 0; i < 150; i++) {
          const dx = b.x - x,
            dz = b.z - z,
            length = Math.hypot(dx, dz);
          if (length < 0.05) break;
          const step = Math.min(length, 0.12);
          moveCharacter(
            {
              seed: WORLD_SEED,
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
          y = groundHeight(x, z, WORLD_SEED);
          expect(y).toBeGreaterThan(WATER_LEVEL + 0.5);
        }
        expect(Math.hypot(x - b.x, z - b.z), `berth ${run.vessel} reverse ${reverse}`).toBeLessThan(
          0.15,
        );
      }
    }
  });
  it('exposes a central working deck while preserving solid hull collision below it', () => {
    const ships = WICKHARBOR_VESSELS.filter((p) => p.key !== 'wickRowboat');
    const colliders = buildDecorPropColliders(WORLD_SEED, [...ships]);
    expect(colliders).toHaveLength(7);
    for (const [i, ship] of ships.entries()) {
      const top = WATER_LEVEL - (ship.float ?? 0) + SHIP_MAIN_DECK_Y * ship.scale;
      expect(colliders[i].moveTopY).toBeCloseTo(top);
      expect(colliders[i].standable).toBeUndefined();
      const p = shipPoint(ship, 0.8, -2);
      expect(groundHeight(p.x, p.z, WORLD_SEED)).toBeCloseTo(top);
    }
  });
  it('keeps cargo on the planks and out of central aisles and boarding mouths', () => {
    expect(WICKHARBOR_PIER_CARGO.length).toBeGreaterThan(8);
    for (const cargo of WICKHARBOR_PIER_CARGO) {
      expect(BUILTIN_WORLD.props.decorProps).toContain(cargo);
      const deck = GALE_HARBOR_DECKS.find((d) => {
        const dx = cargo.x - d.x,
          dz = cargo.z - d.z;
        return (
          Math.abs(dx * Math.sin(d.rot) + dz * Math.cos(d.rot)) < d.hl &&
          Math.abs(dx * Math.cos(d.rot) - dz * Math.sin(d.rot)) < d.hw
        );
      });
      expect(deck).toBeDefined();
      expect(wickharborCargoSurface(cargo, terrain, WATER_LEVEL)).toBeCloseTo(
        groundHeight(cargo.x, cargo.z, WORLD_SEED) - 0.05,
      );
      for (const run of wickharborBoardingRuns(terrain, WATER_LEVEL))
        expect(Math.hypot(cargo.x - run.start.x, cargo.z - run.start.z)).toBeGreaterThan(1.4);
    }
  });
  it('fits native pack parts to gangway support heights and batches repeated rope geometry', async () => {
    const models = Object.fromEntries(
      await Promise.all(
        ['yard-post', 'yard-deck'].map(async (id) => [
          id,
          await settlementScene(`public/models/wickharbor/${id.replaceAll('-', '_')}.glb`),
        ]),
      ),
    );
    const group = new THREE.Group();
    addWickharborPierDetails(group, models, terrain, WATER_LEVEL);
    expect(group.children.length).toBeGreaterThan(100);
    const ropes = group.children.filter((o) => o.name === 'wickharbor:hemp-rope') as THREE.Mesh[];
    expect(new Set(ropes.map((o) => (o as THREE.Mesh).geometry)).size).toBe(1);
    for (const rope of ropes) {
      const mat = rope.material as THREE.MeshStandardMaterial;
      expect(mat.map).toBeNull();
      expect(mat.vertexColors).toBe(false);
      expect(mat.color.r).toBeGreaterThan(0.4);
      expect(mat.color.g).toBeGreaterThan(0.3);
    }
    group.updateWorldMatrix(true, true);
    const piles = group.children.filter(
      (o) => o.name === 'wickharbor:continuous-pile',
    ) as THREE.Mesh[];
    expect(piles.length).toBeGreaterThan(50);
    for (const pile of piles) {
      const box = new THREE.Box3().setFromObject(pile);
      expect(box.min.y).toBeCloseTo(pile.userData.pileBase);
      expect(box.max.y).toBeCloseTo(pile.userData.pileTop);
      expect(box.min.y).toBeLessThan(terrain(pile.position.x, pile.position.z));
      expect(
        (pile.geometry as THREE.CylinderGeometry).parameters.radialSegments,
      ).toBeGreaterThanOrEqual(8);
    }
    for (const run of wickharborBoardingRuns(terrain, WATER_LEVEL)) {
      for (const pile of piles) {
        const p = boardingCoordinates(run, pile.position.x, pile.position.z);
        expect(p.t > 0.05 && p.t < 0.95 && Math.abs(p.across) < run.width / 2).toBe(false);
      }
      for (const t of [0.12, 0.4, 0.431, 0.92]) {
        const x = run.start.x + (run.end.x - run.start.x) * t,
          z = run.start.z + (run.end.z - run.start.z) * t;
        const hit = new THREE.Raycaster(
          new THREE.Vector3(x, 10, z),
          new THREE.Vector3(0, -1, 0),
        ).intersectObject(group, true)[0];
        expect(hit).toBeDefined();
        expect(hit.point.y).toBeCloseTo(boardingHeight(run, t), 1);
      }
    }
  });
});
