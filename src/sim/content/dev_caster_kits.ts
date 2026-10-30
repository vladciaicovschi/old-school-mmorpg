// Small, non-boss kits for the imported lab casters. Existing ability IDs name
// and paint the bolts; damage/cadence are NPC template values, never player ranks.
// Donors: Drowned Cantor / Reedbound Acolyte and the basic Fire Demon bolts;
// Gravecaller Cultist curses and Broodsworn Necromancer resource/ward traits.
import type { MobTemplate } from '../types';

type Kit = Pick<MobTemplate, 'petSpell' | 'hex' | 'vulnerability' | 'manaBurn' | 'spellReflect'>;

export const DEV_CASTER_KITS = {
  dev_skeleton_cultist: {
    petSpell: {
      name: 'Gloom Bolt',
      ability: 'shadow_bolt',
      school: 'shadow',
      min: 5,
      max: 8,
      range: 24,
      every: 3.2,
      castTime: 1.7,
    },
    // Half the original curse's output reduction, with a shorter duration.
    hex: { chance: 0.2, reductionPct: 0.1, duration: 6, name: 'Weakening Hex', school: 'shadow' },
  },
  dev_skeleton_acolyte: {
    // Reedbound Acolyte's modest nature damage/range, with a slower cadence.
    petSpell: {
      name: 'Wildbolt',
      ability: 'wrath',
      school: 'nature',
      min: 5,
      max: 8,
      range: 22,
      every: 3.4,
      castTime: 1.7,
    },
    vulnerability: {
      chance: 0.15,
      amp: 0.06,
      duration: 6,
      name: 'Curse of Frailty',
      school: 'nature',
    },
  },
  dev_skeleton_necromancer_v2: {
    petSpell: {
      name: 'Gloom Bolt',
      ability: 'shadow_bolt',
      school: 'shadow',
      min: 5,
      max: 8,
      range: 24,
      every: 3.2,
      castTime: 1.7,
    },
    // Original regular necromancer burns 80 mana; this version burns only 20.
    manaBurn: { chance: 0.2, amount: 20, name: 'Mana Burn', school: 'shadow' },
  },
  dev_skeleton_caster_v3: {
    // Weaker/slower than Fire Demon's 8-11 Ashbolt every two seconds.
    petSpell: {
      name: 'Cinderbolt',
      ability: 'fireball',
      school: 'fire',
      min: 6,
      max: 9,
      range: 24,
      every: 3.6,
      castTime: 1.7,
    },
    // Flat retaliation, not full spell reflection (original regular ward: 9).
    spellReflect: { value: 3, name: 'Elemental Warding', school: 'shadow' },
  },
} satisfies Record<string, Kit>;
