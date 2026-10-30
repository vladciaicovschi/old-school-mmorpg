import { describe, expect, it } from 'vitest';
import { BUILTIN_WORLD } from '../src/sim/data';
import { buildDecorPropColliders } from '../src/sim/decor_prop_colliders';
import {
  buildAuthoredSettlementColliders,
  hasAuthoredSettlementCollision,
} from '../src/sim/settlement_collision_integration';
import { type BuildingDef, emptyZoneProps } from '../src/sim/types';

describe('authored settlement collision integration', () => {
  it('restricts settlement assemblies to their built-in world authority', () => {
    const building: BuildingDef = {
      id: 'settlement:eastbrook:chapel',
      kind: 'chapel',
      x: 0,
      z: 0,
      w: 8,
      d: 12,
      rot: 0,
    };
    expect(hasAuthoredSettlementCollision(building, true)).toBe(true);
    expect(hasAuthoredSettlementCollision(building, false)).toBe(false);
    expect(hasAuthoredSettlementCollision({ ...building, id: 'wickharbor:chapel' }, false)).toBe(
      true,
    );
  });

  it('keeps hand-placed decor collision without importing global towns into a custom world', () => {
    const props = { ...emptyZoneProps(), decorProps: [{ key: 'hexBarrel', x: 1, z: 2, r: 0.5 }] },
      content = { ...BUILTIN_WORLD, props },
      seed = 20061;
    expect(buildAuthoredSettlementColliders(content, seed)).toEqual(
      buildDecorPropColliders(seed, props.decorProps),
    );
    expect(buildAuthoredSettlementColliders(content, seed)).toHaveLength(1);
  });
});
