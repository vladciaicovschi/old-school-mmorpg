import { describe, expect, it, vi } from 'vitest';
import { tryPlayerSwing } from '../src/sim/combat/auto_attack';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { advancePendingProjectiles } from '../src/sim/projectile_travel';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import { MELEE_RANGE, type PlayerClass, type SimEvent } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';
import { WORLD_WITHOUT_HUB_YARD } from './helpers/hub_yard';

function fixture(distance = 12, cls: PlayerClass = 'warlock') {
  const sim = new Sim({
    seed: 42,
    playerClass: cls,
    autoEquip: true,
    world: { ...WORLD_WITHOUT_HUB_YARD, camps: [], npcs: {}, groundObjects: [] },
  });
  const host = sim as unknown as { ctx: SimContext; nextId: number; emit(e: SimEvent): void };
  const ctx = host.ctx;
  const p = sim.player;
  p.pos = { x: 819, y: groundHeight(819, 0, 42), z: 0 };
  p.prevPos = { ...p.pos };
  p.facing = Math.PI / 2;
  const target = createMob(host.nextId++, MOBS.dev_skeleton_minion, 1, {
    ...p.pos,
    x: p.pos.x + distance,
  });
  target.hp = target.maxHp = 10000;
  sim.entities.set(target.id, target);
  ctx.rebucket(target);
  sim.targetEntity(target.id);
  const events: SimEvent[] = [];
  ctx.emit = host.emit = (event) => events.push(event);
  const meta = ctx.players.get(p.id);
  if (!meta) throw new Error('Player metadata missing');
  const swing = () => {
    p.swingTimer = 0;
    tryPlayerSwing(ctx, p, meta);
  };
  return { sim, ctx, p, target, events, swing, meta };
}

