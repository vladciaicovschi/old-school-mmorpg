import { ITEMS } from '../../sim/data';
import { isShieldItem, weaponHand } from '../../sim/equipment_rules';
import { rangedWeaponHandling } from './ranged_weapon_core';
import { isDrawnShotCast } from './skin_attack';

export type WeaponMotionStyle =
  | 'unarmed'
  | 'onehand'
  | 'shield'
  | 'twohand'
  | 'dualwield'
  | 'bow'
  | 'crossbow';

export interface WeaponMotionSet {
  idle: string;
  walk: string;
  walkBack?: string;
  run: string;
  jump: string;
  attack: string[];
  /** Optional visual-only probabilities, aligned with attack. */
  attackWeights?: readonly number[];
  cast?: string;
  castForDrawnShot?: boolean;
  hit?: string[];
  attackByAbility?: Record<string, string>;
}

export type WeaponMotionProfiles = Partial<Record<WeaponMotionStyle, WeaponMotionSet>>;

/** Carry-dependent standing pose only. Never overrides casts or locomotion. */
export function drawnIdleClip(
  clip: string | undefined,
  state: string,
  stowed: boolean,
): string | undefined {
  return !stowed && (state === 'idle' || state === 'combatIdle') ? clip : undefined;
}

/** Select a cosmetic swing without consuming the simulation's combat RNG.
 * Unweighted (or malformed) profiles preserve the existing round-robin order. */
export function weaponMotionAttackIndex(
  count: number,
  weights: readonly number[] | undefined,
  roll: number,
  sequence: number,
): number {
  if (count <= 0) return 0;
  const fallback = sequence % count;
  if (weights?.length !== count || !Number.isFinite(roll)) return fallback;
  let total = 0;
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) return fallback;
    total += weight;
  }
  if (!(total > 0) || !Number.isFinite(total)) return fallback;
  const point = Math.max(0, Math.min(1 - Number.EPSILON, roll)) * total;
  let boundary = 0;
  for (let index = 0; index < count; index++) {
    boundary += weights[index];
    if (point < boundary) return index;
  }
  return count - 1;
}

/** Return only states a loadout owns; water, sitting and death keep their lane. */
export function weaponMotionBaseClip(
  motion: WeaponMotionSet | undefined,
  state: string,
  castingAbility: string | null = null,
): string | undefined {
  if (!motion) return undefined;
  if (state === 'idle' || state === 'combatIdle') return motion.idle;
  if (state === 'walkBack') return motion.walkBack ?? motion.walk;
  if (state === 'walk') return motion.walk;
  if (state === 'fall' || state === 'jump') return motion.jump;
  if (state === 'spin') return motion.attack[0];
  if (state === 'run') return motion.run;
  if (state === 'cast')
    return !motion.castForDrawnShot || isDrawnShotCast(castingAbility) ? motion.cast : undefined;
  return undefined;
}

/** Actual equipment owns the pose; a weapon skin never changes the loadout.
 * A stale shield during a two-hand equip must not select the shield stance.
 * Two real weapons remain dual-wield, including a legal Titan Grip pair. */
export function weaponMotionStyle(
  mainhandItemId: string | null,
  offhandItemId: string | null,
): WeaponMotionStyle {
  const mainhand = mainhandItemId ? ITEMS[mainhandItemId] : undefined;
  if (mainhand?.kind !== 'weapon') return 'unarmed';
  const offhand = offhandItemId ? ITEMS[offhandItemId] : undefined;
  if (offhand?.kind === 'weapon') return 'dualwield';
  if (weaponHand(mainhand) === 'twohand') return 'twohand';
  if (isShieldItem(offhand)) return 'shield';
  return 'onehand';
}

export function weaponMotionFor(
  profiles: WeaponMotionProfiles | undefined,
  mainhandItemId: string | null,
  offhandItemId: string | null,
  weaponSkinId: string | null = null,
): WeaponMotionSet | undefined {
  if (profiles?.bow || profiles?.crossbow) {
    return profiles[rangedWeaponHandling(mainhandItemId, weaponSkinId)];
  }
  const style = weaponMotionStyle(mainhandItemId, offhandItemId);
  // An explicit dual-wield profile wins. One-hand motion is a documented
  // fallback when the imported pack has no dedicated dual-wield choreography.
  return profiles?.[style] ?? (style === 'dualwield' ? profiles?.onehand : undefined);
}

/** Shared action registration and asset validation must see every profile. */
export function weaponMotionClipNames(profiles: WeaponMotionProfiles | undefined): string[] {
  const names = new Set<string>();
  for (const motion of Object.values(profiles ?? {})) {
    for (const name of [
      motion.idle,
      motion.walk,
      motion.walkBack,
      motion.run,
      motion.jump,
      ...motion.attack,
      motion.cast,
      ...(motion.hit ?? []),
      ...Object.values(motion.attackByAbility ?? {}),
    ]) {
      if (name) names.add(name);
    }
  }
  return [...names];
}
