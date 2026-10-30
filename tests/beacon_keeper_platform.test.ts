import { describe, expect, it } from 'vitest';
import { GALECREST_NPCS } from '../src/sim/content/galecrest';
import { Sim } from '../src/sim/sim';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';

describe('Keeper Bram at the rebuilt Old Beacon', () => {
  it('keeps his quest identity and authored dry lawn position beside the entrance', () => {
    const seed = 20061,
      sim = new Sim({ seed, playerClass: 'warrior' });
    const bram = [...sim.entities.values()].find(
      (e) => e.kind === 'npc' && e.templateId === 'keeper_bram',
    )!;
    const def = GALECREST_NPCS.keeper_bram;
    expect(bram).toBeDefined();
    expect(bram.pos.x).toBe(def.pos.x);
    expect(bram.pos.z).toBe(def.pos.z);
    expect(bram.pos.y).toBeCloseTo(terrainHeight(bram.pos.x, bram.pos.z, seed), 6);
    expect(bram.pos.y).toBeGreaterThan(WATER_LEVEL + 0.6);
    expect(def.questIds).toContain('q_gc_keeper_of_the_flame');
  }, 20000);
});
