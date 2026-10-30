export interface CasterMobTarget {
  visualKey: string;
  bodyUrl: string;
  nativeIdle: string;
  prefix: string;
}
export const CASTER_MOB_TARGETS: readonly CasterMobTarget[];
export const CASTER_MOB_CAST_FIT: {
  tailSeconds: number;
  tailPlaybackSeconds: number;
  maxPreparationSpeed: number;
};
export function casterMobAnimationUrl(target: CasterMobTarget): string;
