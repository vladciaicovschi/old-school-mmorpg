import { describe, expect, it } from 'vitest';
import { castTargetMode, friendlyCastClip } from '../src/render/characters/cast_target_mode';

describe('cast target animation mode', () => {
  it('keeps self casts distinct from a friendly target', () => {
    expect(castTargetMode(7, null, 'friendly')).toBe('self');
    expect(castTargetMode(7, 7, 'friendly')).toBe('self');
    expect(castTargetMode(7, 12, 'friendly')).toBe('ally');
  });

  it('uses the hostile release gesture for enemy and unspecified targets', () => {
    expect(castTargetMode(7, 12, 'enemy')).toBe('hostile');
    expect(castTargetMode(7, 12, undefined)).toBe('hostile');
    expect(castTargetMode(7, 12, 'any')).toBe('hostile');
  });

  it('keeps ground-targeted enemy spells directed even without an entity target', () => {
    expect(castTargetMode(7, null, 'enemy')).toBe('hostile');
    expect(castTargetMode(7, undefined, 'enemy')).toBe('hostile');
  });

  it('prioritizes a self or ally gesture while preserving offensive school overrides', () => {
    const clips = { self: 'gather', ally: 'bless', hostile: 'bolt' };
    expect(friendlyCastClip(clips, 'self')).toBe('gather');
    expect(friendlyCastClip(clips, 'ally')).toBe('bless');
    expect(friendlyCastClip(clips, 'hostile')).toBeUndefined();
    expect(friendlyCastClip(undefined, 'self')).toBeUndefined();
  });
});
