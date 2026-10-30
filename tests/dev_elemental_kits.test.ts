import { describe, expect, it, vi } from 'vitest';
import { updateAuras } from '../src/sim/combat/auras';
import { DEV_ELEMENTAL_KITS } from '../src/sim/content/dev_elemental_kits';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { respawnMob } from '../src/sim/mob/lifecycle';
import { resetEvadingMob, updateMob } from '../src/sim/mob/locomotion';
import { runMobSwingAffixes } from '../src/sim/mob/mob_swing';
import { updateMobWaterCaster } from '../src/sim/mob/water_caster';
import { advancePendingProjectiles } from '../src/sim/projectile_travel';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import { DT, type SimEvent } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';
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
  player.pos = { x: 812, y: groundHeight(812, 0, 42), z: 0 };
  player.prevPos = { ...player.pos };
  const mob = createMob(host.nextId++, MOBS[id], 10, { ...player.pos, x: 824 });
  mob.hp = mob.maxHp = 10000;
  sim.entities.set(mob.id, mob);
  ctx.rebucket(mob);
  const events: SimEvent[] = [];
  ctx.emit = host.emit = (e) => {
    events.push(e);
  };
  const roll = vi.spyOn(ctx.rng, 'chance').mockReturnValue(true);
  const pull = () => {
    ctx.dealDamage(player, mob, 1, false, 'physical', null, 'hit', true);
    mob.swingTimer = 0;
    events.length = 0;
  };
  const step = () => {
    sim.time += DT;
    sim.tickCount++;
    updateAuras(ctx, player);
    advancePendingProjectiles(ctx);
    updateMob(ctx, mob);
  };
  const start = () => {
    pull();
    for (let i = 0; i < 5 && !mob.channeling; i++) step();
    expect(mob.castingAbility).toBe('water_jet');
  };
  return { sim, ctx, player, mob, events, roll, pull, step, start };
}

