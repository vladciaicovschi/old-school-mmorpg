import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { updateMob } from '../src/sim/mob/locomotion';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { SimEvent } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';
import { WORLD_WITHOUT_HUB_YARD } from './helpers/hub_yard';

function fixture(distance = 12, forceHit = true, templateId = 'dev_smart_imp') {
  const sim = new Sim({
    seed: 42,
    playerClass: 'rogue',
    autoEquip: true,
    world: { ...WORLD_WITHOUT_HUB_YARD, camps: [], npcs: {}, groundObjects: [] },
  });
  sim.setPlayerLevel(10);
  const host = sim as unknown as {
    ctx: SimContext;
    nextId: number;
    tickCount: number;
    emit(event: SimEvent): void;
  };
  const player = sim.player;
  player.pos = { x: 819, y: groundHeight(819, 0, 42), z: 0 };
  player.prevPos = { ...player.pos };
  player.hp = player.maxHp = 10000;
  const mob = createMob(host.nextId++, MOBS[templateId], 10, {
    ...player.pos,
    x: player.pos.x + distance,
  });
  sim.addEntity(mob);
  const events: SimEvent[] = [];
  host.emit = (event) => events.push(event);
  host.ctx.emit = host.emit;
  if (forceHit) vi.spyOn(host.ctx.rng, 'chance').mockReturnValue(false);
  const step = (count = 1) => {
    for (let i = 0; i < count; i++) {
      host.tickCount++;
      updateMob(host.ctx, mob);
    }
  };
  const pull = () => {
    host.ctx.dealDamage(player, mob, 1, false, 'physical', null, 'hit', true);
    events.length = 0;
    mob.swingTimer = 0;
  };
  const fx = (kind: string) =>
    events.filter((e) => e.type === 'spellfx' && e.sourceId === mob.id && e.fx === kind);
  return { mob, player, events, step, pull, fx };
}
afterEach(() => vi.restoreAllMocks());
describe('test-island imp Felbolt combat', () => {
  it('uses the existing Emberkin spell identity without changing the summoned pet', () => {
    expect(MOBS.dev_smart_imp.petSpell).toMatchObject({
      name: 'Felbolt',
      ability: 'emberkin_felbolt',
      school: 'fire',
      min: 8,
      max: 11,
      range: 25,
      every: 2,
      windup: 0.45,
    });
    expect(MOBS.emberkin.petRanged).toMatchObject({
      name: 'Felbolt',
      ability: 'emberkin_felbolt',
      school: 'fire',
      range: 25,
      active: { cooldown: 8 },
    });
    expect(MOBS.emberkin.petSpell).toBeUndefined();
  });
  it.each([1, 12])(
    'casts a telegraphed fire attack instead of physical swings at distance %s',
    (distance) => {
      const f = fixture(distance);
      f.step(10);
      expect(f.fx('windup')).toHaveLength(0);
      expect(f.fx('projectile')).toHaveLength(0);
      f.pull();
      f.step(2);
      expect(f.fx('windup')).toEqual([
        expect.objectContaining({ ability: 'emberkin_felbolt', school: 'fire' }),
      ]);
      expect(f.fx('projectile')).toHaveLength(0);
      f.step(8);
      expect(f.fx('projectile')).toHaveLength(0);
      f.step();
      expect(f.fx('projectile')).toEqual([
        expect.objectContaining({
          ability: 'emberkin_felbolt',
          school: 'fire',
          targetId: f.player.id,
        }),
      ]);
      expect(f.events).toContainEqual(
        expect.objectContaining({
          type: 'damage',
          sourceId: f.mob.id,
          school: 'fire',
          ability: 'Felbolt',
        }),
      );
      expect(
        f.events.some(
          (e) => e.type === 'damage' && e.sourceId === f.mob.id && e.school === 'physical',
        ),
      ).toBe(false);
      expect(f.mob.autoAttack).toBe(false);
      f.step(40);
      expect(f.fx('projectile')).toHaveLength(2);
    },
  );
  it('moves into spell range without launching bolts from outside it', () => {
    const f = fixture(35);
    f.pull();
    const start = f.mob.pos.x;
    f.step(5);
    expect(f.mob.pos.x).toBeLessThan(start);
    expect(f.fx('windup')).toHaveLength(0);
    expect(f.fx('projectile')).toHaveLength(0);
  });
  it('keeps the seeded combat event sequence deterministic', () => {
    const run = () => {
      const f = fixture(12, false);
      f.pull();
      f.step(100);
      return f.events;
    };
    expect(run()).toEqual(run());
  });
  it('preserves the legacy instant bolt event shape when no ability is configured', () => {
    const f = fixture(12, true, 'warlock_imp');
    f.pull();
    f.step(2);
    expect(f.fx('windup')).toHaveLength(0);
    expect(f.fx('projectile')).toEqual([
      {
        type: 'spellfx',
        sourceId: f.mob.id,
        targetId: f.player.id,
        school: 'fire',
        fx: 'projectile',
      },
    ]);
    f.step(40);
    expect(f.fx('projectile')).toHaveLength(2);
  });
});
