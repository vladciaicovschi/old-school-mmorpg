// Shared authoring/runtime identities; existing body clips remain untouched.
export const CASTER_MOB_TARGETS = [
  {
    visualKey: 'npc_dev_skeleton_cultist',
    bodyUrl: 'models/chars/npcs/dev_skeleton_cultist.glb',
    nativeIdle: 'Cultist_Standing_Idle',
    prefix: 'CultistMagic',
  },
  {
    visualKey: 'npc_dev_skeleton_acolyte',
    bodyUrl: 'models/chars/npcs/dev_skeleton_acolyte.glb',
    nativeIdle: 'Acolyte_Standing_Idle',
    prefix: 'AcolyteMagic',
  },
  {
    visualKey: 'npc_dev_skeleton_caster_v3',
    bodyUrl: 'models/chars/npcs/dev_skeleton_caster_v3.glb',
    nativeIdle: 'CasterV3_Idle',
    prefix: 'CasterV3Magic',
  },
  {
    visualKey: 'npc_dev_skeleton_necromancer_v2',
    bodyUrl: 'models/chars/npcs/dev_skeleton_necromancer_v2.glb',
    nativeIdle: 'Necromancer_Standing_Idle',
    prefix: 'NecromancerMagic',
  },
];
export const CASTER_MOB_CAST_FIT = {
  tailSeconds: 0.76,
  tailPlaybackSeconds: 0.3,
  maxPreparationSpeed: 1.35,
};
export function casterMobAnimationUrl(target) {
  return `models/chars/npcs/${target.prefix}_motion.glb`;
}
