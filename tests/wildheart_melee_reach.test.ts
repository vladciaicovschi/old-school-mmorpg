import { describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { mobTemplateForDungeonDifficulty } from '../src/sim/instances/difficulty';
import {
  mobCombatProfile,
  mobEffectiveMeleeRange,
  tryMobMeleeSwingInRange,
} from '../src/sim/mob/combat_profile';
import { combatProfileForMob } from '../src/sim/mob_combat';
import { Sim } from '../src/sim/sim';
import { type Entity, MELEE_RANGE } from '../src/sim/types';

const ROLES = [
  { role: 'stalker', height: 1.3, reach: 5.00625 },
  { role: 'ravager', height: 1.25, reach: 5.125 },
  { role: 'hexcaller', height: 1.26, reach: 5 },
  { role: 'beastmaster', height: 1.15, reach: 5.378125 },
  { role: 'high_priest', height: 1.07, reach: 5.745 },
] as const;

describe.each(ROLES)('Wildheart $role melee reach', ({ role, height, reach }) => {
  const id = `wildheart_${role}`;
  it.each(['normal', 'heroic'] as const)('matches visible size and trial on %s', (mode) => {
    const template = mobTemplateForDungeonDifficulty(MOBS[id], 'wildheart_basin', mode);
    const trial = MOBS[`dev_${id}`];
    expect(VISUALS[`mob_${id}`].height).toBe(height);
    const production = combatProfileForMob(id, template.scale);
    const dev = combatProfileForMob(`dev_${id}`, trial.scale);
    expect(production.meleeRange).toBeCloseTo(reach, 5);
    expect(dev).toEqual(production);
    expect(production.desiredRange).toBeCloseTo(reach * 0.8, 5);
    expect(production.movingRangeBonus).toBe(1);
    expect(production.swingWhilePursuing).toBe(true);
    expect(production.canLeash).toBe(true);
    expect(template.petSpell).toEqual(MOBS[id].petSpell);
  });

  it.each([id, `dev_${id}`])(
    'applies the real standing and pursuing swing boundary to %s',
    (templateId) => {
      const sim = new Sim({ seed: 7788, playerClass: 'warrior' });
      const player = sim.player;
      player.pos = { x: 0, y: 0, z: 0 };
      player.prevPos = { x: -1, y: 0, z: 0 };
      player.maxHp = player.hp = 100000;
      const mob = createMob(9999, MOBS[templateId], 20, { x: reach + 0.1, y: 0, z: 0 });
      mob.prevPos = { ...mob.pos };
      mob.swingTimer = 0;
      expect(mobEffectiveMeleeRange(mob)).toBeCloseTo(reach, 5);
      expect(tryMobMeleeSwingInRange(sim.ctx, mob, player)).toBe(false);
      mob.pos.x = reach - 0.1;
      mob.prevPos = { ...mob.pos };
      expect(tryMobMeleeSwingInRange(sim.ctx, mob, player)).toBe(true);
      mob.pos.x = reach + 0.5;
      mob.prevPos = { x: mob.pos.x + 1, y: 0, z: 0 };
      expect(mobEffectiveMeleeRange(mob)).toBeCloseTo(reach + 1, 5);
      expect(tryMobMeleeSwingInRange(sim.ctx, mob, player)).toBe(true);
      mob.pos.x = reach + 1.1;
      mob.prevPos = { x: mob.pos.x + 1, y: 0, z: 0 };
      expect(tryMobMeleeSwingInRange(sim.ctx, mob, player)).toBe(false);
    },
  );

  it('scales if this model is spawned at a different entity scale', () => {
    const scale = MOBS[id].scale * 1.2;
    const expected = MELEE_RANGE + Math.max(0, (scale * height) / 2.4 - 1) * 3;
    const mob = createMob(9998, MOBS[id], 20, { x: 0, y: 0, z: 0 });
    mob.scale = scale;
    expect(mobCombatProfile(mob).meleeRange).toBeCloseTo(expected, 8);
  });
});

it('keeps unrelated mobs and unknown similarly named ids on their existing scale-based profile', () => {
  for (const id of ['forest_wolf', 'wildheart_unknown', 'dev_wildheart_unknown', 'mogger']) {
    const profile = combatProfileForMob(id, 2);
    expect(profile.meleeRange).toBe(8);
    expect(profile.desiredRange).toBeCloseTo(6.4);
  }
});

it('keeps the caster standing at its existing spell range when engaged', () => {
  const sim = new Sim({ seed: 7788, playerClass: 'warrior' });
  const player = sim.player;
  player.pos = { x: 0, y: 0, z: 0 };
  player.prevPos = { ...player.pos };
  const mob = createMob(9997, MOBS.wildheart_hexcaller, 20, { x: 10, y: 0, z: 0 });
  mob.prevPos = { ...mob.pos };
  mob.spawnPos = { ...mob.pos };
  mob.hostile = true;
  mob.inCombat = true;
  mob.aiState = 'attack';
  mob.aggroTargetId = player.id;
  mob.threat.set(player.id, 100);
  sim.entities.set(mob.id, mob);
  (sim as unknown as { updateMob: (entity: Entity) => void }).updateMob(mob);
  expect(mob.pos.x).toBe(10);
  expect(mob.aiState).toBe('attack');
  expect(MOBS.wildheart_hexcaller.petSpell?.range).toBeGreaterThan(10);
});

it.each([
  'wildheart_ravager',
  'dev_wildheart_ravager',
  'wildheart_beastmaster',
  'dev_wildheart_beastmaster',
])('%s keeps chasing to its new closer trade distance', (id) => {
  const sim = new Sim({ seed: 7788, playerClass: 'warrior' });
  const player = sim.player;
  player.pos = { x: 0, y: 0, z: 0 };
  player.prevPos = { ...player.pos };
  const mob = createMob(9996, MOBS[id], 20, { x: 5.5, y: 0, z: 0 });
  mob.prevPos = { ...mob.pos };
  mob.spawnPos = { ...mob.pos };
  mob.weapon = { min: 50, max: 50, speed: 2 };
  mob.swingTimer = 1;
  mob.hostile = true;
  mob.inCombat = true;
  mob.aiState = 'attack';
  mob.aggroTargetId = player.id;
  mob.threat.set(player.id, 100);
  sim.entities.set(mob.id, mob);
  (sim as unknown as { updateMob: (entity: Entity) => void }).updateMob(mob);
  expect(mob.pos.x).toBeLessThan(5.5);
  expect(mob.aiState).toBe('attack');
});
