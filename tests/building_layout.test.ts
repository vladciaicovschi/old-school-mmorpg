import { describe, expect, it } from 'vitest';
import {
  buildingContainsPoint,
  buildingContainsRestPoint,
  buildingLocalToWorld,
} from '../src/sim/building_layout';
import type { BuildingDef } from '../src/sim/types';

const fixture: BuildingDef = {
  id: 'settlement:eastbrook:hearth-inn',
  kind: 'inn',
  x: 37,
  z: -19,
  w: 4,
  d: 12,
  rot: 0.731,
};

describe('building rest footprint orientation', () => {
  it('uses the visible footprint for rebuilt settlement and Wickharbor inns', () => {
    for (const id of [
      'settlement:eastbrook:hearth-inn',
      'settlement:icemantle:muster-hall',
      'settlement:gibbetmere:trade-hall',
      'wickharbor:inn',
      'eastbrook_inn',
      'fenbridge_crooked_reed_inn',
    ]) {
      const building = { ...fixture, id };
      const porch = buildingLocalToWorld(building, 0, building.d / 2 + 1.5);
      const outside = buildingLocalToWorld(building, 0, building.d / 2 + 2.01);
      expect(buildingContainsPoint(building, porch.x, porch.z, 2), id).toBe(true);
      expect(buildingContainsRestPoint(building, porch.x, porch.z, 2), id).toBe(true);
      expect(buildingContainsRestPoint(building, outside.x, outside.z, 2), id).toBe(false);
    }
  });

  it('preserves the established historical footprint for unrelated inns', () => {
    for (const id of ['unrelated_legacy_inn', undefined]) {
      const building = { ...fixture, id };
      const visiblePorch = buildingLocalToWorld(building, 0, building.d / 2 + 1.5);
      const legacyPorch = buildingLocalToWorld({ ...building, rot: -building.rot }, 0, 7.5);
      expect(buildingContainsRestPoint(building, visiblePorch.x, visiblePorch.z, 2)).toBe(false);
      expect(buildingContainsRestPoint(building, legacyPorch.x, legacyPorch.z, 2)).toBe(true);
    }
  });
});
