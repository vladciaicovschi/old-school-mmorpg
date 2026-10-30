import { describe, expect, it, vi } from 'vitest';
import { fallbackSpellGesture } from '../src/render/characters/cast_gesture_capabilities_core';
import { damageEventStartsAttackAnimation } from '../src/render/characters/damage_attack_animation';
import { CharacterVisual } from '../src/render/characters/visual';
import { Renderer } from '../src/render/renderer';
import {
  communityMobAnimationCue,
  communityMobAnimationId,
} from '../src/sim/community_mob_animation_ids';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';

const inner = (sim: Sim) =>
  sim as unknown as {
    addEntity(entity: Entity): void;
    updateMob(entity: Entity): void;
    updateBossMechanics(entity: Entity): void;
  };
function engaged(sim: Sim, id: string) {
  const template = MOBS[id];
  const mob = createMob(900201, template, template.minLevel, { ...sim.player.pos });
  mob.spawnPos = { ...mob.pos };
  mob.aiState = 'attack';
  mob.aggroTargetId = sim.player.id;
  mob.inCombat = true;
  mob.swingTimer = 999;
  inner(sim).addEntity(mob);
  sim.player.maxHp = 10000;
  sim.player.hp = 10000;
  return mob;
}
function dispatchHarness(source: Entity) {
  let playing: string | undefined;
  const visual = {
    supportsJoinedCastRelease: false,
    isPreparingFittedCast: false,
    isMidOneShot: false,
    hasAttackClipOverride: (ability: string) =>
      ['mogger_ground_pound', 'mogger_bracing_order'].includes(ability),
    isPlayingAttackClip: (ability: string) => ability === playing,
  };
  const triggerAttack = vi.fn((_id: number, ability: string) => {
    playing = ability;
  });
  const onDamage = vi.fn();
  const renderer = Object.create(Renderer.prototype) as Renderer & Record<string, unknown>;
  Object.assign(renderer, {
    sim: { player: { id: 1 }, entities: new Map([[source.id, source]]) },
    views: new Map([[source.id, {}]]),
    activeVisual: () => visual,
    triggerAttack,
    triggerHit: vi.fn(),
    triggerCastRelease: vi.fn(),
    abilityVfx: { handleSpellfx: () => false, onDamage },
    vfx: { nova: vi.fn(), meleeSpark: vi.fn(), drainLifeTick: vi.fn() },
  });
  return { renderer, triggerAttack, onDamage };
}

