// One current specimen per appearance. Existing combat pads supply positions
// and kits; gallery identities keep the selected replacement rig and clips.
import {
  createDevModelLabMob,
  DEV_MODEL_LAB_MOB_LINEUP,
  DEV_MODEL_LAB_NPC_LINEUP,
} from './content/dev_model_lab';
import type { ModelComparisonSubject } from './dev_model_comparisons';
import type { MobTemplate } from './types';

export function buildDevModelLabRoster(
  gallery: readonly ModelComparisonSubject[],
): ModelComparisonSubject[] {
  const identity = (subject: ModelComparisonSubject): string =>
    subject.visualKey ?? `npc:${subject.sourceNpcId ?? subject.templateId}`;
  const preferred = new Map<string, ModelComparisonSubject>();
  const priority = { missing: 0, ready: 1, installed: 2 };
  for (const subject of gallery) {
    const current = preferred.get(identity(subject));
    if (!current || priority[subject.status] > priority[current.status]) {
      preferred.set(identity(subject), subject);
    }
  }
  const subjects: ModelComparisonSubject[] = [];
  for (const subject of gallery) {
    // Named modular NPCs share mesh files but retain distinct authored looks.
    if (preferred.get(identity(subject)) !== subject) continue;
    const pad = subject.combatMobId
      ? DEV_MODEL_LAB_MOB_LINEUP.find((entry) => entry.templateId === subject.combatMobId)
      : undefined;
    const npc = DEV_MODEL_LAB_NPC_LINEUP.find((entry) => entry.templateId === subject.sourceNpcId);
    subjects.push({
      ...subject,
      ...(pad ?? npc),
      templateId: subject.templateId,
    });
  }
  return subjects;
}

export function buildDevModelLabCombatTemplates(
  subjects: readonly ModelComparisonSubject[],
  mobs: Readonly<Record<string, MobTemplate>>,
): Record<string, MobTemplate> {
  const templates: Record<string, MobTemplate> = {};
  for (const subject of subjects) {
    if (subject.category === 'npc') continue;
    const source = subject.combatMobId ? mobs[subject.combatMobId] : undefined;
    if (subject.combatMobId && !source) {
      throw new Error(`Missing model laboratory combat kit: ${subject.combatMobId}`);
    }
    const fallback = createDevModelLabMob(
      subject.templateId,
      subject.templateId,
      subject.category === 'animal' ? 'beast' : 'humanoid',
      0xffffff,
    );
    templates[subject.templateId] = {
      ...fallback,
      ...source,
      id: subject.templateId,
      aggroRadius: 0,
      aggroOnDamageOnly: true,
      idleStationary: true,
      hardLeashRadius: 28,
      loot: [],
      summonAdds: undefined,
    };
  }
  return templates;
}
