import { afterEach, describe, expect, it, vi } from 'vitest';
import { visualKeyFor } from '../src/render/characters/manifest';
import { updateAuras } from '../src/sim/combat/auras';
import { DEV_SPIDER_KITS } from '../src/sim/content/dev_spider_kits';
import { DEV_MODEL_COMPARISON_GALLERY as gallery, MOBS } from '../src/sim/data';
import { enterModelLabForDev } from '../src/sim/dev_commands';
import { createMob } from '../src/sim/entity';
import { updateMob } from '../src/sim/mob/locomotion';
import { runMobSwingAffixes } from '../src/sim/mob/mob_swing';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { SimEvent } from '../src/sim/types';
import { WORLD_WITHOUT_HUB_YARD } from './helpers/hub_yard';

function fixture(id: string) {
  const sim = new Sim({
    seed: 42,
    playerClass: 'mage',
    autoEquip: true,
    world: { ...WORLD_WITHOUT_HUB_YARD, camps: [], npcs: {}, groundObjects: [] },
  });
  sim.setPlayerLevel(60);
  const host = sim as unknown as { ctx: SimContext; nextId: number; emit(e: SimEvent): void };
  const ctx = host.ctx,
    player = sim.player;
  player.pos = ctx.groundPos(836, 48);
  player.prevPos = { ...player.pos };
  ctx.rebucket(player);
  player.hp = player.maxHp = 100000;
  const mob = createMob(host.nextId++, MOBS[id], 10, ctx.groundPos(837, 48));
  sim.entities.set(mob.id, mob);
  ctx.rebucket(mob);
  const events: SimEvent[] = [];
  ctx.emit = host.emit = (e) => {
    events.push(e);
  };
  vi.spyOn(ctx.rng, 'chance').mockReturnValue(true);
  const hit = () => runMobSwingAffixes(ctx, mob, player, { dealt: 10, crit: false, rawDmg: 10 });
  return { sim, ctx, player, mob, events, hit };
}

afterEach(() => vi.restoreAllMocks());

