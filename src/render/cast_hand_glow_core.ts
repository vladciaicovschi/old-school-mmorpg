import { CASTER_MOB_TARGETS } from '../../scripts/anim/caster_mob_targets.mjs';
import { ALL_CLASSES } from '../sim/types';

const mobVisuals = new Set(CASTER_MOB_TARGETS.map((target) => target.visualKey));
const mobTemplates = new Set(CASTER_MOB_TARGETS.map((target) => target.visualKey.slice(4)));
const playerTemplates = new Set<string>(ALL_CLASSES);
const playerVisuals = new Set(
  ALL_CLASSES.flatMap((cls) => [`player_${cls}`, `player_${cls}_modular`]),
);

export function usesHandCastVisual(visualKey: string | null | undefined): boolean {
  return visualKey != null && (playerVisuals.has(visualKey) || mobVisuals.has(visualKey));
}

export function usesHandCastPreparation(kind?: string, templateId?: string): boolean {
  return (
    (kind === 'player' && templateId != null && playerTemplates.has(templateId)) ||
    (kind === 'mob' && templateId != null && mobTemplates.has(templateId))
  );
}

// Shared, allocation-free envelope for the two-hand preparation glow.
// No release beat: the existing projectile ceremony owns that moment.
export interface CastHandGlowPlan {
  size: number;
  coreSize: number;
  alpha: number;
  coreAlpha: number;
}

export function castHandGlowPlanInto(
  out: CastHandGlowPlan,
  progress: number,
  quality: number,
): void {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const q = Number.isFinite(quality) ? Math.min(1, Math.max(0, quality)) : 0;
  out.size = (0.18 + 0.09 * p) * 1.296 * (0.8 + 0.2 * q);
  out.coreSize = out.size * 0.36;
  out.alpha = 0.32 + 0.23 * p;
  out.coreAlpha = 0.4 + 0.25 * p;
}
