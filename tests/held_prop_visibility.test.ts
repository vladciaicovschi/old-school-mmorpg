import { describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';

describe('magic-caster visual policy', () => {
  it('keeps a weapon in idle and stows it only for authored free-hand magic casts', () => {
    for (const key of ['player_priest', 'player_mage', 'player_druid', 'player_warlock'] as const) {
      expect(VISUALS[key].stowHeldPropsWhileCasting).toBe(true);
      expect(VISUALS[key].attach?.length).toBeGreaterThan(0);
    }
    expect(VISUALS.player_warlock.attach?.[0]?.stowByDefault).not.toBe(true);
    expect(VISUALS.player_shaman.stowHeldPropsWhileCasting).toBeUndefined();
    expect(VISUALS.player_paladin.stowHeldPropsWhileCasting).toBeUndefined();
  });
});
