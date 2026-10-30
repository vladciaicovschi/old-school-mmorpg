import { describe, expect, it, vi } from 'vitest';
import {
  castGestureCapabilities,
  fallbackSpellGesture,
  hasJoinedMobCastContext,
  mobSpellGesturePlan,
} from '../src/render/characters/cast_gesture_capabilities_core';

describe('joined mob spell gesture capabilities', () => {
  it('composes the live source/form capability for registry-declined cues', () => {
    const event = { fx: 'projectile', ability: 'unknown_spell' };
    const visual = {
      supportsJoinedCastRelease: true,
      isPreparingFittedCast: true,
      isMidOneShot: false,
    };
    expect(
      fallbackSpellGesture(event, { kind: 'mob', castingAbility: 'unknown_spell' }, visual),
    ).toBe('release');
    expect(fallbackSpellGesture(event, { kind: 'player' }, visual)).toBeNull();
    expect(
      fallbackSpellGesture(event, { kind: 'mob' }, { ...visual, isMidOneShot: true }),
    ).toBeNull();
    expect(
      fallbackSpellGesture(
        event,
        { kind: 'mob', castingAbility: 'unknown_spell', channeling: {} },
        visual,
      ),
    ).toBeNull();
    expect(fallbackSpellGesture({ fx: 'projectile' }, { kind: 'mob' }, null)).toBe('attack');
    expect(fallbackSpellGesture(event, undefined, null)).toBeNull();
  });
  it('distinguishes an id-less instant throw from a prepared or explicit spell', () => {
    expect(hasJoinedMobCastContext('projectile', undefined, false, false)).toBe(false);
    expect(hasJoinedMobCastContext('projectile', undefined, false, true)).toBe(true);
    expect(hasJoinedMobCastContext('projectile', 'shadow_bolt', false, false)).toBe(true);
    expect(hasJoinedMobCastContext('selfCast', undefined, false, false)).toBe(true);
  });
  it('follows the live visual and excludes active channels from fitted cast completion', () => {
    let joined = true;
    let channeling = false;
    const hasAttackClipOverride = vi.fn(() => true);
    const caps = castGestureCapabilities(
      (id) =>
        id === 7
          ? {
              hasAttackClipOverride,
              get supportsJoinedCastRelease() {
                return joined;
              },
            }
          : null,
      () => channeling,
    );
    expect(caps.hasGestureClip(7, 'shadow_bolt')).toBe(true);
    expect(caps.hasJoinedCastRelease(7)).toBe(true);
    channeling = true;
    expect(caps.hasJoinedCastRelease(7)).toBe(false);
    channeling = false;
    joined = false;
    expect(caps.hasJoinedCastRelease(7)).toBe(false);
    expect(caps.hasGestureClip(99, 'shadow_bolt')).toBe(false);
  });
  it('joins unknown spell FX without hiding legacy mob throws or repeating a running gesture', () => {
    for (const fx of ['projectile', 'lightning', 'nova', 'selfCast', 'beam']) {
      expect(mobSpellGesturePlan(fx, true, true, false, false, true)).toBe('release');
      expect(mobSpellGesturePlan(fx, true, true, false, true, true)).toBeNull();
      expect(mobSpellGesturePlan(fx, false, false, false, false, true)).toBeNull();
    }
    expect(mobSpellGesturePlan('tick', true, false, false, false, true)).toBeNull();
    expect(mobSpellGesturePlan('windup', true, false, false, false, true)).toBeNull();
    expect(mobSpellGesturePlan('projectile', true, false, false, false, false)).toBe('attack');
    expect(mobSpellGesturePlan('projectile', true, true, false, false, false)).toBeNull();
    expect(mobSpellGesturePlan('beam', true, true, true, false, true)).toBeNull();
  });
});
