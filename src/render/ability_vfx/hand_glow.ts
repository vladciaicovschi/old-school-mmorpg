import { type Object3D, Vector3 } from 'three';
import {
  type CastHandGlowPlan,
  castHandGlowPlanInto,
  usesHandCastVisual,
} from '../cast_hand_glow_core';
import { castPalmWorldPosition } from '../characters/cast_palms';
import { OVERLAY_CELL } from './fx_textures';
import type { OverlaySprites } from './overlay_sprites';

interface HandGlowView {
  visualKey: string | null;
  visual: { root: Object3D } | null;
}

export type CastHandGlow = (
  entityId: number,
  color: number,
  accent: number,
  progress: number,
  quality: number,
  overlay: Pick<OverlaySprites, 'push'>,
) => boolean;

// Reuses the prewarmed overlay cloud: no scene objects, new materials, lights,
// textures or retained entity IDs. Weak keys expire when visual roots do.
// Player casts and authored caster mobs opt in; missing/hidden rigs keep the fallback.
export function createCastHandGlow(views: ReadonlyMap<number, HandGlowView>): CastHandGlow {
  const left = new Vector3();
  const right = new Vector3();
  const plan: CastHandGlowPlan = { size: 0, coreSize: 0, alpha: 0, coreAlpha: 0 };
  return (entityId, color, _accent, progress, quality, overlay) => {
    const view = views.get(entityId);
    const visual = view?.visual;
    if (!usesHandCastVisual(view?.visualKey) || !visual) return false;
    if (
      !castPalmWorldPosition(visual.root, 'Left', left) ||
      !castPalmWorldPosition(visual.root, 'Right', right)
    )
      return false;
    castHandGlowPlanInto(plan, progress, quality);
    for (let i = 0; i < 2; i++) {
      const point = i === 0 ? left : right;
      overlay.push(point.x, point.y, point.z, color, plan.size, OVERLAY_CELL.glow, plan.alpha, 1.8);
      overlay.push(
        point.x,
        point.y,
        point.z,
        color,
        plan.coreSize,
        OVERLAY_CELL.glow,
        plan.coreAlpha,
        2.2,
      );
    }
    return true;
  };
}

// Compatibility for callers of the original Warlock-only preparation helper.
export const createWarlockHandGlow = createCastHandGlow;
