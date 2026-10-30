import { GALE_HARBOR_DECKS, galeDeckSurface } from './gale_harbor';
import type { ZonePropsDef } from './types';

/** Small working clusters along the edges; the central aisle and gangways stay clear. */
export const WICKHARBOR_PIER_CARGO: NonNullable<ZonePropsDef['decorProps']> = [
  [0, -5, -1],
  [1, -5, 1],
  [1, 9, 1],
  [2, -6, 1],
  [2, 0, -1],
  [7, -6, 1],
  [7, 9, -1],
].flatMap(([index, along, side], cluster) => {
  const deck = GALE_HARBOR_DECKS[index];
  return [-0.65, 0.65].map((offset, i) => {
    const across = side * (deck.hw - 0.65),
      t = along + offset;
    return {
      key: (cluster + i) % 3 === 0 ? 'barrel' : 'crateWooden',
      x: deck.x + Math.sin(deck.rot) * t + Math.cos(deck.rot) * across,
      z: deck.z + Math.cos(deck.rot) * t - Math.sin(deck.rot) * across,
      rot: deck.rot + ((cluster + i) % 2) * 0.12,
      scale: 0.85,
      r: 0.43,
      h: 1.1,
      standableTop: ((cluster + i) % 3 === 0 ? 0.904 : 0.878) * 0.85 - 0.05,
    };
  });
});

export function wickharborCargoSurface(
  prop: { key: string; x: number; z: number },
  terrain: (x: number, z: number) => number,
  water: number,
): number | undefined {
  if (prop.x < 440 || prop.x > 536 || prop.z < 312 || prop.z > 392) return undefined;
  if (!WICKHARBOR_PIER_CARGO.some((p) => p.key === prop.key && p.x === prop.x && p.z === prop.z))
    return undefined;
  return galeDeckSurface(prop.x, prop.z, terrain, water) - 0.05;
}
