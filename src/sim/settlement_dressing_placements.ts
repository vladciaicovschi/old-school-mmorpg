import { ARCHITECTURE_SCALE, scaleCoordinates } from './architecture_scale';
import type { SettlementItem } from './settlements_layout';

interface DressingHost {
  id: string;
  x: number;
  z: number;
  rot: number;
}

interface DressingFrame {
  lot: { x: number; z: number };
  scale: number;
}

const noOffset = [0, 0] as const;
const fixtureOffsets: Readonly<Record<string, readonly [number, number]>> = {
  // The enlarged menders' entrance needs the east half of the central square.
  'gullhaven:well': [-4, 1],
  'gullhaven:coalfast': [1, 0],
  'gullhaven:nell': [0, 3],
  'gullhaven:tam': [0, -2],
  // Keep the provision trader's stall on the square, ahead of the toolworks wall.
  'eastbrook:provisions-stall': [0, 2],
};

/** Fixed markers can share the exact final pose of their visible fixture. */
export function settlementFixtureOffset(region: string, itemId: string): readonly [number, number] {
  return fixtureOffsets[`${region}:${itemId}`] ?? noOffset;
}

/** Source ids distinguish house yards from independent palisades and docks. */
export function settlementDressingHost<T extends DressingHost>(
  item: Pick<SettlementItem, 'id'>,
  lots: readonly T[],
): T | undefined {
  return (
    lots.find((lot) => item.id.startsWith(`${lot.id}:`)) ??
    (item.id.startsWith('yard:') ? lots[Number(item.id.split(':')[1])] : undefined)
  );
}

/** Preserve each authored arrangement in its host's enlarged coordinate frame. */
export function placeSettlementDressing<T extends SettlementItem>(
  item: T,
  region: string,
  sourceHost?: DressingHost,
  frame?: DressingFrame,
): T {
  if (/grave|monument/.test(item.id)) return item;
  const scale = frame?.scale ?? ARCHITECTURE_SCALE;
  const size = Array.isArray(item.scale)
    ? item.scale.map((v) => v * scale)
    : (item.scale ?? 1) * scale;
  const [fixtureX, fixtureZ] = settlementFixtureOffset(region, item.id);
  // Close the old ten-centimetre roof seam by moving the COMPLETE stored-wood
  // group into the rear wall; the varied piles stay underneath their shelter.
  const yardInset =
    region === 'icemantle' && item.id.includes(':yard:')
      ? 0.09 * scale
      : // Preserve the whole rear fence line clear of the neighboring weaver's wall.
        region === 'eastbrook' && item.id.includes(':rear:')
        ? (sourceHost?.id === 'market-home' ? 0.35 : sourceHost?.id === 'lane-home' ? 0.3 : 0) *
          scale
        : 0;
  const x = frame && sourceHost ? frame.lot.x + (item.x - sourceHost.x) * scale : item.x;
  const z = frame && sourceHost ? frame.lot.z + (item.z - sourceHost.z) * scale : item.z;
  return {
    ...item,
    x: x + fixtureX + Math.sin(sourceHost?.rot ?? 0) * yardInset,
    z: z + fixtureZ + Math.cos(sourceHost?.rot ?? 0) * yardInset,
    scale: size,
    support: item.support ? scaleCoordinates(item.support, scale) : undefined,
  };
}
