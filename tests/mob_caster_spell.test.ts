import { describe, expect, it, vi } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { respawnMob } from '../src/sim/mob/lifecycle';
import { resetEvadingMob, updateMob } from '../src/sim/mob/locomotion';
import { advancePendingProjectiles } from '../src/sim/projectile_travel';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { AuraKind, SimEvent } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';
import { WORLD_WITHOUT_HUB_YARD } from './helpers/hub_yard';

const CASTERS = [
  'dev_skeleton_cultist',
  'dev_skeleton_acolyte',
  'dev_skeleton_necromancer_v2',
  'dev_skeleton_caster_v3',
];
function fixture(templateId = CASTERS[0], distance = 12) {
  const sim = new Sim({
    seed: 42,
    playerClass: 'rogue',
    autoEquip: true,
    world: { ...WORLD_WITHOUT_HUB_YARD, camps: [], npcs: {}, groundObjects: [] },
  });
  sim.setPlayerLevel(20);
  const host = sim as unknown as { ctx: SimContext; nextId: number; emit(event: SimEvent): void };
  const ctx = host.ctx;
  sim.player.pos = { x: 819, y: groundHeight(819, 0, 42), z: 0 };
  sim.player.prevPos = { ...sim.player.pos };
  sim.player.hp = sim.player.maxHp = 10000;
  const mob = createMob(host.nextId++, MOBS[templateId], 10, {
    ...sim.player.pos,
    x: sim.player.pos.x + distance,
  });
  sim.entities.set(mob.id, mob);
  ctx.rebucket(mob);
  mob.hp = mob.maxHp = 10000;
  const events: SimEvent[] = [];
  ctx.emit = (event) => events.push(event);
  host.emit = (event) => events.push(event);
  vi.spyOn(ctx.rng, 'chance').mockReturnValue(true);
  const step = () => {
    advancePendingProjectiles(ctx);
    updateMob(ctx, mob);
  };
  const pull = () => {
    ctx.dealDamage(sim.player, mob, 1, false, 'physical', null, 'hit', true);
    events.length = 0;
    mob.swingTimer = 0;
  };
  const start = () => {
    pull();
    for (let i = 0; i < 5 && !mob.castingAbility; i++) step();
    expect(mob.castingAbility).toBe(MOBS[templateId].petSpell?.ability);
  };
  const release = () => {
    for (
      let i = 0;
      i < 100 && !events.some((e) => e.type === 'spellfx' && e.fx === 'projectile');
      i++
    )
      step();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'spellfx',
        fx: 'projectile',
        ability: MOBS[templateId].petSpell?.ability,
        sourceId: mob.id,
      }),
    );
  };
  const control = (kind: AuraKind, school: 'shadow' | 'fire' = 'shadow') => {
    ctx.applyAura(mob, {
      id: `test_${kind}`,
      name: 'Test control',
      kind,
      duration: 5,
      remaining: 5,
      value: kind === 'tongues' ? 2 : 0,
      sourceId: sim.playerId,
      school,
    });
  };
  return { sim, ctx, mob, events, step, pull, start, release, control };
}

