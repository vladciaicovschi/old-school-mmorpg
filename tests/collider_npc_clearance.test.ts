import { describe, expect, it } from 'vitest';
import { standsOnNpcSpot, townNpcPositions } from '../src/sim/collider_npc_clearance';
import { BUILTIN_WORLD } from '../src/sim/data';

describe('collider NPC clearance extraction', () => {
  it('preserves NPC then graveyard iteration order and copies coordinates', () => {
    const expected = [
      ...Object.values(BUILTIN_WORLD.npcs).map((n) => n.pos),
      ...(BUILTIN_WORLD.services?.graveyards ?? []),
    ];
    expect(townNpcPositions()).toEqual(expected.map((p) => ({ x: p.x, z: p.z })));
    expect(townNpcPositions()[0]).not.toBe(expected[0]);
  });
  it('keeps the strict 0.4m NPC margin', () => {
    expect(standsOnNpcSpot(0, 0, 1, [{ x: 1.399, z: 0 }])).toBe(true);
    expect(standsOnNpcSpot(0, 0, 1, [{ x: 1.4, z: 0 }])).toBe(false);
  });
});
