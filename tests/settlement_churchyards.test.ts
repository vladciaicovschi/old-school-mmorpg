import { describe, expect, it } from 'vitest';
import {
  settlementChurchyardItems,
  settlementLegacyChurchyards,
} from '../src/sim/settlement_churchyards';
import { architectureFootprints, insideArchitecture } from '../src/sim/settlement_space';
import { SETTLEMENT_MODELS, SETTLEMENTS } from '../src/sim/settlements_layout';
import type { WickharborLot } from '../src/sim/wickharbor_layout';

describe('settlement churchyard replacement', () => {
  const bounds = { xMin: -132, xMax: 40, zMin: -147, zMax: -25 };

  it('replaces exact local visual clusters while preserving remote grave fields', () => {
    expect(settlementLegacyChurchyards([{ x: 400, z: 342 }], 'wickharbor', bounds)).toEqual([]);
    expect(settlementLegacyChurchyards([{ x: 290, z: 86 }], 'gullhaven', bounds)).toEqual([]);
    const remote = [
      { x: 294, z: 1612 },
      { x: 434, z: 1538 },
    ];
    expect(
      settlementLegacyChurchyards([...remote, { x: 386, z: 1420 }], 'gibbetmere', bounds),
    ).toEqual(remote);
    expect(
      settlementLegacyChurchyards(
        [
          { x: -7, z: -70 },
          { x: -22, z: 118 },
        ],
        'eastbrook',
        bounds,
      ),
    ).toEqual([{ x: -22, z: 118 }]);
    expect(settlementLegacyChurchyards(remote, 'unrelated', bounds)).toEqual(remote);
  });

  it('uses mixed repeated native markers clear of enlarged buildings and spirit healers', () => {
    const healers = {
      gullhaven: { x: 290, z: 86 },
      gibbetmere: { x: 378, z: 1412 },
      icemantle: { x: -34, z: 1576 },
    };
    for (const [id, healer] of Object.entries(healers)) {
      const settlement = SETTLEMENTS.find((value) => value.id === id)!;
      const footprints = settlement.lots.flatMap((lot) =>
        architectureFootprints(lot as WickharborLot),
      );
      const graves = settlementChurchyardItems(id);
      expect(graves.length).toBeGreaterThanOrEqual(5);
      expect(new Set(graves.map((grave) => grave.modelId)).size).toBeGreaterThanOrEqual(3);
      expect(new Set(graves.map((grave) => grave.modelId)).size).toBeLessThan(graves.length);
      expect(new Set(graves.map((grave) => grave.z)).size).toBe(graves.length);
      for (const grave of graves) {
        expect(SETTLEMENT_MODELS[grave.modelId], grave.id).toBeDefined();
        expect(settlement.dressing.some((item) => item.id === grave.id)).toBe(true);
        expect(insideArchitecture(footprints, grave.x, grave.z, 0.8), `${id}:${grave.id}`).toBe(
          false,
        );
        expect(
          Math.hypot(grave.x - healer.x, grave.z - healer.z),
          `${id}:${grave.id}`,
        ).toBeGreaterThan(4);
      }
    }
    expect(settlementChurchyardItems('eastbrook')).toEqual([]);
    expect(settlementChurchyardItems('wickharbor')).toEqual([]);
  });

  it('removes authored trees whose canopies overlap an enlarged building', () => {
    for (const settlement of SETTLEMENTS) {
      const footprints = settlement.lots.flatMap((lot) =>
        architectureFootprints(lot as WickharborLot),
      );
      for (const tree of settlement.trees ?? [])
        expect(
          insideArchitecture(footprints, tree.x, tree.z, Math.max(2.5, (tree.radius ?? 1) + 1)),
        ).toBe(false);
    }
  });
});
