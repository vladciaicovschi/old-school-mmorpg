// One spawn plan for NPC mannequins, combat-enabled gallery trials and the
// separated mob ring. Gallery combat replaces its mannequin one-for-one.
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_NPC_LINEUP } from './content/dev_model_lab';
import { DEV_MODEL_COMPARISON_GALLERY, MOBS, NPCS } from './data';
import { createMob, createNpc } from './entity';
import type { SimContext } from './sim_context';
import type { Entity } from './types';

interface Subject {
  templateId: string;
  combatMobId?: string;
  x: number;
  z: number;
  facing: number;
}

export function spawnDevModelLabSubjects(ctx: SimContext, owner: Entity): number[] {
  const ids: number[] = [];
  const add = (subject: Subject, combat: boolean): void => {
    const position = ctx.groundPos(subject.x, subject.z);
    let entity: Entity;
    if (combat || subject.combatMobId) {
      const template = MOBS[subject.combatMobId ?? subject.templateId];
      if (!template) return;
      const level = Math.max(
        template.minLevel,
        Math.min(template.maxLevel, Math.floor(owner.level)),
      );
      entity = createMob(ctx.nextId++, template, level, position);
    } else {
      const template = NPCS[subject.templateId];
      if (!template) return;
      entity = createNpc(ctx.nextId++, template, position);
    }
    entity.facing = subject.facing;
    entity.prevFacing = subject.facing;
    entity.devSpawnOwnerId = owner.id;
    ctx.addEntity(entity);
    ids.push(entity.id);
  };
  for (const subject of [...DEV_MODEL_LAB_NPC_LINEUP, ...DEV_MODEL_COMPARISON_GALLERY.subjects]) {
    add(subject, false);
  }
  for (const subject of DEV_MODEL_LAB_MOB_LINEUP) add(subject, true);
  return ids;
}
