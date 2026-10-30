import { DEV_MODEL_COMPARISONS, DEV_NPC_REPLACEMENTS } from './content/dev_model_comparisons';
import {
  DEV_MODEL_LAB_ARRIVAL,
  DEV_MODEL_LAB_MOB_LINEUP,
  DEV_MODEL_LAB_NPC_LINEUP,
} from './content/dev_model_lab';
import type { NpcDef } from './types';

export interface ModelComparisonSubject {
  templateId: string;
  sourceNpcId?: string;
  visualKey?: string;
  side: 'old' | 'new';
  status: 'missing' | 'ready' | 'installed';
  category: 'animal' | 'mob' | 'npc';
  pairId: string;
  combatMobId?: string;
  x: number;
  z: number;
  facing: number;
}

/** Builds dynamic comparison definitions. Mannequins stay inert; explicit
 * combatMobId rows opt into existing lab mob templates when spawned. */
export function buildDevModelComparisonGallery(npcs: Readonly<Record<string, NpcDef>>): {
  templates: Record<string, NpcDef>;
  subjects: ModelComparisonSubject[];
  byId: ReadonlyMap<string, ModelComparisonSubject>;
} {
  const templates: Record<string, NpcDef> = {};
  const subjects: ModelComparisonSubject[] = [];
  const occupied = [
    DEV_MODEL_LAB_ARRIVAL,
    ...DEV_MODEL_LAB_MOB_LINEUP,
    ...DEV_MODEL_LAB_NPC_LINEUP,
  ];
  const cells: { x: number; z: number }[] = [];
  for (let z = -150; z <= 150; z += 20) {
    for (let x = 584; x <= 884; x += 20) {
      if (occupied.some((p) => Math.hypot(p.x - (x + 4), p.z - z) < 20)) continue;
      cells.push({ x, z });
    }
  }
  let cellIndex = 0;
  const addRow = (
    id: string,
    name: string,
    category: ModelComparisonSubject['category'],
    oldVisual: string | undefined,
    newVisual: string | undefined,
    installed = false,
    sourceNpcId?: string,
    color = 0xffffff,
    fixedCell?: { x: number; z: number },
    combatMobId?: string,
  ): void => {
    const cell = fixedCell ?? cells[cellIndex++];
    if (!cell) throw new Error('Model comparison gallery exceeds the island floor');
    const status = newVisual ? (installed ? 'installed' : 'ready') : 'missing';
    const statusLabel = {
      missing: 'NO REPLACEMENT',
      ready: 'REPLACEMENT READY',
      installed: 'REPLACED IN GAME',
    }[status];
    // Show the current candidate once; retain the old body only when no
    // replacement exists. Keep the selected side's position within its row.
    const side = newVisual ? 'new' : 'old';
    const templateId = `dev_compare_${category}_${side}_${id}`;
    const x = cell.x + (side === 'old' ? 8 : 0);
    const subject: ModelComparisonSubject = {
      templateId,
      sourceNpcId,
      visualKey: side === 'old' ? oldVisual : newVisual,
      side,
      status,
      category,
      pairId: `${category}_${id}`,
      ...(combatMobId ? { combatMobId } : {}),
      x,
      z: cell.z,
      facing: Math.PI,
    };
    subjects.push(subject);
    templates[templateId] = {
      id: templateId,
      name: `[${side === 'old' ? 'OLD' : 'NEW'}/${status === 'installed' ? 'DONE' : status.toUpperCase()}] ${name}`,
      title: statusLabel,
      pos: { x, z: cell.z },
      facing: subject.facing,
      color,
      questIds: [],
      greeting: statusLabel,
      dynamic: true,
    };
  };
  // Palette trials use the already-reserved strip beside the combat troll,
  // keeping the main comparison gallery's capacity and positions unchanged.
  const troll = DEV_MODEL_LAB_MOB_LINEUP.find((subject) => subject.templateId === 'dev_troll');
  let paletteIndex = 0;
  for (const row of DEV_MODEL_COMPARISONS) {
    const combatPad = row.labMobId
      ? DEV_MODEL_LAB_MOB_LINEUP.find((subject) => subject.templateId === row.labMobId)
      : undefined;
    if (row.labMobId && !combatPad) throw new Error(`Missing gallery combat pad: ${row.labMobId}`);
    // Element variants use reserved space beside their existing combat pads;
    // adding them does not consume the main gallery's remaining floor cells.
    const fixedCell = combatPad
      ? { x: combatPad.x + (row.labOffset?.x ?? 8), z: combatPad.z + (row.labOffset?.z ?? -8) }
      : row.palette && troll
        ? { x: troll.x + 8, z: troll.z - 8 + paletteIndex++ * 8 }
        : undefined;
    addRow(
      row.id,
      row.name,
      row.category,
      row.oldVisual,
      row.newVisual,
      row.installed,
      undefined,
      0xffffff,
      fixedCell,
      row.combatMobId,
    );
  }
  // One row per named NPC, including dynamic raid/service actors. Repeated
  // placements of the same person share a row and their original look.
  const seen = new Set<string>();
  for (const npc of Object.values(npcs)) {
    const id = npc.id.startsWith('brother_aldric')
      ? 'brother_aldric'
      : npc.id === 'scout_maren_highwatch'
        ? 'scout_maren'
        : npc.id === 'brother_halven_marsh'
          ? 'brother_halven'
          : npc.id;
    if (seen.has(id) || id.startsWith('dev_')) continue;
    seen.add(id);
    const newVisual = DEV_NPC_REPLACEMENTS[id];
    addRow(
      id,
      npc.name,
      'npc',
      id === 'brother_aldric' ? 'dev_legacy_aldric' : undefined,
      newVisual,
      newVisual !== undefined && !newVisual.startsWith('npc_quaternius_'),
      id,
      npc.color,
    );
  }
  return {
    templates,
    subjects,
    byId: new Map(subjects.map((subject) => [subject.templateId, subject])),
  };
}