describe('existing elemental kits on new lab bodies', () => {
  it('copies only donor mechanics and preserves passive test policy', () => {
    expect(DEV_ELEMENTAL_KITS.dev_fire_elemental.smolder).toBe(MOBS.rift_magma_brute.smolder);
    expect(DEV_ELEMENTAL_KITS.dev_ice_elemental.frostbite).toBe(MOBS.rift_rime_elemental.frostbite);
    expect(DEV_ELEMENTAL_KITS.dev_storm_elemental.chillOnHit).toBe(
      MOBS.stormcrag_elemental.chillOnHit,
    );
    expect(DEV_ELEMENTAL_KITS.dev_storm_elemental.spellVuln).toBe(
      MOBS.stormcrag_elemental.spellVuln,
    );
    expect(DEV_ELEMENTAL_KITS.dev_stone_elemental.stoneskin).toBe(MOBS.ancient_guardian.stoneskin);
    expect(DEV_ELEMENTAL_KITS.dev_water_elemental.petRanged).toBe(MOBS.water_elemental.petRanged);
    for (const [id, kit] of Object.entries(DEV_ELEMENTAL_KITS)) {
      expect(MOBS[id]).toMatchObject(kit);
      expect(MOBS[id]).toMatchObject({
        aggroOnDamageOnly: true,
        idleStationary: true,
        loot: [],
        scale: 1,
      });
      expect(MOBS[id].boss).toBeUndefined();
      expect(MOBS[id].ccImmune).toBeUndefined();
    }
  });

  it.each([
    ['dev_fire_elemental', 'smolder', 'fire', 'Smoulder'],
    ['dev_ice_elemental', 'frostbite', 'frost', 'Rime'],
  ])('%s applies its donor elemental damage over time', (id, prefix, school, name) => {
    const f = fixture(id);
    runMobSwingAffixes(f.ctx, f.mob, f.player, { dealt: 10, crit: false, rawDmg: 10 });
    expect(f.player.auras.find((a) => a.id === `${prefix}_${id}`)).toMatchObject({ school, name });
    const hp = f.player.hp;
    for (let i = 0; i < 45; i++) updateAuras(f.ctx, f.player);
    expect(f.player.hp).toBeLessThan(hp);
    expect(f.events).toContainEqual(expect.objectContaining({ type: 'damage', school }));
  });

  it('the storm hit applies the existing chill and magic vulnerability', () => {
    const f = fixture('dev_storm_elemental');
    runMobSwingAffixes(f.ctx, f.mob, f.player, { dealt: 10, crit: false, rawDmg: 10 });
    expect(f.player.auras).toContainEqual(
      expect.objectContaining({ name: 'Numbing Chill', kind: 'slow', value: 0.5 }),
    );
    expect(f.player.auras).toContainEqual(
      expect.objectContaining({ name: 'Static Charge', kind: 'spellvuln', value: 0.18 }),
    );
  });

  it('the stone elemental gains its donor absorb shield in combat', () => {
    const f = fixture('dev_stone_elemental');
    f.pull();
    f.mob.pos.x = f.player.pos.x + 1;
    f.ctx.rebucket(f.mob);
    f.mob.stoneskinTimer = 0;
    for (let i = 0; i < 3; i++) f.step();
    expect(f.mob.auras).toContainEqual(
      expect.objectContaining({ name: 'Stone Bulwark', kind: 'absorb', value: 90 }),
    );
  });

  it('water remains passive until pulled, channels damage/slow, then shoots frost bolts', () => {
    const f = fixture('dev_water_elemental');
    f.step();
    expect(f.mob.inCombat).toBe(false);
    expect(f.events).toHaveLength(0);
    f.start();
    const pos = { ...f.mob.pos };
    expect(f.mob.autoAttack).toBe(false);
    expect(f.player.auras).toContainEqual(
      expect.objectContaining({ id: 'water_jet_slow', value: 0.6 }),
    );
    f.step();
    expect(f.mob.channeling).toBe(true);
    expect(f.mob.castRemaining).toBeCloseTo(2.95, 5);
    for (let i = 0; i < 19; i++) f.step();
    expect(f.events).toContainEqual(
      expect.objectContaining({ type: 'damage', ability: 'Water Jet', school: 'frost' }),
    );
    for (let i = 0; i < 42; i++) f.step();
    expect(f.mob.pos).toEqual(pos);
    expect(f.mob.channeling).toBe(false);
    expect(f.player.hp).toBeLessThan(f.player.maxHp);
    for (
      let i = 0;
      i < 50 && !f.events.some((e) => e.type === 'spellfx' && e.fx === 'projectile');
      i++
    )
      f.step();
    expect(f.events).toContainEqual(
      expect.objectContaining({ type: 'spellfx', fx: 'projectile', school: 'frost' }),
    );
    expect(
      f.events
        .filter((e) => e.type === 'damage' && e.sourceId === f.mob.id)
        .every((e) => e.type === 'damage' && e.school === 'frost'),
    ).toBe(true);
    for (
      let i = 0;
      i < 200 &&
      f.events.filter((e) => e.type === 'spellfx' && e.fx === 'bubbleBeam' && e.duration === 3)
        .length < 2;
      i++
    )
      f.step();
    expect(
      f.events.filter((e) => e.type === 'spellfx' && e.fx === 'bubbleBeam' && e.duration === 3),
      JSON.stringify({
        ai: f.mob.aiState,
        cooldown: f.mob.petTauntTimer,
        cast: f.mob.castingAbility,
        target: f.mob.aggroTargetId,
        combat: f.mob.inCombat,
        time: f.sim.time,
        dead: f.mob.dead,
        hp: f.player.hp,
        mobPos: f.mob.pos,
        playerPos: f.player.pos,
      }),
    ).toHaveLength(2);
  });

  it.each([
    'interrupt',
    'stun',
    'silence',
    'range',
    'los',
    'death',
    'target death',
    'retarget',
    'leash',
  ])('water jet cancels on %s, removing damage, slow and beam', (reason) => {
    const f = fixture('dev_water_elemental');
    f.start();
    if (reason === 'interrupt') {
      f.mob.castingAbility = null;
      f.mob.channeling = false;
      f.mob.castTargetId = null;
    }
    if (reason === 'stun' || reason === 'silence')
      f.ctx.applyAura(f.mob, {
        id: 'test_control',
        name: 'Test control',
        kind: reason,
        value: 0,
        remaining: 3,
        duration: 3,
        sourceId: f.player.id,
        school: 'frost',
      });
    if (reason === 'range') f.player.pos.x -= 40;
    if (reason === 'los') vi.spyOn(f.ctx, 'hasLineOfSight').mockReturnValue(false);
    if (reason === 'death') f.mob.dead = true;
    if (reason === 'target death') f.player.dead = true;
    if (reason === 'retarget') f.mob.aggroTargetId = null;
    if (reason === 'leash') f.mob.spawnPos.x -= 40;
    f.step();
    expect(f.mob.mobWaterJetTargetId).toBeUndefined();
    expect(f.mob.channeling).toBe(false);
    expect(
      f.player.auras.some((a) => a.sourceId === f.mob.id && a.id.startsWith('water_jet')),
    ).toBe(false);
    expect(f.events).toContainEqual(
      expect.objectContaining({ type: 'spellfx', fx: 'bubbleBeam', duration: 0 }),
    );
  });

  it.each([respawnMob, resetEvadingMob])(
    'cleans the water channel on lifecycle reset ($name)',
    (reset) => {
      const f = fixture('dev_water_elemental');
      f.start();
      reset(f.ctx, f.mob);
      expect(f.mob.mobWaterJetTargetId).toBeUndefined();
      expect(f.mob.petTauntTimer).toBe(0);
      expect(
        f.player.auras.some((a) => a.sourceId === f.mob.id && a.id.startsWith('water_jet')),
      ).toBe(false);
    },
  );

  it('leaves owned water pets on their existing AI path', () => {
    const f = fixture('dev_water_elemental');
    f.mob.ownerId = f.player.id;
    expect(updateMobWaterCaster(f.ctx, f.mob, f.player, 6)).toBe(false);
    expect(f.events).toHaveLength(0);
  });

  it('keeps an unowned mob channel on its valid AI target without a player PvP controller', () => {
    const f = fixture('dev_water_elemental');
    vi.spyOn(f.ctx, 'isHostileTo').mockReturnValue(false);
    f.start();
    f.step();
    expect(f.mob.channeling).toBe(true);
    expect(f.mob.castRemaining).toBeCloseTo(2.95, 5);
  });

  it('replays the hostile water rotation with identical events and RNG draws', () => {
    const replay = () => {
      const f = fixture('dev_water_elemental');
      f.roll.mockRestore();
      const draws: unknown[] = [];
      f.ctx.rng.setObserver((...draw) => draws.push(draw));
      f.pull();
      for (let i = 0; i < 210; i++) f.step();
      expect(f.events.some((e) => e.type === 'spellfx' && e.fx === 'bubbleBeam')).toBe(true);
      expect(f.events.some((e) => e.type === 'spellfx' && e.fx === 'projectile')).toBe(true);
      return { events: f.events, draws, hp: f.player.hp, cooldown: f.mob.petTauntTimer };
    };
    expect(replay()).toEqual(replay());
  });

  it('continues forced-target maintenance and cancels the old victim when taunted', () => {
    const f = fixture('dev_water_elemental');
    f.start();
    f.mob.forcedTargetId = f.player.id;
    f.mob.forcedTargetTimer = 0.1;
    for (let i = 0; i < 5; i++) f.step();
    expect(f.mob.forcedTargetTimer).toBeLessThanOrEqual(0);
    const otherId = f.sim.addPlayer('warrior', 'Other');
    const other = f.ctx.entities.get(otherId);
    if (!other) throw new Error('Missing second player');
    other.pos = { ...f.player.pos };
    f.ctx.rebucket(other);
    f.mob.forcedTargetId = other.id;
    f.mob.forcedTargetTimer = 1;
    f.step();
    expect(f.mob.aggroTargetId).toBe(other.id);
    expect(f.mob.mobWaterJetTargetId).toBeUndefined();
    expect(
      f.player.auras.some((a) => a.sourceId === f.mob.id && a.id.startsWith('water_jet')),
    ).toBe(false);
  });

  it('evades an unreachable target instead of holding combat behind a wall', () => {
    const f = fixture('dev_water_elemental');
    f.pull();
    vi.spyOn(f.ctx, 'hasLineOfSight').mockReturnValue(false);
    vi.spyOn(f.ctx, 'moveToward').mockReturnValue(false);
    vi.spyOn(f.ctx, 'resolveMovePoint').mockImplementation(() => ({ ...f.mob.pos }));
    for (let i = 0; i < 110 && f.mob.aiState !== 'evade'; i++) f.step();
    expect(f.mob.aiState).toBe('evade');
    expect(f.mob.mobWaterJetTargetId).toBeUndefined();
    expect(f.events.some((e) => e.type === 'spellfx')).toBe(false);
  });
});
