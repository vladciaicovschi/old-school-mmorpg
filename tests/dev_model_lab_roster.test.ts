import { describe, expect, it } from 'vitest';
import { communityMobAnimationId } from '../src/sim/community_mob_animation_ids';
import { DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';
import type { ModelComparisonSubject } from '../src/sim/dev_model_comparisons';
import {
  buildDevModelLabCombatTemplates,
  buildDevModelLabRoster,
} from '../src/sim/dev_model_lab_roster';
import { combatProfileForMob } from '../src/sim/mob_combat';

function subject(id: string, extra: Partial<ModelComparisonSubject> = {}): ModelComparisonSubject {
  return {
    templateId: id,
    visualKey: 'shared',
    category: 'animal',
    side: 'old',
    status: 'missing',
    pairId: id,
    x: 600,
    z: 100,
    facing: 0,
    ...extra,
  };
}

describe('model laboratory roster', () => {
  it('retains authored combat animation cues and reach on gallery identities', () => {
    expect(communityMobAnimationId('dev_compare_mob_new_mogger', 'pulse')).toBe(
      'mogger_ground_pound',
    );
    expect(communityMobAnimationId('dev_compare_mob_new_mob_wildheart_beastmaster', 'warcry')).toBe(
      'wildheart_call_of_the_hunt',
    );
    expect(combatProfileForMob('dev_compare_mob_new_mob_wildheart_beastmaster', 1)).toEqual(
      combatProfileForMob('dev_wildheart_beastmaster', 1),
    );
  });
  it('prefers the installed specimen over ready and missing aliases regardless of row order', () => {
    const old = subject('old');
    const ready = subject('ready', { side: 'new', status: 'ready' });
    const installed = subject('installed', { side: 'new', status: 'installed' });
    for (const rows of [
      [old, ready, installed],
      [installed, ready, old],
    ]) {
      expect(buildDevModelLabRoster(rows).map((entry) => entry.templateId)).toEqual(['installed']);
    }
  });

  it('retains one missing original, distinct palettes and distinct named NPC appearances', () => {
    const rows = [
      subject('old'),
      subject('duplicate'),
      subject('palette', { visualKey: 'palette' }),
      subject('cook', { category: 'npc', visualKey: undefined, sourceNpcId: 'cook' }),
      subject('smith', { category: 'npc', visualKey: undefined, sourceNpcId: 'smith' }),
    ];
    expect(buildDevModelLabRoster(rows).map((entry) => entry.templateId)).toEqual([
      'old',
      'palette',
      'cook',
      'smith',
    ]);
  });

  it('copies combat traits without mutating the donor or retaining loot and summons', () => {
    const source = {
      ...DEV_MODEL_LAB_MOBS.dev_smart_imp,
      aggroRadius: 20,
      loot: [{ itemId: 'coin', chance: 1 }],
    };
    const rows = [subject('trial', { combatMobId: source.id })];
    const templates = buildDevModelLabCombatTemplates(rows, { [source.id]: source });
    expect(templates.trial.petSpell).toEqual(source.petSpell);
    expect(templates.trial).toMatchObject({
      id: 'trial',
      aggroRadius: 0,
      aggroOnDamageOnly: true,
      idleStationary: true,
      hardLeashRadius: 28,
      loot: [],
    });
    expect(templates.trial.summonAdds).toBeUndefined();
    expect(source.aggroRadius).toBe(20);
    expect(source.loot).toHaveLength(1);
    expect(rows[0].templateId).toBe('trial');
  });

  it('fails visibly for a missing explicit combat kit instead of dropping the specimen', () => {
    expect(() =>
      buildDevModelLabCombatTemplates([subject('trial', { combatMobId: 'missing-kit' })], {}),
    ).toThrow('Missing model laboratory combat kit: missing-kit');
  });
});
