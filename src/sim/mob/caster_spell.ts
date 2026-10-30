// Explicit timed petSpell opt-in. Legacy pets/throwers keep their old runner.
// Uses the existing cast wire fields and ability IDs, so interrupt, animations
// and spell VFX see one authoritative cast on every host. No player resources
// or class talent effects are applied to a hostile mob's template spell.
import { isLockedOut, isRooted, isSilenced, isStunned, tonguesMult } from '../combat/cc';
import { isMobSpellResisted } from '../combat/spell_resist';
import { ABILITIES, MOBS } from '../data';
import { scheduleProjectile } from '../projectile_travel';
import type { SimContext } from '../sim_context';
import {
  CAST_COMPLETE_EPS,
  DT,
  dist2d,
  type Entity,
  type MobTemplate,
  steadyAngleTo,
} from '../types';
import { runCasterHitAffixes } from './caster_hit_affixes';

type Spell = NonNullable<MobTemplate['petSpell']>;
type TimedSpell = Spell & { castTime: number; ability: string };

export function isTimedMobSpell(spell: Spell | undefined): spell is TimedSpell {
  return (
    !!spell &&
    typeof spell.castTime === 'number' &&
    Number.isFinite(spell.castTime) &&
    spell.castTime > 0 &&
    !!spell.ability &&
    !!ABILITIES[spell.ability]
  );
}

function clearCast(mob: Entity): void {
  mob.autoAttack = false;
  mob.castingAbility = null;
  mob.castTotal = 0;
  mob.castRemaining = 0;
  mob.castTargetId = null;
  mob.channeling = false;
}

export function cancelTimedMobSpell(ctx: SimContext, mob: Entity): void {
  const spell = MOBS[mob.templateId]?.petSpell;
  if (!isTimedMobSpell(spell)) return;
  if (mob.castingAbility && mob.castingAbility !== spell.ability) return;
  const wasCasting = !!mob.castingAbility;
  clearCast(mob);
  if (wasCasting) ctx.emit({ type: 'castStop', entityId: mob.id, success: false });
}

export function mobSpellLineBlocked(
  ctx: SimContext,
  mob: Entity,
  target: Entity,
  spell: TimedSpell,
): boolean {
  return ctx.lineOfSightBlocked(mob, target, ABILITIES[spell.ability]);
}

export function updateTimedMobSpell(
  ctx: SimContext,
  mob: Entity,
  target: Entity,
  spell: TimedSpell,
  chaseSpeed: number,
): void {
  mob.autoAttack = false;
  mob.swingTimer = Math.max(0, mob.swingTimer - DT);
  mob.facing = steadyAngleTo(mob.pos, target.pos, mob.facing);
  if (
    mob.dead ||
    target.dead ||
    isStunned(mob) ||
    isSilenced(mob) ||
    isLockedOut(mob, spell.school)
  ) {
    cancelTimedMobSpell(ctx, mob);
    return;
  }
  // A taunt/threat switch must never redirect a partially completed cast.
  if (mob.castingAbility && mob.castTargetId !== target.id) {
    cancelTimedMobSpell(ctx, mob);
    return;
  }
  if (dist2d(mob.pos, target.pos) > spell.range || mobSpellLineBlocked(ctx, mob, target, spell)) {
    cancelTimedMobSpell(ctx, mob);
    mob.aiState = 'chase';
    if (!isRooted(mob)) ctx.moveToward(mob, target.pos, chaseSpeed);
    return;
  }
  mob.aiState = 'attack';
  if (mob.castingAbility === spell.ability) {
    mob.castRemaining = Math.max(0, mob.castRemaining - DT);
    if (mob.castRemaining > CAST_COMPLETE_EPS) return;
    clearCast(mob);
    ctx.emit({ type: 'castStop', entityId: mob.id, success: true });
    ctx.emit({
      type: 'spellfx',
      sourceId: mob.id,
      targetId: target.id,
      school: spell.school,
      fx: 'projectile',
      ability: spell.ability,
    });
    scheduleProjectile(ctx, mob, target, (source, victim) => {
      if (isMobSpellResisted(ctx.rng, source, victim, source.hitBonus)) {
        ctx.emit({
          type: 'damage',
          sourceId: source.id,
          targetId: victim.id,
          amount: 0,
          crit: false,
          school: spell.school,
          ability: spell.ability,
          kind: 'resist',
        });
        ctx.enterCombat(source, victim);
        return;
      }
      const damage = Math.round(
        ctx.rng.range(spell.min + source.level * 0.8, spell.max + source.level * 1.1) *
          (source.rangedDamageMult ?? 1),
      );
      const dealt = ctx.dealDamage(
        source,
        victim,
        Math.max(1, damage),
        false,
        spell.school,
        spell.ability,
        'hit',
      );
      if (dealt > 0) runCasterHitAffixes(ctx, source, victim);
    });
    return;
  }
  // Shared cancelCast clears the active id on an interrupt; never resurrect its
  // old bar or pending release. Only the next complete cadence may start anew.
  clearCast(mob);
  if (mob.swingTimer > CAST_COMPLETE_EPS) return;
  const duration = spell.castTime * tonguesMult(mob);
  mob.castingAbility = spell.ability;
  mob.castTargetId = target.id;
  mob.castTotal = mob.castRemaining = duration;
  mob.swingTimer = Math.max(spell.every, duration);
  ctx.emit({ type: 'castStart', entityId: mob.id, ability: spell.ability, time: duration });
}