describe('lab caster real combat loop', () => {
  it('enables timed casts only for the four magical lab subjects', () => {
    expect(
      Object.values(MOBS)
        .filter((mob) => mob.petSpell?.castTime !== undefined)
        .map((mob) => mob.id)
        .sort(),
    ).toEqual([...CASTERS].sort());
  });
  it.each([respawnMob, resetEvadingMob])(
    'clears preparation on direct lifecycle reset ($name)',
    (reset) => {
      const f = fixture();
      f.start();
      reset(f.ctx, f.mob);
      expect(f.mob.castingAbility).toBeNull();
      expect(f.mob.castTotal).toBe(0);
      expect(f.mob.castTargetId).toBeNull();
      expect(f.events).toContainEqual({ type: 'castStop', entityId: f.mob.id, success: false });
    },
  );
  it('evades an unreachable target behind a wall even while inside spell range', () => {
    const f = fixture();
    f.pull();
    vi.spyOn(f.ctx, 'lineOfSightBlocked').mockReturnValue(true);
    vi.spyOn(f.ctx, 'moveToward').mockReturnValue(false);
    vi.spyOn(f.ctx, 'resolveMovePoint').mockImplementation(() => ({ ...f.mob.pos }));
    for (let i = 0; i < 110 && f.mob.aiState !== 'evade'; i++) f.step();
    expect(f.mob.aiState).toBe('evade');
    expect(f.mob.castingAbility).toBeNull();
    expect(f.ctx.pendingProjectiles).toHaveLength(0);
  });
  it('keeps the old imp spell path instant and untouched', () => {
    const f = fixture('warlock_imp');
    f.pull();
    const legacy = vi.spyOn(f.ctx, 'updateRangedPetAttack');
    for (let i = 0; i < 12; i++) f.step();
    expect(legacy).toHaveBeenCalled();
    expect(f.events.some((e) => e.type === 'castStart')).toBe(false);
    expect(f.events).toContainEqual(
      expect.objectContaining({ type: 'spellfx', fx: 'projectile', school: 'fire' }),
    );
    expect(f.ctx.pendingProjectiles).toHaveLength(0);
  });
  it.each(['silence', 'stun', 'polymorph'] as const)(
    'cancels on %s and resumes with a fresh full preparation',
    (kind) => {
      const f = fixture();
      f.start();
      f.step();
      f.control(kind);
      f.step();
      expect(f.mob.castingAbility).toBeNull();
      expect(f.mob.castTotal).toBe(0);
      expect(f.mob.castTargetId).toBeNull();
      for (let i = 0; i < 100; i++) f.step();
      expect(f.ctx.pendingProjectiles).toHaveLength(0);
      expect(f.events.some((e) => e.type === 'spellfx')).toBe(false);
      f.mob.auras = [];
      f.mob.swingTimer = 0;
      f.step();
      expect(f.mob.castRemaining).toBe(1.7);
    },
  );
  it('honors school-specific lockout before starting, but root does not cancel a stationary cast', () => {
    const f = fixture();
    f.pull();
    f.control('lockout');
    for (let i = 0; i < 100; i++) f.step();
    expect(f.mob.castingAbility).toBeNull();
    expect(f.events.some((e) => e.type === 'castStart')).toBe(false);
    f.mob.auras = [];
    f.control('lockout', 'fire');
    f.control('root');
    f.step();
    expect(f.mob.castRemaining).toBe(1.7);
    f.release();
    expect(f.ctx.pendingProjectiles).toHaveLength(1);
  });
  it('slows preparation under Tongues without compressing the release or recasting midcast', () => {
    const f = fixture();
    f.control('tongues');
    f.start();
    expect(f.mob.castTotal).toBe(3.4);
    for (let i = 0; i < 50; i++) f.step();
    expect(f.mob.castingAbility).toBe('shadow_bolt');
    expect(f.ctx.pendingProjectiles).toHaveLength(0);
    f.release();
    expect(f.events.filter((e) => e.type === 'castStart')).toHaveLength(1);
  });
  it('uses the hostile spell resist floor and applies no damage on a full resist', () => {
    const f = fixture();
    f.start();
    f.release();
    const hitRoll = vi.mocked(f.ctx.rng.chance);
    hitRoll.mockClear();
    hitRoll.mockReturnValue(false);
    const damageRoll = vi.spyOn(f.ctx.rng, 'range');
    damageRoll.mockClear();
    for (let i = 0; i < 20 && f.ctx.pendingProjectiles.length; i++) f.step();
    expect(hitRoll).toHaveBeenCalledWith(0.82);
    expect(damageRoll).not.toHaveBeenCalled();
    expect(f.sim.player.hp).toBe(10000);
    expect(f.events).toContainEqual(
      expect.objectContaining({
        type: 'damage',
        kind: 'resist',
        amount: 0,
        ability: 'shadow_bolt',
      }),
    );
  });
  it('preserves template/level damage and the hostile ranged tuning multiplier on impact', () => {
    const f = fixture();
    f.mob.rangedDamageMult = 1.5;
    f.start();
    f.release();
    const damageRoll = vi.spyOn(f.ctx.rng, 'range').mockReturnValue(20);
    // Isolate base damage from the independently tested on-hit curse roll.
    vi.mocked(f.ctx.rng.chance).mockImplementation((chance) => chance === 0.82);
    for (let i = 0; i < 20 && f.ctx.pendingProjectiles.length; i++) f.step();
    expect(damageRoll).toHaveBeenCalledWith(13, 19);
    expect(f.sim.player.hp).toBe(9970);
    expect(f.events).toContainEqual(
      expect.objectContaining({
        type: 'damage',
        amount: 30,
        school: 'shadow',
        ability: 'shadow_bolt',
      }),
    );
  });
  it('does not resolve a projectile after its caster dies in flight', () => {
    const f = fixture();
    f.start();
    f.release();
    f.mob.dead = true;
    advancePendingProjectiles(f.ctx);
    expect(f.ctx.pendingProjectiles).toHaveLength(0);
    expect(f.sim.player.hp).toBe(10000);
  });
  it('does not redirect preparation when threat switches to another player', () => {
    const f = fixture();
    f.start();
    const pid = f.sim.addPlayer('warrior', 'Second target');
    const target = f.sim.entities.get(pid);
    if (!target) throw new Error('Second player missing');
    target.pos = { ...f.sim.player.pos, z: 2 };
    target.prevPos = { ...target.pos };
    f.ctx.rebucket(target);
    f.mob.forcedTargetId = pid;
    f.mob.forcedTargetTimer = 5;
    f.step();
    expect(f.mob.aggroTargetId).toBe(pid);
    expect(f.mob.castingAbility).toBeNull();
    expect(f.ctx.pendingProjectiles).toHaveLength(0);
    f.mob.swingTimer = 0;
    f.step();
    expect(f.mob.castTargetId).toBe(pid);
    expect(f.mob.castRemaining).toBe(1.7);
  });
  it('cancels if the target despawns and clears the old target identity', () => {
    const f = fixture();
    f.start();
    f.sim.entities.delete(f.sim.playerId);
    f.step();
    expect(f.mob.castingAbility).toBeNull();
    expect(f.mob.castTargetId).toBeNull();
    expect(f.ctx.pendingProjectiles).toHaveLength(0);
  });
  it('does not start or complete a cast without line of sight', () => {
    const f = fixture();
    f.pull();
    const sight = vi.spyOn(f.ctx, 'lineOfSightBlocked').mockReturnValue(true);
    f.step();
    expect(f.mob.castingAbility).toBeNull();
    expect(f.mob.aiState).toBe('chase');
    sight.mockReturnValue(false);
    f.mob.swingTimer = 0;
    f.step();
    expect(f.mob.castingAbility).toBe('shadow_bolt');
    sight.mockReturnValue(true);
    f.step();
    expect(f.mob.castingAbility).toBeNull();
    expect(f.ctx.pendingProjectiles).toHaveLength(0);
  });
  it('accepts the exact range boundary and chases beyond it without swinging', () => {
    const inside = fixture(CASTERS[0], 24);
    inside.start();
    expect(inside.mob.castingAbility).toBe('shadow_bolt');
    const outside = fixture(CASTERS[0], 24.01);
    outside.pull();
    outside.step();
    expect(outside.mob.castingAbility).toBeNull();
    expect(outside.mob.aiState).toBe('chase');
    expect(outside.mob.autoAttack).toBe(false);
  });
  it('repeats on the authored 3.2 second cadence without melee or animation-only swings', () => {
    const f = fixture();
    f.start();
    const starts = [0];
    for (let tick = 1; tick <= 140; tick++) {
      const before = f.events.filter((e) => e.type === 'castStart').length;
      f.step();
      if (f.events.filter((e) => e.type === 'castStart').length > before) starts.push(tick);
    }
    expect(starts).toEqual([0, 64, 128]);
    expect(f.events.some((e) => e.type === 'damage' && e.school === 'physical')).toBe(false);
  });
  it('runs the same cast/projectile sequence through the full Sim.tick on repeated seeds', () => {
    const run = () => {
      const f = fixture();
      vi.mocked(f.ctx.rng.chance).mockRestore();
      f.pull();
      const trace = [];
      for (let tick = 0; tick < 100; tick++) {
        f.sim.tick();
        trace.push([
          f.mob.aiState,
          f.mob.castingAbility,
          f.mob.castRemaining,
          f.sim.player.hp,
          f.ctx.pendingProjectiles.length,
        ]);
      }
      expect(f.events.filter((e) => e.type === 'castStart').length).toBeGreaterThan(1);
      expect(f.sim.player.hp).toBeLessThan(10000);
      return { trace, events: f.events };
    };
    expect(run()).toEqual(run());
  });
  it.each(CASTERS)('%s casts from range and damages only after projectile impact', (id) => {
    const f = fixture(id);
    for (let i = 0; i < 10; i++) f.step();
    expect(f.mob.aggroTargetId).toBeNull();
    expect(f.mob.castingAbility).toBeNull();
    f.start();
    expect(f.mob.castTotal).toBe(1.7);
    expect(f.mob.castTargetId).toBe(f.sim.playerId);
    const position = { ...f.mob.pos };
    for (let i = 0; i < 20; i++) f.step();
    expect(f.mob.pos).toEqual(position);
    expect(f.mob.autoAttack).toBe(false);
    expect(f.mob.castRemaining).toBeCloseTo(0.7, 6);
    expect(f.sim.player.hp).toBe(10000);
    expect(f.events.some((e) => e.type === 'spellfx')).toBe(false);
    f.release();
    expect(f.mob.castingAbility).toBeNull();
    expect(f.ctx.pendingProjectiles).toHaveLength(1);
    expect(f.sim.player.hp).toBe(10000);
    for (let i = 0; i < 20 && f.ctx.pendingProjectiles.length; i++) f.step();
    expect(f.sim.player.hp).toBeLessThan(10000);
    expect(f.events).toContainEqual(
      expect.objectContaining({
        type: 'damage',
        sourceId: f.mob.id,
        ability: MOBS[id].petSpell?.ability,
        school: MOBS[id].petSpell?.school,
      }),
    );
  });
  it('does not switch to melee when the victim is next to the caster', () => {
    const f = fixture(CASTERS[0], 2);
    f.start();
    for (let i = 0; i < 20; i++) f.step();
    expect(f.sim.player.hp).toBe(10000);
    expect(f.mob.autoAttack).toBe(false);
    f.release();
    expect(f.events.filter((e) => e.type === 'damage')).toEqual([]);
  });
  it('supports a real interrupt and school lockout without an orphaned delayed release', () => {
    const f = fixture(CASTERS[0], 2);
    f.start();
    f.sim.targetEntity(f.mob.id);
    f.sim.player.facing = Math.PI / 2;
    f.sim.castAbility('kick');
    expect(f.mob.castingAbility).toBeNull();
    expect(f.mob.auras.some((a) => a.kind === 'lockout' && a.school === 'shadow')).toBe(true);
    for (let i = 0; i < 100; i++) f.step();
    expect(f.ctx.pendingProjectiles).toHaveLength(0);
    expect(f.events.some((e) => e.type === 'spellfx' && e.sourceId === f.mob.id)).toBe(false);
  });
  it('cancels when range or target validity is lost instead of releasing at a new target', () => {
    const f = fixture();
    f.start();
    f.sim.player.pos.x -= 30;
    f.step();
    expect(f.mob.castingAbility).toBeNull();
    expect(f.mob.aiState).toBe('chase');
    expect(f.ctx.pendingProjectiles).toHaveLength(0);
    f.sim.player.pos.x += 30;
    f.mob.swingTimer = 0;
    f.start();
    f.sim.player.dead = true;
    f.step();
    expect(f.mob.castingAbility).toBeNull();
    expect(f.mob.castTargetId).toBeNull();
  });
  it('leashes with no cast state and no projectile left to release', () => {
    const f = fixture();
    f.start();
    f.mob.pos.x = f.mob.spawnPos.x + 29;
    f.step();
    expect(f.mob.aiState).toBe('evade');
    expect(f.mob.castingAbility).toBeNull();
    expect(f.mob.castRemaining).toBe(0);
    expect(f.ctx.pendingProjectiles).toHaveLength(0);
  });
});
