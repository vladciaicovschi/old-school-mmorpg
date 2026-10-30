import { describe, expect, it, vi } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { updateMob } from '../src/sim/mob/locomotion';
import { advancePendingProjectiles } from '../src/sim/projectile_travel';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { PlayerClass, SimEvent } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';
import { WORLD_WITHOUT_HUB_YARD } from './helpers/hub_yard';

const CULTIST = 'dev_skeleton_cultist';
const ACOLYTE = 'dev_skeleton_acolyte';
const NECRO = 'dev_skeleton_necromancer_v2';
const CASTER = 'dev_skeleton_caster_v3';
const IDS = [CULTIST, ACOLYTE, NECRO, CASTER];

function fixture(id: string, playerClass: PlayerClass = 'mage') {
  const sim = new Sim({
    seed: 42,
    playerClass,
    autoEquip: true,
    world: { ...WORLD_WITHOUT_HUB_YARD, camps: [], npcs: {}, groundObjects: [] },
  });
  sim.setPlayerLevel(10);
  const host = sim as unknown as { ctx: SimContext; nextId: number; emit(event: SimEvent): void };
  const ctx = host.ctx;
  const player = sim.player;
  player.pos = { x: 819, y: groundHeight(819, 0, 42), z: 0 };
  player.prevPos = { ...player.pos };
  player.hp = player.maxHp = 10000;
  player.maxResource = 100;
  player.resource = 100;
  const mob = createMob(host.nextId++, MOBS[id], 10, { ...player.pos, x: player.pos.x + 12 });
  mob.hp = mob.maxHp = 10000;
  sim.entities.set(mob.id, mob);
  ctx.rebucket(mob);
  const events: SimEvent[] = [];
  ctx.emit = (event) => events.push(event);
  host.emit = (event) => events.push(event);
  ctx.dealDamage(player, mob, 1, false, 'physical', null, 'hit', true);
  player.hp = player.maxHp;
  events.length = 0;
  mob.swingTimer = 0;
  const roll = vi.spyOn(ctx.rng, 'chance').mockReturnValue(true);
  const launch = () => {
    for (let tick = 0; tick < 50 && ctx.pendingProjectiles.length === 0; tick++)
      updateMob(ctx, mob);
    expect(ctx.pendingProjectiles).toHaveLength(1);
  };
  const impact = () => {
    for (let tick = 0; tick < 20 && ctx.pendingProjectiles.length > 0; tick++)
      advancePendingProjectiles(ctx);
    expect(ctx.pendingProjectiles).toHaveLength(0);
  };
  return { sim, ctx, player, mob, events, roll, launch, impact };
}

