import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { updateMob } from '../src/sim/mob/locomotion';
import { rallyFleeingAllies, socialPullSameTemplate } from '../src/sim/mob/social_aggro';
import { updatePet } from '../src/sim/pet/pet_ai';
import { petOf, summonPet } from '../src/sim/pet/pet_commands';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { SpatialGrid } from '../src/sim/spatial';
import type { Entity } from '../src/sim/types';

const DAMAGE_ONLY = 'test_damage_only_wolf';
const ORDINARY = 'test_ordinary_wolf';
const EXPLICIT_FALSE = 'test_explicit_false_wolf';
type Harness = {
  ctx: SimContext;
  grid: SpatialGrid;
  playerGrid: SpatialGrid;
  dealDamage(
    source: Entity,
    target: Entity,
    amount: number,
    crit: boolean,
    school: string,
    ability: null,
    kind: 'hit',
    noRage: boolean,
  ): void;
};

beforeEach(() => {
  const base = { ...MOBS.forest_wolf, aggroRadius: 0, idleStationary: true };
  MOBS[DAMAGE_ONLY] = { ...base, id: DAMAGE_ONLY, aggroOnDamageOnly: true };
  MOBS[ORDINARY] = { ...base, id: ORDINARY };
  MOBS[EXPLICIT_FALSE] = { ...base, id: EXPLICIT_FALSE, aggroOnDamageOnly: false };
});
afterEach(() => {
  for (const id of [DAMAGE_ONLY, ORDINARY, EXPLICIT_FALSE]) delete MOBS[id];
});

function setup(playerClass: 'warrior' | 'hunter' = 'warrior') {
  const sim = new Sim({ seed: 42, playerClass, autoEquip: true });
  sim.setPlayerLevel(10);
  const mobs = [...sim.entities.values()]
    .filter((entity) => entity.kind === 'mob' && entity.ownerId === null && !entity.dead)
    .slice(0, 4);
  expect(mobs).toHaveLength(4);
  const harness = sim as unknown as Harness;
  const place = (mob: Entity, offset: number, templateId = DAMAGE_ONLY) => {
    mob.templateId = templateId;
    mob.level = sim.player.level;
    mob.pos = { ...sim.player.pos, x: sim.player.pos.x + offset };
    mob.prevPos = { ...mob.pos };
    mob.spawnPos = { ...mob.pos };
    mob.aiState = 'idle';
    mob.inCombat = false;
    mob.aggroTargetId = null;
    mob.forcedTargetId = null;
    mob.forcedTargetTimer = 0;
    mob.threat.clear();
    mob.hostile = true;
    mob.hp = mob.maxHp = 1000;
    mob.wanderTarget = null;
    mob.wanderTimer = 100;
  };
  for (const [index, mob] of mobs.entries()) place(mob, index + 1);
  const refresh = () => {
    harness.grid.refresh(sim.entities.values());
    harness.playerGrid.refresh([sim.player]);
  };
  refresh();
  const hit = (mob: Entity) =>
    harness.dealDamage(sim.player, mob, 1, false, 'physical', null, 'hit', true);
  return { sim, mobs, harness, place, refresh, hit };
}

function petSetup(templateId = DAMAGE_ONLY) {
  const fixture = setup('hunter');
  const { sim, harness, mobs, place, refresh } = fixture;
  summonPet(harness.ctx, sim.player, 'forest_wolf');
  const pet = petOf(harness.ctx, sim.playerId)!;
  expect(pet).toBeDefined();
  pet.petMode = 'passive';
  pet.aggroTargetId = null;
  pet.pos = { ...sim.player.pos, x: sim.player.pos.x + 30 };
  pet.prevPos = { ...pet.pos };
  for (const [index, mob] of mobs.entries()) place(mob, 32 + index, templateId);
  refresh();
  return { ...fixture, pet };
}

function expectIdle(mob: Entity) {
  expect(mob.aiState).toBe('idle');
  expect(mob.inCombat).toBe(false);
  expect(mob.aggroTargetId).toBeNull();
  expect(mob.threat.size).toBe(0);
}

