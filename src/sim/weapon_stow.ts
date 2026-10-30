// Sheathed-weapon toggle (the Z key): a purely cosmetic per-entity flag that the
// renderer reads to move held weapons onto the back. Server-authoritative like
// `sitting`: it rides the entity wire as a compact flag. Warlock magic stows it
// until Z or a physical swing; other classes retain combat auto-unsheathe.
// Pure leaf module (threat.ts pattern): no rng,
// no SimContext, importable directly by system modules and tests.

import type { Entity } from './types';

/** Toggle the sheathed state. Dead players can't sheathe (mirrors /sit).
 *  Returns the resulting state so callers can pick the matching sound cue. */
export function toggleWeaponStow(e: Entity): boolean {
  if (e.dead) return e.weaponStowed;
  e.weaponStowed = !e.weaponStowed;
  return e.weaponStowed;
}

/** A deliberate combat action draws the weapon again (WoW-style auto-unsheathe). */
export function drawWeapon(e: Entity): void {
  e.weaponStowed = false;
}

/** Called only once an ability has cleared its refusal gates. Free-hand Warlock
 * magic commits the existing persistent/wire bit, not a temporary render latch. */
export function prepareWeaponForAbility(e: Entity, school: string): void {
  if (e.kind === 'player' && e.templateId === 'warlock' && school !== 'physical')
    e.weaponStowed = true;
  else drawWeapon(e);
}
