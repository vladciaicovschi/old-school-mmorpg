import { GALE_HARBOR_DECKS } from './gale_harbor';
import type { ZonePropsDef } from './types';

type VesselPlacement = NonNullable<ZonePropsDef['decorProps']>[number] & {
  scale: number;
  hw: number;
  hd: number;
  r: number;
  h: number;
};

export const WICKHARBOR_SAILSHIP_KEYS = [
  'wickSailingShip',
  'wickSailingShipBlue',
  'wickSailingShipOchre',
  'wickSailingShipRusset',
  'wickKetchBlue',
  'wickKetchOchre',
  'wickBrig',
] as const;

// Measured after the prop extractor turns the bow onto +Z and centers the
// complete asset, including spars. The hull is offset aft inside that frame.
export const WICKHARBOR_SAILSHIP = Object.freeze({
  key: 'wickSailingShip',
  nativeDraft: 1.3799982070922852,
  hullHalfWidth: 2.85,
  hullHalfDepth: 10.8,
  mastHeightAboveWater: 15.55,
  // Camera tops are terrain-relative, unlike floating meshes. This includes
  // the extra clearance between the shipped harbor bed and the float base.
  cameraHeight: 20,
});

type ShipKey = (typeof WICKHARBOR_SAILSHIP_KEYS)[number];
const brigantine = { ...WICKHARBOR_SAILSHIP, rig: 'brigantine' as const };
const ketch = { ...WICKHARBOR_SAILSHIP, hullHalfDepth: 11.9, rig: 'ketch' as const };
const brig = {
  ...WICKHARBOR_SAILSHIP,
  hullHalfDepth: 11.9,
  mastHeightAboveWater: 15.8,
  rig: 'brig' as const,
};
// The complete rig bounds set the prop origin. Shorter after spars shift the
// retained hull relative to that origin, requiring a different conservative box.
export const WICKHARBOR_SHIP_PROFILES = {
  wickSailingShip: { ...brigantine, color: 'linen' },
  wickSailingShipBlue: { ...brigantine, color: 'blue' },
  wickSailingShipOchre: { ...brig, color: 'ochre' },
  wickSailingShipRusset: { ...brigantine, color: 'russet' },
  wickKetchBlue: { ...ketch, color: 'blue' },
  wickKetchOchre: { ...ketch, color: 'ochre' },
  wickBrig: { ...brig, color: 'linen' },
} as const;

export function wickharborShipProfile(key: string) {
  if (!Object.hasOwn(WICKHARBOR_SHIP_PROFILES, key)) throw new Error(`Unknown ship ${key}`);
  return WICKHARBOR_SHIP_PROFILES[key as ShipKey];
}

export const WICKHARBOR_ROWBOAT = Object.freeze({
  key: 'wickRowboat',
  nativeDraft: 0.2018871754,
  hullHalfWidth: 0.9,
  hullHalfDepth: 2.3,
});

function sailingBerth(
  deckIndex: number,
  side: number,
  along: number,
  key: (typeof WICKHARBOR_SAILSHIP_KEYS)[number] = 'wickSailingShip',
): VesselPlacement {
  const deck = GALE_HARBOR_DECKS[deckIndex];
  const scale = 0.9;
  const profile = wickharborShipProfile(key);
  const hw = profile.hullHalfWidth * scale;
  const hd = profile.hullHalfDepth * scale;
  return {
    key,
    x: deck.x + Math.sin(deck.rot) * along + Math.cos(deck.rot) * side * 5.8,
    z: deck.z + Math.cos(deck.rot) * along - Math.sin(deck.rot) * side * 5.8,
    rot: deck.rot,
    scale,
    hw,
    hd,
    r: Math.hypot(hw, hd),
    h: profile.cameraHeight * scale,
    float: profile.nativeDraft * scale,
  };
}

function rowboat(x: number, z: number, rot: number, afloat: boolean): VesselPlacement {
  const scale = 0.9;
  const hw = WICKHARBOR_ROWBOAT.hullHalfWidth * scale;
  const hd = WICKHARBOR_ROWBOAT.hullHalfDepth * scale;
  return {
    key: WICKHARBOR_ROWBOAT.key,
    x,
    z,
    rot,
    scale,
    hw,
    hd,
    r: Math.hypot(hw, hd),
    h: 4,
    ...(afloat ? { float: WICKHARBOR_ROWBOAT.nativeDraft * scale } : {}),
  };
}

const roadstead = {
  ...sailingBerth(2, -1, 6, 'wickSailingShipBlue'),
  x: 493,
  z: 390,
};

// The longer hulls need new berths: four alongside the main piers, one in
// the southern roadstead, and two alongside the Beacon pier. The northern
// berth moves to the outer pier end to keep its stern off the shallow bank.
export const WICKHARBOR_VESSELS: readonly VesselPlacement[] = Object.freeze([
  sailingBerth(0, 1, 18),
  sailingBerth(1, -1, 6, 'wickKetchBlue'),
  sailingBerth(2, 1, 10, 'wickSailingShipOchre'),
  sailingBerth(2, -1, 6, 'wickSailingShipRusset'),
  roadstead,
  sailingBerth(7, 1, 4, 'wickKetchOchre'),
  sailingBerth(7, -1, 4, 'wickBrig'),
  rowboat(474, 354.75, 1.3, true),
  rowboat(479, 357.5, 1.45, true),
  // Haulout beside the existing rack, along the flatter upper shingle.
  rowboat(482, 341.5, 1.6, false),
]);