describe('damage-only mob aggro opt-in', () => {
  it('does not wake when an unmounted owner heels a nonattacking pet past it', () => {
    const { mobs, harness, pet } = petSetup();
    updatePet(harness.ctx, pet);
    for (const mob of mobs) expectIdle(mob);
    expect(pet.aggroTargetId).toBeNull();
    expect(pet.autoAttack).toBe(false);
  });

  it('preserves ordinary proximity pulls from a passive heeling pet', () => {
    const { mobs, harness, pet } = petSetup(ORDINARY);
    updatePet(harness.ctx, pet);
    expect(mobs[0].aggroTargetId).toBe(pet.id);
    expect(mobs[0].inCombat).toBe(true);
  });

  it('still retaliates against direct pet damage without pulling its display neighbours', () => {
    const { mobs, harness, pet } = petSetup();
    harness.dealDamage(pet, mobs[0], 1, false, 'physical', null, 'hit', true);
    expect(mobs[0].aggroTargetId).toBe(pet.id);
    expect(mobs[0].inCombat).toBe(true);
    expect(mobs[0].hp).toBeLessThan(mobs[0].maxHp);
    for (const mob of mobs.slice(1)) expectIdle(mob);
  });

  it('ignores nearby players despite the ordinary four-yard aggro floor', () => {
    const { mobs, harness } = setup();
    for (let tick = 0; tick < 20; tick++) updateMob(harness.ctx, mobs[0]);
    expectIdle(mobs[0]);
    expect(harness.ctx.mobScanCounters.aggroScanPlayerVisits).toBe(0);
  });

  it('still retaliates against direct damage without waking adjacent display mobs', () => {
    const { sim, mobs, harness, hit } = setup();
    hit(mobs[0]);
    expect(mobs[0].hp).toBeLessThan(mobs[0].maxHp);
    expect(mobs[0].aggroTargetId).toBe(sim.playerId);
    expect(mobs[0].inCombat).toBe(true);
    updateMob(harness.ctx, mobs[0]);
    expect(['chase', 'attack']).toContain(mobs[0].aiState);
    for (const other of mobs.slice(1)) expectIdle(other);
  });

  it('accepts a direct taunt without treating nearby mobs as part of the pull', () => {
    const { sim, mobs } = setup();
    sim.targetEntity(mobs[0].id);
    sim.player.facing = Math.atan2(
      mobs[0].pos.x - sim.player.pos.x,
      mobs[0].pos.z - sim.player.pos.z,
    );
    sim.castAbility('taunt');
    expect(mobs[0].forcedTargetId).toBe(sim.playerId);
    expect(mobs[0].aggroTargetId).toBe(sim.playerId);
    expect(mobs[0].inCombat).toBe(true);
    expect(mobs[0].hp).toBe(mobs[0].maxHp);
    for (const other of mobs.slice(1)) expectIdle(other);
  });

  it('cannot emit same-template social pulls', () => {
    const { sim, mobs, harness } = setup();
    socialPullSameTemplate(harness.ctx, mobs[0], sim.player);
    for (const other of mobs.slice(1)) expectIdle(other);
  });

  it('does not receive ordinary same-family flee rallies', () => {
    const { sim, mobs, harness, place, refresh } = setup();
    place(mobs[0], 1, ORDINARY);
    place(mobs[1], 2, ORDINARY);
    refresh();
    expect(rallyFleeingAllies(harness.ctx, mobs[0], sim.player)).toBe(1);
    expect(mobs[1].aggroTargetId).toBe(sim.playerId);
    for (const other of mobs.slice(2)) expectIdle(other);
  });

  it('cannot rally ordinary same-family allies while fleeing', () => {
    const { sim, mobs, harness, place, refresh } = setup();
    place(mobs[1], 2, ORDINARY);
    refresh();
    expect(rallyFleeingAllies(harness.ctx, mobs[0], sim.player)).toBe(0);
    for (const other of mobs.slice(1)) expectIdle(other);
  });

  it('preserves ordinary proximity and same-template damage pulls', () => {
    const { sim, mobs, harness, place, refresh, hit } = setup();
    place(mobs[0], 1, ORDINARY);
    place(mobs[1], 2, ORDINARY);
    refresh();
    updateMob(harness.ctx, mobs[0]);
    expect(mobs[0].aggroTargetId).toBe(sim.playerId);
    expect(mobs[1].aggroTargetId).toBe(sim.playerId);
    place(mobs[0], 8, ORDINARY);
    place(mobs[1], 9, ORDINARY);
    refresh();
    hit(mobs[0]);
    expect(mobs[1].aggroTargetId).toBe(sim.playerId);
    for (const other of mobs.slice(2)) expectIdle(other);
  });

  it('keeps absent and explicit-false ordinary flags identical, including idle RNG draws', () => {
    const run = (templateId: string) => {
      const { sim, mobs, harness, place, refresh } = setup();
      place(mobs[0], 30, templateId);
      refresh();
      const template = MOBS[templateId];
      template.idleStationary = false;
      mobs[0].wanderTimer = 0;
      const draws: number[] = [];
      harness.ctx.rng.setObserver((value) => draws.push(value));
      for (let tick = 0; tick < 15; tick++) updateMob(harness.ctx, mobs[0]);
      const mob = mobs[0];
      return {
        draws,
        pos: mob.pos,
        facing: mob.facing,
        wander: mob.wanderTarget,
        wanderTimer: mob.wanderTimer,
        state: mob.aiState,
        threat: [...mob.threat],
      };
    };
    const ordinary = run(ORDINARY);
    expect(ordinary.draws.length).toBeGreaterThan(0);
    expect(run(EXPLICIT_FALSE)).toEqual(ordinary);
  });
});
