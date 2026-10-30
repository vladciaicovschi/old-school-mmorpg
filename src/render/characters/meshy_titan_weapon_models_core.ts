// Proving Shore weapon replacement policy for the Meshy Titan body.  The
// mapping is rig-scoped in assets.ts, so every other character keeps the model
// selected by its item or cosmetic.

import { MESHY_TITAN_EQUIPMENT_FIT } from './meshy_titan_equipment_fit.generated';

const MESHY_TITAN_WEAPON_REPLACEMENTS: Readonly<Record<string, string>> = Object.freeze({
  sword_a: 'models/weapons/meshy/knights_valor_sword.glb',
  sword_1handed: 'models/weapons/meshy/knights_valor_sword.glb',
  shield_round: 'models/weapons/meshy/knights_valor_shield.glb',
});

/** The finalized Titan bake applies the Mixamo armature's 0.01 FBX transform
 * and converts animation translations to metres. Held props are metre-native
 * too, so the hand adapter must not introduce another unit conversion. */
export const MESHY_TITAN_ATTACHMENT_UNIT_SCALE = 1;

/** Palm centre measured from the Titan's Mixamo hand origin: midway between
 * the animated index/thumb roots, with no inherited Quaternius depth offset. */
export const MESHY_TITAN_HANDSLOT_POSITION = [0, 0.075, 0] as const;

export interface MeshyTitanHeldModelCorrection {
  /** Multiplies both the authored grip offset and the model scale. */
  scale: number;
  /** Local-space correction composed after the model's normal grip. */
  quaternion: readonly [number, number, number, number];
  /** Native-model-space translation, applied after rotation and scale. */
  modelOffset?: readonly [number, number, number];
}

export interface MeshyTitanHeldFinalTransform {
  /** Final transform in the hand bone's local space, after every adapter. */
  position: readonly [number, number, number];
  rotationDeg: readonly [number, number, number];
  scale: number;
}

// Knight's Valor was generated at a larger scale than the game's authored
// starter equipment. Its local +Y axis also points from the grip toward the
// blade/shield top in the opposite direction expected by the Mixamo hand
// adapter. Keep these corrections rig-scoped so other characters and items do
// not inherit the Titan test body's calibration.
const MESHY_TITAN_HELD_MODEL_CORRECTIONS: Readonly<Record<string, MeshyTitanHeldModelCorrection>> =
  Object.freeze({
    knights_valor_sword: Object.freeze({
      scale: 0.58,
      quaternion: [0, 0, 1, 0] as const,
      // Move the generated sword along its grip axis so the Titan's unusually
      // broad palm closes around the handle instead of overlapping the guard.
      modelOffset: [0, 0.65, 0] as const,
    }),
    knights_valor_shield: Object.freeze({
      scale: 0.52,
      // 180 degrees around local Z keeps the point down; the additional
      // +135-degree local-Y turn compensates the Mixamo left-palm axes so the
      // shield face, rather than its rim, points toward the character's front.
      quaternion: [-0.9238795325, 0, 0.3826834324, 0] as const,
      // Seat the generated rear plane ahead of the closed fist. Without this
      // clearance the palm protrudes through the decorated outer face.
      modelOffset: [0, 0, 0.27] as const,
    }),
  });

// Accepted in-client fitting pass. These values intentionally replace the
// assembled payload transform after the Mixamo hand adapter instead of being
// reverse-solved into modelOffset, so the numbers copied by the editor remain
// the single source of truth.
const MESHY_TITAN_HELD_FINAL_TRANSFORMS: Readonly<Record<string, MeshyTitanHeldFinalTransform>> =
  Object.freeze({
    knights_valor_sword: MESHY_TITAN_EQUIPMENT_FIT.mainhand,
    knights_valor_shield: MESHY_TITAN_EQUIPMENT_FIT.offhand,
  });

export const MESHY_TITAN_WEAPON_MODEL_URLS: readonly string[] = Object.freeze([
  ...new Set(Object.values(MESHY_TITAN_WEAPON_REPLACEMENTS)),
]);

export function meshyTitanWeaponModelUrlFor(legacyUrl: string): string {
  const match = /^models\/weapons\/([^/]+)\.glb$/.exec(legacyUrl);
  return match ? (MESHY_TITAN_WEAPON_REPLACEMENTS[match[1]] ?? legacyUrl) : legacyUrl;
}

export function meshyTitanHeldModelCorrectionFor(
  url: string,
): MeshyTitanHeldModelCorrection | null {
  const basename = url.slice(url.lastIndexOf('/') + 1).replace(/\.glb$/, '');
  return MESHY_TITAN_HELD_MODEL_CORRECTIONS[basename] ?? null;
}

export function meshyTitanHeldFinalTransformFor(url: string): MeshyTitanHeldFinalTransform | null {
  const basename = url.slice(url.lastIndexOf('/') + 1).replace(/\.glb$/, '');
  return MESHY_TITAN_HELD_FINAL_TRANSFORMS[basename] ?? null;
}
