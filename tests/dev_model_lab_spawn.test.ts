import { describe, expect, it } from 'vitest';
import { visualKeyFor } from '../src/render/characters/manifest';
import { npcLookFor, npcModularKeyFor } from '../src/render/characters/npc_looks';
import { DEV_MODEL_COMPARISON_GALLERY, MOBS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { worldEntityText } from '../src/ui/world_entity_i18n';
import { EMPTY_TEST_WORLD } from './sim_shared';

function laboratory() {
  const sim = new Sim({
    seed: 42,
    playerClass: 'warrior',
    autoEquip: true,
    devCommands: true,
    world: EMPTY_TEST_WORLD,
  });
  sim.chat('/dev lab');
  const subjects = [...sim.entities.values()].filter(
    (entity) => entity.devSpawnOwnerId === sim.playerId,
  );
  return { sim, subjects };
}

function appearance(entity: Entity): string {
  const look = npcLookFor(entity.templateId, entity.kind);
  return look ? JSON.stringify([npcModularKeyFor(entity.templateId), look]) : visualKeyFor(entity);
}

describe('single model laboratory spawn plan', () => {
  it('spawns each appearance once across the gallery, NPC row and combat pads', () => {
    const { subjects } = laboratory();
    const byAppearance = new Map<string, string[]>();
    for (const entity of subjects) {
      const key = appearance(entity);
      byAppearance.set(key, [...(byAppearance.get(key) ?? []), entity.templateId]);
    }
    expect([...byAppearance.values()].filter((ids) => ids.length > 1)).toEqual([]);
    expect(subjects.filter((entity) => visualKeyFor(entity) === 'npc_dev_kobold')).toHaveLength(1);
    expect(subjects.filter((entity) => visualKeyFor(entity) === 'npc_apothecary_lin')).toHaveLength(
      1,
    );
    expect(subjects.filter((entity) => visualKeyFor(entity) === 'mob_ogre')).toHaveLength(1);
    expect(subjects.some((entity) => visualKeyFor(entity) === 'npc_dev_meshy_ogre')).toBe(false);
  });

  it('keeps distinct palettes and named modular appearances while retaining missing originals', () => {
    const { subjects } = laboratory();
    const keys = new Set(subjects.map(appearance));
    for (const key of [
      'npc_dev_troll',
      'npc_dev_troll_marsh',
      'npc_dev_troll_sand',
      'npc_dev_troll_rift',
    ]) {
      expect(keys.has(key), key).toBe(true);
    }
    expect(subjects.some((entity) => visualKeyFor(entity) === 'mob_boar')).toBe(true);
    for (const id of ['cook_marlow', 'keeper_bram']) {
      expect(subjects.some((entity) => entity.templateId === `dev_compare_npc_old_${id}`)).toBe(
        true,
      );
    }
    expect(subjects.some((entity) => entity.templateId === 'dev_compare_animal_old_wolf')).toBe(
      false,
    );
  });

  it('makes every displayed creature attackable without proximity or social aggression', () => {
    const { sim, subjects } = laboratory();
    const creatures = subjects.filter((entity) => {
      const row = DEV_MODEL_COMPARISON_GALLERY.byId.get(entity.templateId);
      return row?.category !== 'npc';
    });
    expect(creatures.length).toBeGreaterThan(60);
    for (const entity of creatures) {
      expect(entity.kind, entity.templateId).toBe('mob');
      const template = MOBS[entity.templateId];
      expect(template.aggroOnDamageOnly, entity.templateId).toBe(true);
      expect(template.aggroRadius, entity.templateId).toBe(0);
      expect(template.loot, entity.templateId).toEqual([]);
      expect(
        worldEntityText.en.entities.mobs[entity.templateId as `dev_compare_${string}`].name,
      ).toBe(entity.name);
      expect(entity.threat.size, entity.templateId).toBe(0);
      sim.ctx.dealDamage(sim.player, entity, 1, false, 'physical', 'Test Strike', 'hit');
      expect(entity.threat.get(sim.playerId), entity.templateId).toBeGreaterThan(0);
    }
  });

  it('retains the imported caster and elemental combat kits on their single specimens', () => {
    const { subjects } = laboratory();
    for (const [visual, source, mechanic] of [
      ['npc_dev_skeleton_cultist', 'dev_skeleton_cultist', 'petSpell'],
      ['npc_dev_skeleton_caster_v3', 'dev_skeleton_caster_v3', 'petSpell'],
      ['npc_dev_fire_elemental', 'dev_fire_elemental', 'smolder'],
      ['npc_dev_smart_imp', 'dev_smart_imp', 'petSpell'],
    ] as const) {
      const matching = subjects.filter((entity) => visualKeyFor(entity) === visual);
      expect(matching, visual).toHaveLength(1);
      expect(matching[0].kind).toBe('mob');
      expect(MOBS[matching[0].templateId][mechanic], visual).toEqual(MOBS[source][mechanic]);
      expect(MOBS[matching[0].templateId][mechanic], visual).toBeDefined();
    }
  });
});
