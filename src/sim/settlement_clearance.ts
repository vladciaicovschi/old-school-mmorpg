import {
  type ArchitectureFootprint,
  architectureApproachFootprint,
  architectureFootprints,
  insideArchitecture,
} from './settlement_space';
import { SETTLEMENTS } from './settlements_layout';
import type { BuildingDef } from './types';
import { WICKHARBOR_LOTS } from './wickharbor_layout';

const approved = new Map<
  string,
  {
    lot: Pick<BuildingDef, 'x' | 'z' | 'w' | 'd' | 'rot'>;
    footprints: ArchitectureFootprint[];
    approach: ArchitectureFootprint;
  }
>([
  ...SETTLEMENTS.filter((s) => !s.decorationOnly).flatMap((s) =>
    s.lots.map(
      (lot) =>
        [
          `settlement:${s.id}:${lot.id}`,
          {
            lot,
            footprints: architectureFootprints(lot),
            approach: architectureApproachFootprint(lot),
          },
        ] as const,
    ),
  ),
  ...WICKHARBOR_LOTS.map(
    (lot) =>
      [
        `wickharbor:${lot.id}`,
        {
          lot,
          footprints: architectureFootprints(lot),
          approach: architectureApproachFootprint(lot),
        },
      ] as const,
  ),
]);

/** Resolve against the active prop table, including wings of approved assemblies. */
export function buildingFootprints(building: BuildingDef): ArchitectureFootprint[] {
  const entry = approved.get(building.id ?? '');
  if (
    entry &&
    entry.lot.x === building.x &&
    entry.lot.z === building.z &&
    entry.lot.w === building.w &&
    entry.lot.d === building.d &&
    entry.lot.rot === building.rot
  )
    return entry.footprints;
  return [
    {
      id: building.id ?? '',
      x: building.x,
      z: building.z,
      rot: building.rot,
      rect: {
        minX: -building.w / 2,
        maxX: building.w / 2,
        minZ: -building.d / 2,
        maxZ: building.d / 2,
      },
    },
  ];
}

/** Shared by generated visual trees and their authoritative collision field. */
export function buildingDecorationExcluded(
  buildings: readonly BuildingDef[],
  x: number,
  z: number,
  margin: number,
): boolean {
  for (const building of buildings) {
    // Most candidates are far from a town. Avoid transforms and allocations there.
    const reach = building.w + building.d + margin;
    if (Math.abs(x - building.x) > reach || Math.abs(z - building.z) > reach) continue;
    if (insideArchitecture(buildingFootprints(building), x, z, margin)) return true;
    const entry = approved.get(building.id ?? '');
    if (
      entry &&
      entry.lot.x === building.x &&
      entry.lot.z === building.z &&
      entry.lot.w === building.w &&
      entry.lot.d === building.d &&
      entry.lot.rot === building.rot &&
      insideArchitecture([entry.approach], x, z, margin)
    )
      return true;
  }
  return false;
}
