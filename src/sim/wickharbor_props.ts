import type { ZonePropsDef } from './types';
import { WICKHARBOR_BUILDINGS } from './wickharbor_layout';
import { WICKHARBOR_PIER_CARGO } from './wickharbor_pier_cargo';
import { WICKHARBOR_VESSELS } from './wickharbor_vessels';

/** Replace the approved harbor settlement and fleet, preserving distant camps. */
export function rebuildWickharborProps(legacy: ZonePropsDef): ZonePropsDef {
  const outside = (x: number, z: number) => x < 350 || x > 536 || z < 294 || z > 430;
  return {
    ...legacy,
    buildings: [...legacy.buildings.filter((b) => outside(b.x, b.z)), ...WICKHARBOR_BUILDINGS],
    wells: legacy.wells.filter((w) => outside(w.x, w.z)),
    stalls: legacy.stalls.filter((s) => outside(s.x, s.z)),
    crates: legacy.crates.filter(([x, z]) => outside(x, z)),
    campfires: legacy.campfires.filter(([x, z]) => outside(x, z)),
    fences: legacy.fences.filter((f) => outside((f.x1 + f.x2) / 2, (f.z1 + f.z2) / 2)),
    decorProps: [
      ...(legacy.decorProps ?? []).filter(
        (p) => outside(p.x, p.z) || /^(hexBoatrack|hexAnchor)$/.test(p.key),
      ),
      ...WICKHARBOR_VESSELS,
      ...WICKHARBOR_PIER_CARGO,
    ],
  };
}