describe('distinct modest caster kits', () => {
  it('splits spells and utility across four roles without copying boss mechanics', () => {
    expect(IDS.map((id) => MOBS[id].petSpell?.ability)).toEqual([
      'shadow_bolt',
      'wrath',
      'shadow_bolt',
      'fireball',
    ]);
    expect(IDS.map((id) => MOBS[id].petSpell?.school)).toEqual([
      'shadow',
      'nature',
      'shadow',
      'fire',
    ]);
    expect(MOBS[CULTIST].hex).toMatchObject({ chance: 0.2, reductionPct: 0.1, duration: 6 });
    expect(MOBS[ACOLYTE].vulnerability).toMatchObject({ chance: 0.15, amp: 0.06, duration: 6 });
    expect(MOBS[NECRO].manaBurn).toMatchObject({ chance: 0.2, amount: 20 });
    expect(MOBS[CASTER].spellReflect).toMatchObject({ value: 3 });
    for (const id of IDS) {
      const mob = MOBS[id];
      expect(
        [mob.hex, mob.vulnerability, mob.manaBurn, mob.spellReflect].filter(Boolean),
      ).toHaveLength(1);
      expect(mob.aggroOnDamageOnly).toBe(true);
      for (const key of [
        'bigCast',
        'summonAdds',
        'enrage',
        'channelHeal',
        'aoePulse',
        'ccImmune',
      ] as const)
        expect(mob[key]).toBeUndefined();
    }
    expect(MOBS[ACOLYTE].petSpell?.max).toBeLessThanOrEqual(
      MOBS.reedbound_acolyte.petSpell?.max ?? 0,
    );
    expect(MOBS[CASTER].petSpell?.max).toBeLessThan(MOBS.warlock_imp.petSpell?.max ?? 0);
    expect(MOBS[NECRO].manaBurn?.amount).toBeLessThan(
      MOBS.wyrmcult_necromancer.manaBurn?.amount ?? 0,
    );
    expect(MOBS[CASTER].spellReflect?.value).toBeLessThan(
      MOBS.wyrmcult_necromancer.spellReflect?.value ?? 0,
    );
  });
  it('applies the cultist weakening curse at impact, refreshes it without stacking, and really reduces output', () => {
    const f = fixture(CULTIST);
    f.launch();
    expect(f.player.auras.some((a) => a.kind === 'hex')).toBe(false);
    f.impact();
    expect(f.player.auras.find((a) => a.kind === 'hex')).toMatchObject({
      value: 0.1,
      duration: 6,
      sourceId: f.mob.id,
    });
    const before = f.mob.hp;
    f.ctx.dealDamage(f.player, f.mob, 100, false, 'physical', null, 'hit', true);
    expect(before - f.mob.hp).toBe(90);
    f.mob.swingTimer = 0;
    f.launch();
    f.impact();
    expect(f.player.auras.filter((a) => a.kind === 'hex')).toHaveLength(1);
  });
  it('gives only the acolyte a short, small vulnerability on its nature bolt', () => {
    const f = fixture(ACOLYTE);
    f.launch();
    f.impact();
    expect(f.player.auras.find((a) => a.kind === 'vulnerability')).toMatchObject({
      value: 0.06,
      duration: 6,
      sourceId: f.mob.id,
    });
    expect(f.player.auras.some((a) => a.kind === 'hex')).toBe(false);
    const before = f.player.hp;
    f.ctx.dealDamage(f.mob, f.player, 100, false, 'nature', null, 'hit', true);
    expect(before - f.player.hp).toBe(106);
  });
  it('burns a small amount of mana only on the necromancer bolt impact', () => {
    const f = fixture(NECRO);
    f.launch();
    expect(f.player.resource).toBe(100);
    f.impact();
    expect(f.player.resource).toBe(80);
    expect(f.player.auras.some((a) => ['hex', 'vulnerability'].includes(a.kind))).toBe(false);
  });
  it.each(['rogue', 'warrior'] as const)('does not burn %s resources', (cls) => {
    const f = fixture(NECRO, cls);
    f.launch();
    f.impact();
    expect(f.player.resource).toBeGreaterThanOrEqual(100);
  });
  it('clamps a mana drain at zero', () => {
    const f = fixture(NECRO);
    f.player.resource = 7;
    f.launch();
    f.impact();
    expect(f.player.resource).toBe(0);
  });
  it.each([CULTIST, ACOLYTE, NECRO])('%s cannot apply utility through a resisted bolt', (id) => {
    const f = fixture(id);
    f.launch();
    f.roll.mockReturnValue(false);
    f.impact();
    expect(f.player.hp).toBe(10000);
    expect(f.player.resource).toBe(100);
    expect(f.player.auras.some((a) => ['hex', 'vulnerability'].includes(a.kind))).toBe(false);
  });
  it.each([CULTIST, ACOLYTE, NECRO])('%s rolls utility separately from a successful hit', (id) => {
    const f = fixture(id);
    f.launch();
    f.roll.mockImplementation((chance) => chance > 0.5);
    f.impact();
    expect(f.events).toContainEqual(
      expect.objectContaining({ type: 'damage', sourceId: f.mob.id, kind: 'hit' }),
    );
    expect(f.player.hp).toBeLessThan(10000);
    expect(f.player.resource).toBe(100);
    expect(f.player.auras.some((a) => ['hex', 'vulnerability'].includes(a.kind))).toBe(false);
  });
  it.each([CULTIST, ACOLYTE, NECRO])(
    '%s cannot apply utility through a fully absorbed bolt',
    (id) => {
      const f = fixture(id);
      f.ctx.applyAura(f.player, {
        id: 'test_absorb',
        name: 'Test absorb',
        kind: 'absorb',
        value: 10000,
        remaining: 10,
        duration: 10,
        sourceId: f.player.id,
        school: 'holy',
      });
      const hpBefore = f.player.hp;
      const resourceBefore = f.player.resource;
      f.launch();
      f.impact();
      expect(f.player.hp).toBe(hpBefore);
      expect(f.player.auras.find((a) => a.id === 'test_absorb')?.value).toBeLessThan(10000);
      expect(f.player.resource).toBe(resourceBefore);
      expect(f.player.auras.some((a) => ['hex', 'vulnerability'].includes(a.kind))).toBe(false);
    },
  );
  it('reacts with only three damage to magic on Caster V3, not to physical hits or on other roles', () => {
    const f = fixture(CASTER);
    f.ctx.dealDamage(f.player, f.mob, 50, false, 'fire', 'fireball', 'hit', true);
    expect(f.player.hp).toBe(9997);
    f.ctx.dealDamage(f.player, f.mob, 50, false, 'physical', null, 'hit', true);
    expect(f.player.hp).toBe(9997);
    for (const id of [CULTIST, ACOLYTE, NECRO]) {
      const other = fixture(id);
      other.ctx.dealDamage(other.player, other.mob, 50, false, 'fire', 'fireball', 'hit', true);
      expect(other.player.hp).toBe(10000);
    }
  });
});
