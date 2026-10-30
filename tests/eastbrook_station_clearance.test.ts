import { describe, expect, it } from 'vitest';
import { resolvePosition } from '../src/sim/colliders';
import { distancePointToObb, EASTBROOK_LAYOUT, localToWorld } from '../src/sim/eastbrook_layout';
import { settlementPlans } from '../src/sim/settlements_layout';
import { STATION_PROP_CLUSTERS, STATION_PROP_SIZES } from '../src/sim/town_props';
import { terrainHeight } from '../src/sim/world';

const seed = 20061;

describe('Eastbrook enlarged architecture station clearance', () => {
  it('keeps profession anchors and their masters out of current physical walls', () => {
    for (const station of EASTBROOK_LAYOUT.services.stations) {
      const p = station.position;
      expect(resolvePosition(seed, p.x, p.z, 0.8), station.id).toEqual(p);
    }
    for (const id of ['weaver_ottilie', 'cook_marlow', 'forgemistress_darva']) {
      const npc = EASTBROOK_LAYOUT.services.npcs.find((value) => value.id === id)!;
      const p = npc.position;
      expect(resolvePosition(seed, p.x, p.z, npc.bodyRadius), id).toEqual(p);
    }
  });

  it('keeps the kitchen furniture clear of the whole tavern entrance approach', () => {
    const plan = settlementPlans((x, z) => terrainHeight(x, z, seed)).find(
      (value) => value.lot.id === 'hearth-inn',
    )!;
    const rect = plan.placement.approach;
    const corridor = {
      id: 'tavern-approach',
      center: localToWorld(
        plan.lot,
        plan.lot.rot,
        (rect.minX + rect.maxX) / 2,
        (rect.minZ + rect.maxZ) / 2,
      ),
      rotation: plan.lot.rot,
      halfWidth: (rect.maxX - rect.minX) / 2,
      halfDepth: (rect.maxZ - rect.minZ) / 2,
    };
    const station = EASTBROOK_LAYOUT.services.stations.find((value) => value.type === 'kitchens')!;
    for (const prop of STATION_PROP_CLUSTERS.kitchens) {
      const point = { x: station.position.x + prop.dx, z: station.position.z + prop.dz };
      expect(distancePointToObb(point, corridor), prop.kind).toBeGreaterThan(
        STATION_PROP_SIZES[prop.kind].r + 0.5,
      );
    }
  });
});
