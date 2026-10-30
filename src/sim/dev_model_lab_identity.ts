import { DEV_MODEL_COMPARISONS } from './content/dev_model_comparisons';

const combatSources = new Map(
  DEV_MODEL_COMPARISONS.filter((row) => row.combatMobId).map((row) => [
    `dev_compare_${row.category}_${row.newVisual ? 'new' : 'old'}_${row.id}`,
    row.combatMobId as string,
  ]),
);

/** Recover the authored combat identity for a single-specimen laboratory mob. */
export function devModelLabCombatSource(templateId: string): string {
  return combatSources.get(templateId) ?? templateId;
}
