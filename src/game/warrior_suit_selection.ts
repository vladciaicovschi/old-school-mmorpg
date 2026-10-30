import { playerArmorVisualKey } from '../render/characters/armor_tier_core';
import { VISUALS } from '../render/characters/manifest';
import { ITEMS } from '../sim/data';
import type { Entity } from '../sim/types';

type Subject = Pick<Entity, 'kind' | 'templateId' | 'equippedItems'>;

export class WarriorSuitSelection {
  ready = false;

  available(entity: Subject): boolean {
    return this.ready && entity.kind === 'player' && entity.templateId === 'warrior';
  }

  visualKey(entity: Subject): string | null {
    if (!this.available(entity)) return null;
    return playerArmorVisualKey(entity.templateId, entity.equippedItems, ITEMS, VISUALS);
  }
}

export const warriorSuitSelection = new WarriorSuitSelection();
