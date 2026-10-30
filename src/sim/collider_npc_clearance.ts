import { getActiveWorldContent } from './data';

// Authored NPCs and runtime Spirit Healers reserve the same ground on all hosts.
export function townNpcPositions(): { x: number; z: number }[] {
  const content = getActiveWorldContent();
  const out: { x: number; z: number }[] = [];
  for (const npc of Object.values(content.npcs)) {
    const pos = (npc as { pos?: { x: number; z: number } }).pos;
    if (pos) out.push({ x: pos.x, z: pos.z });
  }
  for (const g of content.services?.graveyards ?? []) out.push({ x: g.x, z: g.z });
  return out;
}
export function standsOnNpcSpot(
  x: number,
  z: number,
  r: number,
  spots: readonly { x: number; z: number }[],
): boolean {
  for (const s of spots) {
    if (Math.hypot(s.x - x, s.z - z) < r + 0.4) return true;
  }
  return false;
}
