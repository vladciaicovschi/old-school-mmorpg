// Stable presentation identities for the replacement mobs' existing mechanics.
// They annotate existing cues only; cadence, damage and event order stay unchanged.
export type CommunityMobMechanic = 'pulse' | 'stomp' | 'mend' | 'ward' | 'warcry';

const IDS: Readonly<Record<string, Partial<Record<CommunityMobMechanic, string>>>> = {
  mogger: { pulse: 'mogger_ground_pound', ward: 'mogger_bracing_order' },
  wildheart_hexcaller: { mend: 'wildheart_ancestral_sap' },
  wildheart_beastmaster: {
    stomp: 'wildheart_beast_pit_quake',
    ward: 'wildheart_thickhide_ward',
    warcry: 'wildheart_call_of_the_hunt',
  },
  wildheart_high_priest: { pulse: 'wildheart_pulse' },
};

export const COMMUNITY_MOB_ANIMATION_IDS: readonly string[] = Object.values(IDS).flatMap(
  (mechanics) => Object.values(mechanics),
);
const KNOWN_IDS = new Set(COMMUNITY_MOB_ANIMATION_IDS);

export function isCommunityMobAnimationId(id: string | undefined): boolean {
  return id !== undefined && KNOWN_IDS.has(id);
}

export function communityMobAnimationId(
  templateId: string,
  mechanic: CommunityMobMechanic,
): string | undefined {
  // Lab copies keep the production suffix and the same mechanic identity.
  const id = templateId.startsWith('dev_') ? templateId.slice(4) : templateId;
  return IDS[id]?.[mechanic];
}

/** An empty spread deliberately leaves unrelated wire event shapes untouched. */
export function communityMobAnimationCue(templateId: string, mechanic: CommunityMobMechanic) {
  const ability = communityMobAnimationId(templateId, mechanic);
  return ability === undefined ? {} : { ability };
}
