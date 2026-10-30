// Typed runtime view of the JSON written by the in-game Weapon Positioning
// developer panel. Values are final local transforms after the rig adapter.

import fits from './held_attachment_fit.generated.json';

export interface HeldAttachmentFitTransform {
  position: readonly [number, number, number];
  rotationDeg: readonly [number, number, number];
  scale: number;
}

export interface HeldAttachmentFit {
  mainhand?: HeldAttachmentFitTransform;
  offhand?: HeldAttachmentFitTransform;
}

const mutableFits = fits as unknown as Record<string, HeldAttachmentFit>;

function validTransform(value: unknown): value is HeldAttachmentFitTransform {
  if (!value || typeof value !== 'object') return false;
  const fit = value as HeldAttachmentFitTransform;
  return (
    Array.isArray(fit.position) && fit.position.length === 3 &&
    Array.isArray(fit.rotationDeg) && fit.rotationDeg.length === 3 &&
    typeof fit.scale === 'number'
  );
}

/** Apply the local fitting-studio draft to newly assembled world visuals too.
 * The Vite endpoint subsequently writes the same values into the checked-in
 * JSON; this runtime layer prevents a page reload from discarding an edit made
 * in the studio before that endpoint has completed. */
export function setRuntimeHeldAttachmentFit(visualKey: string, state: unknown): void {
  if (!state || typeof state !== 'object') return;
  const source = state as Record<string, unknown>;
  const next: HeldAttachmentFit = {};
  for (const slot of ['mainhand', 'offhand'] as const) {
    if (!validTransform(source[slot])) continue;
    const transform = source[slot];
    next[slot] = {
      position: [...transform.position] as [number, number, number],
      rotationDeg: [...transform.rotationDeg] as [number, number, number],
      scale: transform.scale,
    };
  }
  if (next.mainhand || next.offhand) mutableFits[visualKey] = next;
}

// The editor stores a complete payload per body. Hydrate known body keys when
// the game starts so a saved adjustment affects both its preview and the world.
if (typeof localStorage !== 'undefined') {
  for (const visualKey of Object.keys(mutableFits)) {
    try {
      const raw = localStorage.getItem(`woc.equipmentCalibration.${visualKey}.v2`);
      if (raw) setRuntimeHeldAttachmentFit(visualKey, (JSON.parse(raw) as { transforms?: unknown }).transforms);
    } catch {
      // Private storage or a stale draft simply falls back to the authored fit.
    }
  }
}

export const HELD_ATTACHMENT_FITS = mutableFits as Readonly<Record<string, HeldAttachmentFit>>;
