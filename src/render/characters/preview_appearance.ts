import type { PlayerClass } from '../../sim/types';
import type { WeaponLayoutOverride } from './manifest';
import { mechHeldWeaponOverride, VISUALS } from './manifest';

/** A character's real, in-world appearance for the char-select / char-sheet
 *  turntable: body class, appearance skin, whether it is the class rig or the
 *  class-agnostic Combat Mech cosmetic, and the equipped mainhand (null when
 *  unarmed, so the preview shows no weapon rather than a class default). */
export interface PreviewAppearance {
  cls: PlayerClass;
  skin: number;
  skinCatalog: 'class' | 'mech';
  mainhandItemId: string | null;
  /** The active Armory weapon-skin cosmetic, or null/absent for none. */
  weaponSkinId?: string | null;
  /** Optional for older character-summary callers; absent renders no offhand. */
  offhandItemId?: string | null;
  /** The character-select stage is a still portrait, rather than the live
   * paperdoll: it can pick a deliberate resting frame for the equipped kit. */
  presentation?: 'charselect';
}

export interface PreviewPresentationPose {
  clips: readonly string[];
  fraction: number;
}

/** Calm, free-hand roster portrait. Keep the equipment, but use its carried
 * layout instead of an armed idle or a frozen attack frame. */
export function previewPresentationPose(a: PreviewAppearance): PreviewPresentationPose | null {
  if (a.presentation !== 'charselect') return null;
  const c = VISUALS[a.skinCatalog === 'mech' ? 'player_mech' : `player_${a.cls}`].clips;
  return { clips: [c.travel?.idle ?? c.presentationPoses?.[0] ?? c.idle], fraction: 0.1 };
}

/** The model key + held-weapon layout the appearance resolves to. */
export interface PreviewVisual {
  visualKey: string;
  weaponItemId: string | null;
  offhandItemId: string | null;
  weaponOverride: WeaponLayoutOverride | null;
}

/** Resolve an appearance to its concrete visual, mirroring createCharacterVisual
 *  (index.ts): the Mech is a separate body (`player_mech`) that adopts the wearer
 *  class's hand layout (a rogue mech dual-wields), while the class rig uses
 *  `player_<class>` with no override. Kept DOM/Three-free so it is unit-tested. */
export function previewAppearanceVisual(a: PreviewAppearance): PreviewVisual {
  const mech = a.skinCatalog === 'mech';
  return {
    visualKey: mech ? 'player_mech' : `player_${a.cls}`,
    weaponItemId: a.mainhandItemId ?? null,
    offhandItemId: a.offhandItemId ?? null,
    weaponOverride: mech ? mechHeldWeaponOverride(a.cls) : null,
  };
}

/** Stable identity of an appearance, so an async mech re-apply can bail out if a
 *  newer selection superseded it. */
export function appearanceSignature(a: PreviewAppearance): string {
  // weaponSkinId is part of the identity: without it, applying or removing an
  // Armory skin while a preview is mounted elides as "same appearance" and the
  // stale weapon model survives the repaint.
  return `${a.cls}|${a.skin}|${a.skinCatalog}|${a.mainhandItemId ?? ''}|${a.offhandItemId ?? ''}|${a.weaponSkinId ?? ''}|${a.presentation ?? ''}`;
}
