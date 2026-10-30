import { isOnDevModelLab } from './content/dev_model_lab';
import { devModelLabPadLandness } from './dev_model_lab_terrain';
import { buildingDecorationExcluded } from './settlement_clearance';
import type { BuildingDef } from './types';

const DECORATION_EXCLUSION_RADIUS = 1.2;
const DECORATION_EXCLUSIONS = [{ x: 2.456450840458274, z: 211.33819991815835 }];

export function isExcludedDecoration(
  x: number,
  z: number,
  margin: number,
  buildings: readonly BuildingDef[],
): boolean {
  if (isOnDevModelLab(x, z) && devModelLabPadLandness(x, z) > 0) return true;
  return (
    buildingDecorationExcluded(buildings, x, z, margin) ||
    DECORATION_EXCLUSIONS.some((p) => Math.hypot(x - p.x, z - p.z) < DECORATION_EXCLUSION_RADIUS)
  );
}