describe('existing spider effects on new appearance trials', () => {
  it('copies donor effect objects without bringing over stats or boss flags', () => {
    expect(DEV_SPIDER_KITS.dev_smart_spider.venom).toBe(MOBS.rift_venom_weaver.venom);
    expect(DEV_SPIDER_KITS.dev_smart_spider.ensnare).toBe(MOBS.rift_venom_weaver.ensnare);
    expect(DEV_SPIDER_KITS.dev_spider_forest.venom).toBe(MOBS.webwood_spider.venom);
    expect(DEV_SPIDER_KITS.dev_spider_forest.ensnare).toBe(MOBS.webwood_spider.ensnare);
    expect(DEV_SPIDER_KITS.dev_spider_marsh.critVuln).toBe(MOBS.mire_widow.critVuln);
    expect(DEV_SPIDER_KITS.dev_spider_broodmother.stackPoison).toBe(
      MOBS.mirefen_broodmother.stackPoison,
    );
    for (const [id, kit] of Object.entries(DEV_SPIDER_KITS)) {
      expect(MOBS[id]).toMatchObject({
        ...kit,
        aggroRadius: 0,
        aggroOnDamageOnly: true,
        idleStationary: true,
        loot: [],
        scale: 1,
      });
      expect(MOBS[id].boss).toBeUndefined();
      expect(MOBS[id].ccImmune).toBeUndefined();
      expect(MOBS[id].summonAdds).toBeUndefined();
      expect(MOBS[id].aoePulse).toBeUndefined();
    }
  });

  it.each([
    ['dev_spider_forest', 'Spider Venom', 2, 10, 'Sticky Web', 3],
    ['dev_smart_spider', 'Venom', 8, 8, 'Web', 2],
  ] as const)(
    '%s applies real poison damage and web root',
    (id, poison, damage, duration, web, rootDuration) => {
      const f = fixture(id);
      f.hit();
      expect(f.player.auras).toContainEqual(
        expect.objectContaining({
          id: `venom_${id}`,
          name: poison,
          kind: 'dot',
          school: 'nature',
          value: damage,
          duration,
        }),
      );
      expect(f.player.auras).toContainEqual(
        expect.objectContaining({
          id: `ensnare_${id}`,
          name: web,
          kind: 'root',
          duration: rootDuration,
        }),
      );
      const hp = f.player.hp;
      for (let i = 0; i < 40; i++) updateAuras(f.ctx, f.player);
      expect(f.player.hp).toBe(hp - damage);
      expect(f.events).toContainEqual(
        expect.objectContaining({
          type: 'damage',
          sourceId: f.mob.id,
          targetId: f.player.id,
          amount: damage,
          school: 'nature',
        }),
      );
    },
  );

  it('the marsh bite exposes the victim to the donor critical damage bonus', () => {
    const f = fixture('dev_spider_marsh');
    f.hit();
    expect(f.player.auras).toContainEqual(
      expect.objectContaining({
        name: 'Exposed Wound',
        kind: 'critvuln',
        value: 0.5,
        duration: 8,
        school: 'physical',
        sourceId: f.mob.id,
      }),
    );
    expect(f.player.auras.some((a) => a.kind === 'dot' || a.kind === 'root')).toBe(false);
  });

  it('brood venom stacks to five, deals nature damage and resets after expiring', () => {
    const f = fixture('dev_spider_broodmother');
    for (let i = 0; i < 9; i++) f.hit();
    expect(
      f.player.auras.filter((a) => a.id === 'stackpoison_dev_spider_broodmother'),
    ).toHaveLength(1);
    expect(f.player.auras).toContainEqual(
      expect.objectContaining({
        name: 'Brood Venom',
        kind: 'dot',
        stacks: 5,
        value: 15,
        duration: 12,
        school: 'nature',
      }),
    );
    const hp = f.player.hp;
    for (let i = 0; i < 40; i++) updateAuras(f.ctx, f.player);
    expect(f.player.hp).toBe(hp - 15);
    for (let i = 0; i < 220; i++) updateAuras(f.ctx, f.player);
    expect(f.player.auras.some((a) => a.id === 'stackpoison_dev_spider_broodmother')).toBe(false);
    f.hit();
    expect(f.player.auras).toContainEqual(
      expect.objectContaining({ name: 'Brood Venom', stacks: 1, value: 3 }),
    );
  });

  it.each(['dev_spider_sand', 'dev_spider_frost'])(
    '%s retains an ordinary bite without invented procs',
    (id) => {
      const f = fixture(id);
      f.hit();
      expect(f.player.auras).toEqual([]);
      expect(MOBS[id].frostbite).toBeUndefined();
      expect(MOBS[id].chillOnHit).toBeUndefined();
    },
  );

  it('spawns each appearance as one attackable owner-scoped mob, replacing its mannequin', () => {
    const f = fixture('dev_smart_spider');
    enterModelLabForDev(f.ctx, f.player.id);
    const rows = gallery.subjects.filter((s) => s.combatMobId);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      const subjects = [...f.sim.entities.values()].filter(
        (e) => e.templateId === row.combatMobId && e.devSpawnOwnerId === f.player.id,
      );
      expect(subjects).toHaveLength(1);
      expect(subjects[0]).toMatchObject({
        kind: 'mob',
        level: 20,
        facing: row.facing,
        pos: { x: row.x, z: row.z },
      });
      expect(visualKeyFor(subjects[0])).toBe(row.visualKey);
      expect([...f.sim.entities.values()].some((e) => e.templateId === row.templateId)).toBe(false);
    }
    const forest = [...f.sim.entities.values()].find((e) => e.templateId === 'dev_spider_forest');
    if (!forest) throw new Error('Missing lab forest spider');
    f.player.pos = f.ctx.groundPos(forest.pos.x + 1, forest.pos.z);
    f.ctx.rebucket(f.player);
    for (const row of rows) {
      const mob = [...f.sim.entities.values()].find((e) => e.templateId === row.combatMobId);
      if (!mob) throw new Error('Missing lab spider');
      updateMob(f.ctx, mob);
      expect(mob.aggroTargetId).toBeNull();
    }
    f.ctx.dealDamage(f.player, forest, 1, false, 'physical', null, 'hit', true);
    expect(forest.aggroTargetId).toBe(f.player.id);
    for (const row of rows.filter((r) => r.combatMobId !== forest.templateId)) {
      const other = [...f.sim.entities.values()].find((e) => e.templateId === row.combatMobId);
      if (!other) throw new Error('Missing lab spider');
      updateMob(f.ctx, other);
      expect(other.aggroTargetId).toBeNull();
    }
    expect(f.sim.player.dead).toBe(false);
  });

  it('leaves production spider mechanics intact', () => {
    expect(MOBS.webwood_spider.venom).toMatchObject({
      chance: 0.35,
      perTick: 2,
      interval: 2,
      duration: 10,
    });
    expect(MOBS.mirefen_broodmother).toMatchObject({
      boss: true,
      scale: 1.4,
      stackPoison: { perTick: 3, maxStacks: 5 },
    });
    expect(MOBS.rift_boss_venom).toMatchObject({
      boss: true,
      summonAdds: { count: 3 },
      bigCast: { castId: 'rift_venom_deluge' },
    });
    expect(MOBS.bonechill_widow.frostbite).toBeUndefined();
    expect(MOBS.canopy_weaver.venom).toBeUndefined();
  });
});
