import { describe, expect, it } from 'vitest';
import { isBlocked, resolvePosition } from '../src/sim/colliders';
import { FARSHORE_NPCS } from '../src/sim/content/farshore';
import { ZONE1_NPCS } from '../src/sim/content/zone1';
import { NPCS } from '../src/sim/data';
import { EASTBROOK_LAYOUT } from '../src/sim/eastbrook_layout';
import { settlementService } from '../src/sim/settlements_layout';
import { Sim } from '../src/sim/sim';
import { WORLD_SEED } from '../src/sim/world_seed';

const gullhavenNpcIds = {
  coalfast: 'warden_coalfast',
  edda: 'quartermaster_edda',
  saul: 'mender_saul',
  nell: 'fisher_nell',
  tam: 'bellkeeper_tam',
} as const;

describe('settlement NPC standing points beside enlarged entrances', () => {
  it('keeps the priest and commander clear at their authored service poses', () => {
    const priest = ZONE1_NPCS.brother_aldric;
    const authoredPriest = EASTBROOK_LAYOUT.services.npcs.find((p) => p.id === 'brother_aldric')!;
    const commander = FARSHORE_NPCS.warden_coalfast;
    const authoredCommander = settlementService('gullhaven', 'coalfast')!;
    expect(priest.pos).toEqual(authoredPriest.position);
    expect(commander.pos).toEqual({ x: authoredCommander.x, z: authoredCommander.z });
    for (const npc of [priest, commander]) {
      expect(isBlocked(WORLD_SEED, npc.pos.x, npc.pos.z, 0.6), npc.id).toBe(false);
      expect(resolvePosition(WORLD_SEED, npc.pos.x, npc.pos.z, 0.6), npc.id).toEqual(npc.pos);
    }
  });
  it('spawns the actual NPCs without safe-position correction or facing drift', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
    for (const def of [
      ...EASTBROOK_LAYOUT.services.npcs.map((p) => NPCS[p.id]),
      ...Object.values(gullhavenNpcIds).map((id) => FARSHORE_NPCS[id]),
    ]) {
      const entity = [...sim.entities.values()].find((e) => e.templateId === def.id)!;
      expect(entity, def.id).toBeDefined();
      expect({ x: entity.pos.x, z: entity.pos.z }, def.id).toEqual(def.pos);
      expect(entity.facing, def.id).toBe(def.facing);
      expect(entity.prevFacing, def.id).toBe(def.facing);
    }
  });
  it('keeps every authored Eastbrook town NPC clear of the grown architecture', () => {
    const blocked = EASTBROOK_LAYOUT.services.npcs
      .filter((p) => isBlocked(WORLD_SEED, p.position.x, p.position.z, 0.6))
      .map((p) => ({
        id: p.id,
        position: p.position,
        resolved: resolvePosition(WORLD_SEED, p.position.x, p.position.z, 0.6),
      }));
    expect(blocked).toEqual([]);
  });

  it('matches every Gullhaven NPC to its clear canonical fixed marker', () => {
    for (const [key, id] of Object.entries(gullhavenNpcIds)) {
      const npc = FARSHORE_NPCS[id],
        point = settlementService('gullhaven', key)!;
      expect(npc.pos, id).toEqual({ x: point.x, z: point.z });
      expect(resolvePosition(WORLD_SEED, point.x, point.z, 0.6), id).toEqual(npc.pos);
      expect(isBlocked(WORLD_SEED, point.x, point.z, 0.6), id).toBe(false);
    }
  });
});
