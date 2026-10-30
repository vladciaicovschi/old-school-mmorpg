// Runtime owner of body-scoped hand fits. Do not add behavior to the generated
// legacy wrapper: authored JSON remains the dev endpoint's output. Stable
// profiles keep manifest references live; lookups also cover newly fitted mobs.
import {
  HELD_EQUIPMENT_FIT_VISUALS,
  validEquipmentFitTransform,
} from '../../../scripts/lib/equipment_fit_payload.mjs';
import type {
  HeldAttachmentFit,
  HeldAttachmentFitTransform,
} from './held_attachment_fit.generated';
import authored from './held_attachment_fit.generated.json';

export type {
  HeldAttachmentFit,
  HeldAttachmentFitTransform,
} from './held_attachment_fit.generated';

const allowed = new Set(HELD_EQUIPMENT_FIT_VISUALS);
const fits: Record<string, HeldAttachmentFit> = Object.create(null);
export const HELD_ATTACHMENT_FITS: Readonly<Record<string, HeldAttachmentFit>> = fits;

export function setRuntimeHeldAttachmentFit(visualKey: string, state: unknown): void {
  if (!allowed.has(visualKey) || !state || typeof state !== 'object') return;
  const source = state as Record<string, unknown>;
  for (const slot of ['mainhand', 'offhand'] as const) {
    if (!validEquipmentFitTransform(source[slot])) continue;
    const value = source[slot] as HeldAttachmentFitTransform;
    let fit = fits[visualKey];
    if (!fit) {
      fit = {};
      fits[visualKey] = fit;
    }
    fit[slot] = {
      position: [...value.position],
      rotationDeg: [...value.rotationDeg],
      scale: value.scale,
    };
  }
}

export function heldAttachmentFitFor(visualKey: string | undefined): HeldAttachmentFit | undefined {
  return visualKey ? fits[visualKey] : undefined;
}

for (const [key, value] of Object.entries(authored)) setRuntimeHeldAttachmentFit(key, value);
// Hydrate the roster, not just keys that already happen to have an authored fit.
for (const key of allowed) {
  try {
    if (typeof localStorage === 'undefined') break;
    const raw = localStorage.getItem(`woc.equipmentCalibration.${key}.v2`);
    const draft = raw ? JSON.parse(raw) : null;
    if (draft?.version === 2) setRuntimeHeldAttachmentFit(key, draft.transforms);
  } catch {
    // Private storage and malformed drafts retain the project-authored baseline.
  }
}