describe('replacement mob mechanic animation cues', () => {
  it.each([
    ['mogger', 'pulse', 'mogger_ground_pound'],
    ['mogger', 'ward', 'mogger_bracing_order'],
    ['wildheart_hexcaller', 'mend', 'wildheart_ancestral_sap'],
    ['wildheart_beastmaster', 'stomp', 'wildheart_beast_pit_quake'],
    ['wildheart_beastmaster', 'ward', 'wildheart_thickhide_ward'],
    ['wildheart_beastmaster', 'warcry', 'wildheart_call_of_the_hunt'],
    ['wildheart_high_priest', 'pulse', 'wildheart_pulse'],
  ] as const)('identifies %s %s on both live and lab templates', (id, mechanic, ability) => {
    expect(communityMobAnimationId(id, mechanic)).toBe(ability);
    expect(communityMobAnimationId(`dev_${id}`, mechanic)).toBe(ability);
  });

  it('keeps unrelated event shapes empty and distinguishes Mogger ward from pound', () => {
    expect(communityMobAnimationCue('korgath_the_bound', 'stomp')).toEqual({});
    expect(communityMobAnimationCue('mogger_lackey', 'pulse')).toEqual({});
    expect(communityMobAnimationCue('wildheart_hexcaller', 'ward')).toEqual({});
    expect(communityMobAnimationCue('mogger', 'ward')).not.toEqual(
      communityMobAnimationCue('mogger', 'pulse'),
    );
  });

  it('emits the real pound once, preserves damage/cadence and dispatches its authored release', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: false });
    const mob = engaged(sim, 'mogger');
    mob.pulseTimer = 0;
    mob.wardTimer = 999;
    sim.events = [];
    inner(sim).updateMob(mob);
    const cues = sim.events.filter(
      (event) => event.type === 'spellfx' && event.sourceId === mob.id,
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({
      fx: 'nova',
      ability: 'mogger_ground_pound',
      school: 'physical',
    });
    const damage = sim.events.find(
      (event) => event.type === 'damage' && event.ability === 'Ground Pound',
    );
    expect(damage).toBeDefined();
    if (!damage || damage.type !== 'damage') throw new Error('Missing pulse damage');
    expect(damage.amount).toBeGreaterThanOrEqual(MOBS.mogger.aoePulse!.min);
    expect(damage.amount).toBeLessThanOrEqual(MOBS.mogger.aoePulse!.max);
    expect(mob.pulseTimer).toBe(MOBS.mogger.aoePulse!.every);
    expect(sim.events.indexOf(cues[0])).toBeLessThan(sim.events.indexOf(damage));
    const { renderer, triggerAttack, onDamage } = dispatchHarness(mob);
    renderer.handleEvent(cues[0]);
    renderer.handleEvent(damage);
    // A concurrent ordinary melee hit must not restart a generic swing either.
    renderer.handleEvent({ ...damage, ability: null });
    expect(triggerAttack).toHaveBeenCalledExactlyOnceWith(mob.id, 'mogger_ground_pound');
    expect(onDamage).toHaveBeenCalledTimes(2);
  });

  it('lets the actual pound interrupt a simultaneous support gesture without replaying damage', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: false });
    const mob = engaged(sim, 'mogger');
    mob.wardTimer = 0;
    mob.pulseTimer = 0;
    sim.events = [];
    inner(sim).updateBossMechanics(mob);
    inner(sim).updateMob(mob);
    const events = sim.events.filter((e) => e.type === 'spellfx' || e.type === 'damage');
    const { renderer, triggerAttack } = dispatchHarness(mob);
    for (const event of events) renderer.handleEvent(event);
    expect(triggerAttack.mock.calls.map((call) => call[1])).toEqual([
      'mogger_bracing_order',
      'mogger_ground_pound',
    ]);
    renderer.handleEvent({
      type: 'spellfx',
      sourceId: mob.id,
      targetId: mob.id,
      school: 'physical',
      fx: 'nova',
      ability: 'mogger_bracing_order',
    });
    expect(triggerAttack).toHaveBeenCalledTimes(2);
  });

  it('annotates support cues without changing healed health, ward, haste or reset times', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: false });
    const healer = engaged(sim, 'wildheart_hexcaller');
    healer.hp -= 100;
    healer.mendTimer = 0;
    sim.events = [];
    inner(sim).updateBossMechanics(healer);
    expect(sim.events).toContainEqual(
      expect.objectContaining({ type: 'spellfx', ability: 'wildheart_ancestral_sap' }),
    );
    expect(healer.hp).toBeGreaterThan(healer.maxHp - 100);
    expect(healer.mendTimer).toBe(MOBS.wildheart_hexcaller.mendAlly!.every);
    const beast = engaged(sim, 'wildheart_beastmaster');
    beast.wardTimer = 0;
    beast.warcryTimer = 0;
    sim.events = [];
    inner(sim).updateBossMechanics(beast);
    expect(
      sim.events.filter((e) => e.type === 'spellfx').map((e) => e.type === 'spellfx' && e.ability),
    ).toEqual(['wildheart_thickhide_ward', 'wildheart_call_of_the_hunt']);
    expect(beast.auras.some((a) => a.kind === 'absorb' && a.value === 70)).toBe(true);
    expect(beast.auras.some((a) => a.kind === 'buff_haste' && a.value === 1.2)).toBe(true);
    expect(beast.wardTimer).toBe(MOBS.wildheart_beastmaster.wardAllies!.every);
    expect(beast.warcryTimer).toBe(MOBS.wildheart_beastmaster.warcry!.every);
  });

  it('retains the old nova shape on unrelated stomp carriers', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: false });
    const mob = engaged(sim, 'korgath_the_bound');
    mob.stompTimer = 0;
    sim.events = [];
    inner(sim).updateMob(mob);
    const cue = sim.events.find(
      (e) => e.type === 'spellfx' && e.sourceId === mob.id && e.fx === 'nova',
    );
    expect(cue).toEqual({
      type: 'spellfx',
      sourceId: mob.id,
      targetId: mob.id,
      school: 'physical',
      fx: 'nova',
    });
  });

  it('requires an authored clip and protects only a playing identified mechanic', () => {
    const source = { kind: 'mob', castingAbility: null };
    const visual = {
      supportsJoinedCastRelease: false,
      isPreparingFittedCast: false,
      isMidOneShot: true,
      hasAttackClipOverride: () => true,
      isPlayingAttackClip: (id: string) => id === 'mogger_ground_pound',
    };
    const event = { fx: 'nova', ability: 'mogger_ground_pound' };
    expect(
      fallbackSpellGesture(event, source, { ...visual, hasAttackClipOverride: () => false }),
    ).toBeNull();
    expect(fallbackSpellGesture(event, source, visual)).toBeNull();
    expect(
      fallbackSpellGesture(event, source, { ...visual, isPlayingAttackClip: () => false }),
    ).toBe('attack');
    expect(damageEventStartsAttackAnimation(source, visual, undefined)).toBe(false);
    expect(
      damageEventStartsAttackAnimation(
        source,
        { ...visual, isPlayingAttackClip: () => false },
        undefined,
      ),
    ).toBe(true);
    expect(damageEventStartsAttackAnimation({ kind: 'player' }, visual, undefined)).toBe(true);
  });

  it('reads the actual current clip rather than treating every one-shot as a mechanic', () => {
    const visual = {
      def: { clips: { attackByAbility: { mogger_ground_pound: 'PoundRelease' } } },
      currentIsOneShot: true,
      current: { getClip: () => ({ name: 'PoundRelease' }) },
    };
    const read = (id: string) =>
      CharacterVisual.prototype.isPlayingAttackClip.call(visual as never, id);
    expect(read('mogger_ground_pound')).toBe(true);
    expect(read('mogger_bracing_order')).toBe(false);
    visual.current = { getClip: () => ({ name: 'Hit' }) };
    expect(read('mogger_ground_pound')).toBe(false);
  });
});
