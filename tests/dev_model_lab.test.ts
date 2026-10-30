import { describe, expect, it } from 'vitest';
import { resolvePosition } from '../src/sim/colliders';
import {
  DEV_MODEL_LAB_ARRIVAL,
  DEV_MODEL_LAB_MOB_LINEUP,
  DEV_MODEL_LAB_MOBS,
  DEV_MODEL_LAB_NPC_LINEUP,
  DEV_MODEL_LAB_NPCS,
  DEV_MODEL_LAB_PROPS,
  DEV_MODEL_LAB_ROADS,
  DEV_MODEL_LAB_X_OFFSET,
  DEV_MODEL_LAB_ZONE,
  isOnDevModelLab,
} from '../src/sim/content/dev_model_lab';
import {
  PROVING_SHORE_ARRIVAL,
  PROVING_SHORE_PROPS,
  PROVING_SHORE_ROADS,
} from '../src/sim/content/proving_shore';
import { DEV_MODEL_COMPARISON_GALLERY, PROPS, ROADS, ZONES } from '../src/sim/data';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

describe('developer model laboratory', () => {
  it('is a separate translated island with no overlap with the tutorial', () => {
    expect(isOnDevModelLab(DEV_MODEL_LAB_ARRIVAL.x, DEV_MODEL_LAB_ARRIVAL.z)).toBe(true);
    expect(isOnDevModelLab(PROVING_SHORE_ARRIVAL.x, PROVING_SHORE_ARRIVAL.z)).toBe(false);
    expect(DEV_MODEL_LAB_ARRIVAL.x).toBe(PROVING_SHORE_ARRIVAL.x + DEV_MODEL_LAB_X_OFFSET);
    expect(DEV_MODEL_LAB_ZONE.xMin).toBeGreaterThanOrEqual(540);
    expect(ZONES).toContain(DEV_MODEL_LAB_ZONE);
  });

  it('copies the tutorial roads and visible dressing at the x offset', () => {
    expect(DEV_MODEL_LAB_ROADS).toEqual(
      PROVING_SHORE_ROADS.map((road) =>
        road.map((point) => ({ x: point.x + DEV_MODEL_LAB_X_OFFSET, z: point.z })),
      ),
    );
    expect(ROADS).toEqual(expect.arrayContaining(DEV_MODEL_LAB_ROADS));
    expect(DEV_MODEL_LAB_PROPS.campfires).toEqual(
      PROVING_SHORE_PROPS.campfires.map(([x, z]) => [x + DEV_MODEL_LAB_X_OFFSET, z]),
    );
    for (const fire of DEV_MODEL_LAB_PROPS.campfires) expect(PROPS.campfires).toContain(fire);
  });

  it('places the arrival and all three test areas on dry ground', () => {
    for (const point of [
      DEV_MODEL_LAB_ARRIVAL,
      ...DEV_MODEL_LAB_ZONE.pois,
      ...DEV_MODEL_LAB_NPC_LINEUP,
      ...DEV_MODEL_LAB_MOB_LINEUP,
    ]) {
      expect(terrainHeight(point.x, point.z, WORLD_SEED), `${point.x},${point.z}`).toBeGreaterThan(
        WATER_LEVEL,
      );
    }
  });

  it('keeps imported combat bodies in the developer mob lineup', () => {
    expect(Object.keys(DEV_MODEL_LAB_NPCS)).toEqual([]);
    expect(Object.keys(DEV_MODEL_LAB_MOBS)).toEqual([
      'dev_rogue_minion',
      'dev_rogue_assassin',
      'dev_skeleton_minion',
      'dev_skeleton_warrior',
      'dev_skeleton_cultist',
      'dev_skeleton_acolyte',
      'dev_kobold',
      'dev_troll',
      'dev_bone_golem',
      'dev_meshy_murlok',
      'dev_meshy_ogre',
      'dev_skeleton_necromancer_v2',
      'dev_skeleton_caster_v3',
      'dev_skeleton_rogue_v3',
      'dev_treant_v2',
      'dev_fire_elemental',
      'dev_ice_elemental',
      'dev_water_elemental',
      'dev_storm_elemental',
      'dev_stone_elemental',
      'dev_smart_bear',
      'dev_smart_wolf',
      'dev_smart_wolf_v2',
      'dev_smart_goat',
      'dev_smart_bufalo',
      'dev_smart_deer',
      'dev_smart_raptor',
      'dev_smart_imp',
      'dev_smart_spider',
      'dev_spider_forest',
      'dev_spider_marsh',
      'dev_spider_sand',
      'dev_spider_frost',
      'dev_spider_broodmother',
    ]);
    for (const template of Object.values(DEV_MODEL_LAB_MOBS)) {
      expect(template.aggroRadius).toBe(0);
      expect(template.aggroOnDamageOnly).toBe(true);
      if (template.id === 'dev_smart_goat') expect(template.moveSpeed).toBe(3.4);
      else if (template.id === 'dev_smart_bufalo') expect(template.moveSpeed).toBe(4.2);
      else if (template.id === 'dev_smart_deer') expect(template.moveSpeed).toBe(4);
      else if (template.id === 'dev_smart_raptor') expect(template.moveSpeed).toBe(4.8);
      else if (template.id === 'dev_smart_imp') expect(template.moveSpeed).toBe(4.8);
      else expect(template.moveSpeed).toBeGreaterThan(5.2);
      expect(template.idleStationary).toBe(true);
      expect(DEV_MODEL_LAB_MOB_LINEUP.some((subject) => subject.templateId === template.id)).toBe(
        template.id !== 'dev_smart_wolf' &&
          !DEV_MODEL_COMPARISON_GALLERY.subjects.some((s) => s.combatMobId === template.id),
      );
    }
  });

  it('places exactly one of every combat model with isolated testing space', () => {
    const ids = DEV_MODEL_LAB_MOB_LINEUP.map((subject) => subject.templateId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(
      new Set(
        Object.keys(DEV_MODEL_LAB_MOBS).filter(
          (id) =>
            id !== 'dev_smart_wolf' &&
            !DEV_MODEL_COMPARISON_GALLERY.subjects.some((s) => s.combatMobId === id),
        ),
      ),
    );
    expect(ids).not.toContain('dev_smart_wolf');
    expect(ids).toContain('dev_smart_wolf_v2');
    expect(ids).not.toContain('dev_meshy_treant');
    expect(ids).not.toContain('dev_skeleton_rogue');
    expect(ids).toContain('dev_treant_v2');
    expect(ids).toContain('dev_skeleton_rogue_v3');
    for (const [index, a] of DEV_MODEL_LAB_MOB_LINEUP.entries()) {
      for (const b of DEV_MODEL_LAB_MOB_LINEUP.slice(index + 1)) {
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(24);
      }
      for (const npc of DEV_MODEL_LAB_NPC_LINEUP) {
        expect(Math.hypot(a.x - npc.x, a.z - npc.z)).toBeGreaterThan(16);
      }
    }
  });

  it('keeps the subjects and their melee approaches clear of solid props', () => {
    for (const point of [...DEV_MODEL_LAB_NPC_LINEUP, ...DEV_MODEL_LAB_MOB_LINEUP]) {
      for (const [dx, dz] of [
        [0, 0],
        [3, 0],
        [-3, 0],
        [0, 3],
        [0, -3],
      ]) {
        const x = point.x + dx;
        const z = point.z + dz;
        const resolved = resolvePosition(WORLD_SEED, x, z);
        expect(Math.hypot(resolved.x - x, resolved.z - z), `${x},${z}`).toBeLessThan(0.001);
      }
    }
  });

  it('keeps the test floor level across arrival, gallery and each combat pad for every seed', () => {
    for (const seed of [1, 42, WORLD_SEED]) {
      const height = terrainHeight(DEV_MODEL_LAB_ARRIVAL.x, DEV_MODEL_LAB_ARRIVAL.z, seed);
      for (const point of [
        DEV_MODEL_LAB_ARRIVAL,
        ...DEV_MODEL_LAB_NPC_LINEUP,
        ...DEV_MODEL_LAB_MOB_LINEUP,
      ]) {
        for (const [dx, dz] of [
          [0, 0],
          [6, 0],
          [-6, 0],
          [0, 6],
          [0, -6],
        ]) {
          expect(
            terrainHeight(point.x + dx, point.z + dz, seed),
            `${point.x + dx},${point.z + dz}`,
          ).toBeCloseTo(height, 6);
        }
      }
    }
  });
});
