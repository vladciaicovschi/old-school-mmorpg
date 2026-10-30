// The renderer's spellfx arm dispatches the MOB engage cue (isMobEngageCue)
// before the warrior cast plan, and both claim fx 'shout' and 'flourish'.
// Whichever matches first wins outright, because the branch breaks. The pure
// halves of that split are pinned in tests/warrior_render_contract.test.ts; the
// CALL SITE is what this file pins, since a predicate can be correct while the
// branch using it sits in the wrong place or reads the wrong field. That is the
// shape of the regression it guards: a mob-cue branch above the warrior plan
// that broke unconditionally, so raised_guard's flourish lost its authored Block
// gesture to a playFlourish() no-op on a rig with no flourish clip.

import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Renderer } from '../src/render/renderer';
import { WARRIOR_SHOUT_COLORS } from '../src/render/warrior_cast_fx_core';
import { ABILITIES } from '../src/sim/data';
import type { SimEvent } from '../src/sim/types';

interface EventHarness {
  handleEvent(ev: SimEvent): void;
}

const SOURCE_ID = 7;

/** A renderer stripped to just what the two contested arms of handleEvent
 *  touch, with the source entity's kind as the one variable. The per-ability
 *  painter declines here, which is the real path for 'flourish' (never in its
 *  claim set) and the defensive fallback for a specless 'shout'. */
function dispatchHarness(sourceKind: 'player' | 'mob', joined = false) {
  const calls = {
    playFlourish: vi.fn(),
    pulseAt: vi.fn(),
    triggerAttack: vi.fn(),
    triggerCastRelease: vi.fn(),
    playShoutFx: vi.fn(),
    nova: vi.fn(),
    playMagicAutoAttack: vi.fn(() => true),
    castPalmWorldPosition: vi.fn((out: Vector3) => {
      out.set(3, 4, 5);
      return true;
    }),
    projectileForEvent: vi.fn(),
  };
  const renderer = Object.create(Renderer.prototype) as EventHarness & Record<string, unknown>;
  renderer.abilityVfx = { handleSpellfx: vi.fn().mockReturnValue(false) };
  renderer.vfx = { nova: calls.nova, projectileForEvent: calls.projectileForEvent };
  renderer.pulseAt = calls.pulseAt;
  renderer.triggerAttack = calls.triggerAttack;
  renderer.triggerCastRelease = calls.triggerCastRelease;
  renderer.playShoutFx = calls.playShoutFx;
  renderer.activeVisual = () => ({
    playFlourish: calls.playFlourish,
    supportsJoinedCastRelease: joined,
    isMidOneShot: false,
    playMagicAutoAttack: calls.playMagicAutoAttack,
    castPalmWorldPosition: calls.castPalmWorldPosition,
  });
  renderer.views = new Map([[SOURCE_ID, {}]]);
  renderer.sim = {
    player: { id: 1 },
    entities: new Map([[SOURCE_ID, { id: SOURCE_ID, kind: sourceKind }]]),
  };
  return { harness: renderer as EventHarness, calls };
}

function cue(fx: 'shout' | 'flourish', ability?: string): SimEvent {
  return {
    type: 'spellfx',
    sourceId: SOURCE_ID,
    targetId: SOURCE_ID,
    school: 'fire',
    fx,
    ...(ability === undefined ? {} : { ability }),
  } as SimEvent;
}

