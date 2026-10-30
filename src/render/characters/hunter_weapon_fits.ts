import type { HeldAttachmentFit } from './held_attachment_fit.generated';
import { HUNTER_BOW_MODEL, HUNTER_CROSSBOW_MODEL } from './ranged_weapon_core';

// Initial target-specific palm fits, solved from HunterT1_*_Aim at 0.6s.
// The crossbow barrel is model +Y, its horizontal prod is model +Z.
// The bow's +Y limbs stay upright and its string faces back toward the archer.
const defaults: Record<string, HeldAttachmentFit> = {
  [HUNTER_BOW_MODEL]: {
    mainhand: { position: [0, 0.075, 0], rotationDeg: [164.1847, 13.6655, 95.3481], scale: 1.35 },
  },
  [HUNTER_CROSSBOW_MODEL]: {
    mainhand: { position: [0, 0.075, 0], rotationDeg: [-6.0878, -11.5191, 13.0466], scale: 0.5 },
  },
};
export function hunterWeaponDefaultFit(
  visualKey: string,
  modelUrl: string,
): HeldAttachmentFit | undefined {
  return visualKey === 'player_hunter' ? defaults[modelUrl] : undefined;
}
