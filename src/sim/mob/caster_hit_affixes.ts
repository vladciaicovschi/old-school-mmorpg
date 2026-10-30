// The small spell-compatible subset of mob traits. Called only after a timed
// NPC bolt deals real damage; never run the full melee/boss affix cascade here.
import { MOBS } from '../data';
import type { SimContext } from '../sim_context';
import type { Entity } from '../types';

export function runCasterHitAffixes(ctx: SimContext, source: Entity, target: Entity): void {
  if (!source.hostile || source.ownerId !== null || source.dead || target.dead || target.hp <= 0)
    return;
  const template = MOBS[source.templateId];
  if (!template) return;
  const burn = template.manaBurn;
  if (
    burn &&
    target.resourceType === 'mana' &&
    target.resource > 0 &&
    ctx.rng.chance(burn.chance)
  ) {
    target.resource = Math.max(0, target.resource - burn.amount);
    ctx.emit({ type: 'aura', targetId: target.id, name: burn.name, gained: true });
  }
  if (target.kind !== 'player') return;
  const vulnerability = template.vulnerability;
  if (vulnerability && ctx.rng.chance(vulnerability.chance)) {
    ctx.applyAura(target, {
      id: `vulnerability_${source.templateId}`,
      name: vulnerability.name,
      kind: 'vulnerability',
      remaining: vulnerability.duration,
      duration: vulnerability.duration,
      value: vulnerability.amp,
      sourceId: source.id,
      school: vulnerability.school ?? 'shadow',
    });
  }
  const hex = template.hex;
  if (hex && ctx.rng.chance(hex.chance)) {
    ctx.applyAura(target, {
      id: `hex_${source.templateId}`,
      name: hex.name,
      kind: 'hex',
      remaining: hex.duration,
      duration: hex.duration,
      value: hex.reductionPct,
      sourceId: source.id,
      school: hex.school ?? 'shadow',
    });
  }
}
