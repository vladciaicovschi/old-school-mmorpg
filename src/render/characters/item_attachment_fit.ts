// Per-item authoring overlays. Generic body fits remain the fallback, so fitting
// a claymore never changes the starter sword or another weapon model.
import {
  ITEM_EQUIPMENT_FIT_PROFILES,
  itemEquipmentFitKey,
  validEquipmentFitTransform,
  validItemEquipmentFitKey,
} from '../../../scripts/lib/equipment_fit_payload.mjs';
import type { CarriedAttachmentFit } from './carried_attachment_fit';
import type {
  HeldAttachmentFit,
  HeldAttachmentFitTransform,
} from './held_attachment_fit.generated';
import authored from './held_attachment_fit.generated.json';
import { hunterWeaponDefaultFit } from './hunter_weapon_fits';

type ItemAttachmentFit = HeldAttachmentFit & CarriedAttachmentFit;
const fits = new Map<string, ItemAttachmentFit>();
const targets = [
  'mainhand',
  'offhand',
  'mainhand_hip',
  'offhand_hip',
  'mainhand_back',
  'offhand_back',
] as const;

export function setRuntimeItemAttachmentFit(key: string, state: unknown): void {
  if (!validItemEquipmentFitKey(key) || !state || typeof state !== 'object' || Array.isArray(state))
    return;
  if (Object.keys(state).length === 0) {
    fits.delete(key);
    return;
  }
  const next: ItemAttachmentFit = {};
  for (const target of targets) {
    const value = (state as Record<string, unknown>)[target];
    if (!validEquipmentFitTransform(value)) continue;
    const transform = value as HeldAttachmentFitTransform;
    next[target] = {
      position: [...transform.position],
      rotationDeg: [...transform.rotationDeg],
      scale: transform.scale,
    };
  }
  if (Object.keys(next).length) fits.set(key, next);
}

export function itemAttachmentFitFor(
  visualKey: string | undefined,
  modelUrl: string,
): ItemAttachmentFit | undefined {
  return visualKey ? fits.get(itemEquipmentFitKey(visualKey, modelUrl)) : undefined;
}

for (const profile of ITEM_EQUIPMENT_FIT_PROFILES) {
  const key = itemEquipmentFitKey(profile.visualKey, profile.modelUrl);
  setRuntimeItemAttachmentFit(
    key,
    (authored as Record<string, unknown>)[key] ??
      hunterWeaponDefaultFit(profile.visualKey, profile.modelUrl),
  );
  try {
    const raw =
      typeof localStorage === 'undefined'
        ? null
        : localStorage.getItem(`woc.equipmentCalibration.${key}.v2`);
    if (raw) {
      const draft = JSON.parse(raw) as { version?: unknown; transforms?: unknown };
      if (draft.version === 2) setRuntimeItemAttachmentFit(key, draft.transforms);
    }
  } catch {
    // A blocked store or malformed draft keeps the authored item baseline.
  }
}
