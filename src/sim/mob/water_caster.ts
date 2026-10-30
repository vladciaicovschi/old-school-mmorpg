// Unowned Water Elemental combat, sharing the existing pet bolt/jet payloads.
// Only unowned templates with petRanged.jet opt in. Owned pets keep their AI.
import { isLockedOut, isSilenced, isStunned } from '../combat/cc';
import { MOBS } from '../data';
import { petRangedAttack, startWaterJet } from '../pet/pet_ai';
import type { SimContext } from '../sim_context';
import { CAST_COMPLETE_EPS, DT, dist2d, type Entity, steadyAngleTo } from '../types';

function waterKit(mob: Entity) {
  return mob.ownerId === null ? MOBS[mob.templateId]?.petRanged : undefined;
}

export function cancelMobWaterJet(ctx: SimContext, mob: Entity): void {
  const id = mob.mobWaterJetTargetId;
  if (id === undefined) return;
  const target = ctx.entities.get(id);
  if (target) {
    target.auras = target.auras.filter(
      (a) => a.sourceId !== mob.id || (a.id !== 'water_jet' && a.id !== 'water_jet_slow'),
    );
  }
  ctx.emit({
    type: 'spellfx',
    sourceId: mob.id,
    targetId: id,
    school: 'frost',
    fx: 'bubbleBeam',
    ability: 'water_jet',
    duration: 0,
  });
  mob.mobWaterJetTargetId = undefined;
  if (mob.castingAbility === 'water_jet') {
    mob.castingAbility = null;
    mob.castTargetId = null;
    mob.castRemaining = mob.castTotal = 0;
    mob.channeling = false;
  }
  mob.autoAttack = false;
}

export function resetMobWaterCaster(ctx: SimContext, mob: Entity): void {
  cancelMobWaterJet(ctx, mob);
  if (waterKit(mob)?.jet) mob.petTauntTimer = 0;
}

/** Runs before mob CC/death early-outs so a broken channel loses its damage
 * and beam immediately. No target or source state is persisted or wired. */
export function tickMobWaterJet(ctx: SimContext, mob: Entity): boolean {
  const ranged = waterKit(mob);
  if (ranged?.jet && !mob.dead) mob.petTauntTimer = Math.max(0, mob.petTauntTimer - DT);
  const id = mob.mobWaterJetTargetId;
  if (id === undefined) return false;
  const target = ctx.entities.get(id);
  const hardLeash = MOBS[mob.templateId]?.hardLeashRadius;
  if (
    !ranged?.jet ||
    mob.dead ||
    !mob.inCombat ||
    mob.aiState === 'evade' ||
    mob.castingAbility !== 'water_jet' ||
    !mob.channeling ||
    isStunned(mob) ||
    isSilenced(mob) ||
    isLockedOut(mob, 'frost') ||
    !target ||
    target.dead ||
    mob.aggroTargetId !== id ||
    dist2d(mob.pos, target.pos) > ranged.range ||
    !ctx.hasLineOfSight(mob, target) ||
    (hardLeash !== undefined && dist2d(mob.pos, mob.spawnPos) > hardLeash)
  ) {
    cancelMobWaterJet(ctx, mob);
    return false;
  }
  mob.autoAttack = false;
  mob.facing = steadyAngleTo(mob.pos, target.pos, mob.facing);
  mob.castRemaining = Math.max(0, mob.castRemaining - DT);
  if (mob.castRemaining <= CAST_COMPLETE_EPS) {
    // Natural completion leaves the last aura tick to the shared aura clock.
    mob.mobWaterJetTargetId = undefined;
    mob.castingAbility = null;
    mob.castTargetId = null;
    mob.castRemaining = mob.castTotal = 0;
    mob.channeling = false;
  }
  return true;
}

export function updateMobWaterCaster(
  ctx: SimContext,
  mob: Entity,
  target: Entity,
  chaseSpeed: number,
): boolean {
  const ranged = waterKit(mob);
  if (!ranged?.jet) return false;
  mob.autoAttack = false;
  // The shared target-maintenance pass still runs during a channel. A taunt
  // or threat change cancels its old victim rather than redirecting its ticks.
  if (mob.mobWaterJetTargetId !== undefined) {
    if (mob.mobWaterJetTargetId !== target.id) cancelMobWaterJet(ctx, mob);
    return true;
  }
  mob.swingTimer = Math.max(0, mob.swingTimer - DT);
  mob.facing = steadyAngleTo(mob.pos, target.pos, mob.facing);
  if (dist2d(mob.pos, target.pos) > ranged.range || !ctx.hasLineOfSight(mob, target)) {
    mob.aiState = 'chase';
    if (!ctx.isRooted(mob)) ctx.moveToward(mob, target.pos, chaseSpeed);
    return true;
  }
  mob.aiState = 'attack';
  if (isSilenced(mob) || isLockedOut(mob, ranged.school) || mob.castingAbility) return true;
  if (mob.petTauntTimer <= CAST_COMPLETE_EPS) {
    startWaterJet(ctx, mob, target, ranged.jet);
    mob.mobWaterJetTargetId = target.id;
  } else if (mob.swingTimer <= CAST_COMPLETE_EPS) {
    petRangedAttack(ctx, mob, target, ranged);
    mob.swingTimer = mob.weapon.speed * ctx.swingIntervalMult(mob);
  }
  return true;
}
