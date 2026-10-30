// Carry profiles are deliberately separate from the legacy hand-only runtime
// adapter. The developer endpoint writes these extra flat keys into the same
// JSON, without changing or hand-editing its generated TypeScript wrapper.

import { HELD_EQUIPMENT_FIT_VISUALS } from '../../../scripts/lib/equipment_fit_payload.mjs';
import type { HeldAttachmentFitTransform } from './held_attachment_fit';
import authored from './held_attachment_fit.generated.json';

export const CARRIED_ATTACHMENT_TARGETS = [
  'mainhand_hip',
  'offhand_hip',
  'mainhand_back',
  'offhand_back',
] as const;
export type CarriedAttachmentTarget = (typeof CARRIED_ATTACHMENT_TARGETS)[number];
export type CarriedAttachmentFit = Partial<
  Record<CarriedAttachmentTarget, HeldAttachmentFitTransform>
>;

const fits = new Map<string, CarriedAttachmentFit>();
function valid(value: unknown): value is HeldAttachmentFitTransform {
  if (!value || typeof value !== 'object') return false;
  const v = value as HeldAttachmentFitTransform;
  return (
    [v.position, v.rotationDeg].every(
      (a, i) =>
        Array.isArray(a) &&
        a.length === 3 &&
        a.every(
          (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= (i === 0 ? 5 : 360),
        ),
    ) &&
    typeof v.scale === 'number' &&
    Number.isFinite(v.scale) &&
    v.scale >= 0.01 &&
    v.scale <= 10
  );
}

export function setRuntimeCarriedAttachmentFit(visualKey: string, state: unknown): void {
  if (!state || typeof state !== 'object') return;
  let target = fits.get(visualKey);
  if (!target) {
    target = {};
    fits.set(visualKey, target);
  }
  const source = state as Record<string, unknown>;
  for (const key of CARRIED_ATTACHMENT_TARGETS) {
    const v = source[key];
    if (valid(v))
      target[key] = { position: [...v.position], rotationDeg: [...v.rotationDeg], scale: v.scale };
  }
}

// Snapshot the authored carry keys before the legacy hand adapter hydrates its
// own JSON object. Each returned profile keeps a stable reference for manifests.
for (const [key, value] of Object.entries(authored)) setRuntimeCarriedAttachmentFit(key, value);

export function carriedAttachmentFitFor(visualKey: string): CarriedAttachmentFit {
  let fit = fits.get(visualKey);
  if (!fit) {
    fit = {};
    fits.set(visualKey, fit);
  }
  return fit;
}

if (typeof localStorage !== 'undefined') {
  for (const visualKey of new Set([...Object.keys(authored), ...HELD_EQUIPMENT_FIT_VISUALS])) {
    try {
      const raw = localStorage.getItem(
        visualKey === 'player_meshy_titan'
          ? 'woc.equipmentCalibration.meshyTitan.v2'
          : `woc.equipmentCalibration.${visualKey}.v2`,
      );
      const draft = raw ? JSON.parse(raw) : null;
      if (draft?.version === 2) setRuntimeCarriedAttachmentFit(visualKey, draft.transforms);
    } catch {
      /* A blocked store or an old draft keeps the authored baseline. */
    }
  }
}
