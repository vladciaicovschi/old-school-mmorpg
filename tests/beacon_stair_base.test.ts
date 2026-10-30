import { describe, expect, it } from 'vitest';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { MAX_STEP_HEIGHT, moveCharacter } from '../src/sim/physics';
import { groundHeight } from '../src/sim/world';

describe('Old Beacon lawn after the exterior stair replacement', () => {
  it('lets the full player body cross the formerly invisible balcony rim', () => {
    const seed = 20061,
      out = { x: 0, y: 0, z: 0, stepped: 0, blocked: false };
    const params = {
      seed,
      radius: PLAYER_BODY_RADIUS,
      stepHeight: MAX_STEP_HEIGHT,
      maxSlope: PLAYER_MAX_CLIMB_SLOPE,
      grounded: true,
      swimming: false,
      ignoreFences: false,
    };
    let x = 505,
      z = 305;
    for (let i = 0; i < 60; i++) {
      moveCharacter(params, x, groundHeight(x, z, seed), z, -0.025, 0.01, out);
      expect(out.blocked).toBe(false);
      x = out.x;
      z = out.z;
    }
    expect(x).toBeCloseTo(503.5, 5);
    expect(z).toBeCloseTo(305.6, 5);
  });
});