describe('Warlock staff carry and melee/ranged autos', () => {
  it('stows on an accepted spell and stays stowed after completion until Z', () => {
    const f = fixture();
    expect(f.p.weaponStowed).toBe(false);
    f.sim.castAbility('shadow_bolt');
    expect(f.p.castingAbility).toBe('shadow_bolt');
    expect(f.p.weaponStowed).toBe(true);
    for (let tick = 0; tick < 45; tick++) f.sim.tick();
    expect(f.p.castingAbility).toBeNull();
    expect(f.p.weaponStowed).toBe(true);
    f.sim.startAutoAttack();
    expect(f.p.weaponStowed).toBe(true);
    f.sim.toggleWeaponStow();
    expect(f.p.weaponStowed).toBe(false);
  });
  it('does not change carry when a spell is refused for insufficient mana', () => {
    const f = fixture();
    f.p.resource = 0;
    f.sim.castAbility('shadow_bolt');
    expect(f.p.castingAbility).toBeNull();
    expect(f.p.weaponStowed).toBe(false);
    expect(f.p.autoAttack).toBe(false);
  });
  it('keeps the staff stowed after a cancelled cast', () => {
    const f = fixture();
    f.sim.castAbility('shadow_bolt');
    f.ctx.cancelCast(f.p);
    expect(f.p.castingAbility).toBeNull();
    expect(f.p.weaponStowed).toBe(true);
  });
  it('also stows an instant self spell without restoring it on subsequent ranged engagement', () => {
    const f = fixture();
    f.sim.setPlayerLevel(10);
    f.p.resource = 0;
    f.sim.castAbility('life_tap');
    expect(f.events.some((e) => e.type === 'spellfx' && e.ability === 'life_tap')).toBe(true);
    expect(f.p.weaponStowed).toBe(true);
    f.sim.startAutoAttack();
    expect(f.p.weaponStowed).toBe(true);
  });
  it('does not stow on refused range or global cooldown', () => {
    const f = fixture(100);
    f.sim.castAbility('shadow_bolt');
    expect(f.p.weaponStowed).toBe(false);
    expect(f.p.castingAbility).toBeNull();
    f.target.pos.x = f.p.pos.x + 12;
    f.p.gcdRemaining = 1;
    f.sim.castAbility('shadow_bolt');
    expect(f.p.weaponStowed).toBe(false);
    expect(f.p.castingAbility).toBeNull();
  });
  it.each(['stun', 'disarm', 'facing'] as const)(
    'does not draw while a melee swing is blocked by %s',
    (gate) => {
      const f = fixture(2);
      f.p.weaponStowed = true;
      f.sim.startAutoAttack();
      if (gate === 'facing') f.p.facing = -Math.PI / 2;
      else
        f.p.auras.push({
          id: gate,
          name: gate,
          kind: gate,
          value: 0,
          remaining: 5,
          duration: 5,
          sourceId: f.target.id,
          school: 'physical',
        });
      f.swing();
      expect(f.p.weaponStowed).toBe(true);
      expect(f.events.some((e) => e.type === 'damage')).toBe(false);
    },
  );
  it.each([0, 1])('swings the equipped staff in melee with mana fraction %s', (mana) => {
    const f = fixture(MELEE_RANGE);
    f.p.resource = f.p.maxResource * mana;
    f.p.weaponStowed = true;
    f.sim.startAutoAttack();
    f.swing();
    expect(f.p.weaponStowed).toBe(false);
    expect(f.ctx.pendingProjectiles).toHaveLength(0);
    expect(f.events).toContainEqual(
      expect.objectContaining({
        type: 'damage',
        sourceId: f.p.id,
        school: 'physical',
        ability: null,
      }),
    );
    expect(f.p.swingTimer).toBe(f.p.weapon.speed);
  });
  it('keeps the old magic auto outside melee without drawing a stowed staff', () => {
    const f = fixture(MELEE_RANGE + 0.01);
    f.p.weaponStowed = true;
    f.sim.startAutoAttack();
    expect(f.p.weaponStowed).toBe(true);
    f.swing();
    expect(f.ctx.pendingProjectiles).toHaveLength(1);
    expect(f.events).toContainEqual(
      expect.objectContaining({ type: 'spellfx', wand: true, school: 'shadow' }),
    );
    vi.spyOn(f.ctx.rng, 'chance').mockReturnValue(false);
    for (let tick = 0; tick < 20 && f.ctx.pendingProjectiles.length; tick++)
      advancePendingProjectiles(f.ctx);
    expect(f.events).toContainEqual(
      expect.objectContaining({
        type: 'damage',
        sourceId: f.p.id,
        school: 'shadow',
        ability: 'Wand',
      }),
    );
    expect(f.p.weaponStowed).toBe(true);
  });
  it('does not let mid-cast engagement draw the staff or swing early', () => {
    const f = fixture(2);
    f.sim.castAbility('shadow_bolt');
    f.sim.startAutoAttack();
    f.swing();
    expect(f.p.autoAttack).toBe(true);
    expect(f.p.weaponStowed).toBe(true);
    expect(f.p.castingAbility).toBe('shadow_bolt');
    expect(f.events.some((e) => e.type === 'damage')).toBe(false);
  });
  it('draws for the first legitimate melee swing after a cast, not merely when a target approaches', () => {
    const f = fixture(12);
    f.sim.startAutoAttack();
    f.sim.castAbility('shadow_bolt');
    f.ctx.cancelCast(f.p);
    f.target.pos.x = f.p.pos.x + 2;
    f.p.swingTimer = 2;
    tryPlayerSwing(f.ctx, f.p, f.meta);
    expect(f.p.weaponStowed).toBe(true);
    f.swing();
    expect(f.p.weaponStowed).toBe(false);
    expect(f.events).toContainEqual(
      expect.objectContaining({ type: 'damage', school: 'physical' }),
    );
  });
  it('does not switch another caster to melee or alter its old cast carry behavior', () => {
    const f = fixture(2, 'mage');
    f.sim.startAutoAttack();
    f.swing();
    expect(f.ctx.pendingProjectiles).toHaveLength(1);
    expect(f.events).toContainEqual(expect.objectContaining({ type: 'spellfx', wand: true }));
    f.p.weaponStowed = true;
    f.sim.castAbility('fireball');
    expect(f.p.weaponStowed).toBe(false);
  });
});
