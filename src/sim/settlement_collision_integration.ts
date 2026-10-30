import type { Collider } from './colliders';
import { BUILTIN_WORLD } from './data';
import { buildDecorPropColliders } from './decor_prop_colliders';
import { buildSettlementColliders } from './settlements_colliders';
import { isSettlementBuilding } from './settlements_layout';
import type { BuildingDef, WorldContent } from './types';
import { buildWickharborColliders } from './wickharbor_colliders';
import { isWickharborBuilding } from './wickharbor_layout';
import { terrainHeight } from './world';

/** Custom worlds retain generic collision for built-in-only settlement models. */
export function hasAuthoredSettlementCollision(building: BuildingDef, builtin: boolean) {
  return isWickharborBuilding(building) || (builtin && isSettlementBuilding(building));
}

/** One seam for authored towns and hand-placed GLB decor, preserving collision order. */
export function buildAuthoredSettlementColliders(content: WorldContent, seed: number): Collider[] {
  const props = content.props,
    height = (x: number, z: number) => terrainHeight(x, z, seed);
  return [
    ...(content === BUILTIN_WORLD && props.buildings.some(isSettlementBuilding)
      ? buildSettlementColliders(height)
      : []),
    ...buildDecorPropColliders(seed, props.decorProps ?? []),
    ...(props.buildings.some(isWickharborBuilding) ? buildWickharborColliders(height) : []),
  ];
}