describe('handleEvent spellfx: the mob engage cue never swallows a warrior castFx', () => {
  it.each(['mage', 'priest', 'druid', 'warlock'])(
    'starts %s magical auto animation at launch, independently of registry claims',
    (cls) => {
      const { harness, calls } = dispatchHarness('player', true);
      const renderer = harness as unknown as {
        sim: { entities: Map<number, unknown> };
        abilityVfx: { handleSpellfx: ReturnType<typeof vi.fn> };
      };
      renderer.sim.entities.set(SOURCE_ID, { id: SOURCE_ID, kind: 'player', templateId: cls });
      renderer.abilityVfx.handleSpellfx.mockReturnValue(true);
      const event = {
        type: 'spellfx',
        sourceId: SOURCE_ID,
        targetId: 9,
        fx: 'projectile',
        school: 'arcane',
        wand: true,
      } as const;
      harness.handleEvent(event);
      expect(calls.playMagicAutoAttack).toHaveBeenCalledOnce();
      expect(calls.projectileForEvent).toHaveBeenCalledExactlyOnceWith(event, new Vector3(3, 4, 5));
      expect(calls.triggerAttack).not.toHaveBeenCalled();
      expect(calls.triggerCastRelease).not.toHaveBeenCalled();
      expect(renderer.abilityVfx.handleSpellfx).not.toHaveBeenCalled();
    },
  );
  it('keeps an ordinary ability projectile off the magical-auto route', () => {
    const { harness, calls } = dispatchHarness('player', true);
    const event = {
      type: 'spellfx',
      sourceId: SOURCE_ID,
      targetId: 9,
      fx: 'projectile',
      school: 'frost',
      ability: 'frostbolt',
    } as const;
    harness.handleEvent(event);
    expect(calls.playMagicAutoAttack).not.toHaveBeenCalled();
    expect(calls.castPalmWorldPosition).not.toHaveBeenCalled();
    expect(calls.projectileForEvent).toHaveBeenCalledExactlyOnceWith(event);
  });
  it.each([SOURCE_ID, 9])(
    'releases an opted-in mob unknown-spec friendly cast before the no-nova early exit (%s)',
    (targetId) => {
      const { harness, calls } = dispatchHarness('mob', true);
      harness.handleEvent({
        type: 'spellfx',
        sourceId: SOURCE_ID,
        targetId,
        school: 'holy',
        fx: 'selfCast',
        ability: 'unknown_test_heal',
      } as SimEvent);
      expect(calls.triggerCastRelease).toHaveBeenCalledWith(
        SOURCE_ID,
        'unknown_test_heal',
        targetId,
      );
      expect(calls.triggerAttack).not.toHaveBeenCalled();
      expect(calls.nova).not.toHaveBeenCalled();
    },
  );
  it('does not add a release or a nova to an unopted unknown friendly cue', () => {
    const { harness, calls } = dispatchHarness('mob');
    harness.handleEvent({
      type: 'spellfx',
      sourceId: SOURCE_ID,
      targetId: SOURCE_ID,
      school: 'holy',
      fx: 'selfCast',
      ability: 'unknown_test_heal',
    } as SimEvent);
    expect(calls.triggerCastRelease).not.toHaveBeenCalled();
    expect(calls.nova).not.toHaveBeenCalled();
  });
  it("routes a player's raised_guard flourish to its authored gesture clip", () => {
    const { harness, calls } = dispatchHarness('player');

    harness.handleEvent(cue('flourish', 'raised_guard'));

    expect(calls.triggerAttack).toHaveBeenCalledWith(SOURCE_ID, 'raised_guard');
    expect(calls.playFlourish).not.toHaveBeenCalled();
    // and it never walks on to the terminal school nova either
    expect(calls.nova).not.toHaveBeenCalled();
  });

  it("routes a player's shout to the warrior shout plan, not the mob arm", () => {
    const { harness, calls } = dispatchHarness('player');

    harness.handleEvent(cue('shout', 'battle_shout'));

    expect(calls.playShoutFx).toHaveBeenCalledOnce();
    expect(calls.playShoutFx.mock.calls[0]?.[1]).toMatchObject({
      kind: 'shout',
      color: WARRIOR_SHOUT_COLORS.battle_shout,
      emote: 'cheer',
    });
    expect(calls.playFlourish).not.toHaveBeenCalled();
  });

  it("plays a mob's engage bellow as the rig's flourish one-shot plus a pulse", () => {
    const { harness, calls } = dispatchHarness('mob');

    harness.handleEvent(cue('shout'));

    expect(calls.playFlourish).toHaveBeenCalledOnce();
    expect(calls.pulseAt).toHaveBeenCalledOnce();
    // the warrior arm would repaint it with a default roar color and a cheer
    expect(calls.playShoutFx).not.toHaveBeenCalled();
    expect(calls.triggerAttack).not.toHaveBeenCalled();
  });

  it("plays a mob's hatch flourish as the one-shot alone, with no pulse", () => {
    const { harness, calls } = dispatchHarness('mob');

    harness.handleEvent(cue('flourish'));

    expect(calls.playFlourish).toHaveBeenCalledOnce();
    expect(calls.pulseAt).not.toHaveBeenCalled();
    expect(calls.nova).not.toHaveBeenCalled();
  });

  it('reads the SOURCE, so a mob cue carrying an ability id stays a mob cue', () => {
    // The call site must not switch to an `ev.ability === undefined` test: mob
    // spellfx already carry an ability id where the rig authors a per-mechanic
    // clip (the brood's 'windup' Cleave and Stun), so the day a brood shout
    // wants one it would start falling through to the warrior plan.
    const { harness, calls } = dispatchHarness('mob');

    harness.handleEvent(cue('shout', 'brood_roar'));

    expect(calls.playFlourish).toHaveBeenCalledOnce();
    expect(calls.playShoutFx).not.toHaveBeenCalled();
  });

  it('pins the player castFx premise these cases stand on', () => {
    // The two player abilities driven above really do ride the contested fx
    // kinds, so a content change cannot quietly stop this file covering them.
    expect(ABILITIES.raised_guard.castFx).toBe('flourish');
    expect(ABILITIES.battle_shout.castFx).toBe('shout');
  });
});
