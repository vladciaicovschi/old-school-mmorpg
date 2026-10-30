// Proving Shore weapon replacement policy for the Quaternius humanoid rig.
// The global item model map stays unchanged so mainland KayKit characters keep
// their existing weapon set. Unknown categories deliberately fall through.

const QUATERNIUS_WEAPON_REPLACEMENTS: Readonly<Record<string, string>> = Object.freeze({
  sword_a: 'models/weapons/quaternius/sword.glb',
  sword_1handed: 'models/weapons/quaternius/sword.glb',
  dagger: 'models/weapons/quaternius/dagger.glb',
  dagger_a: 'models/weapons/quaternius/dagger.glb',
  hammer_a: 'models/weapons/quaternius/hammer_small.glb',
  axe_a: 'models/weapons/quaternius/axe_small.glb',
  axe_1handed: 'models/weapons/quaternius/axe_small.glb',
  shield_round: 'models/weapons/quaternius/shield_round.glb',
  spear_a: 'models/weapons/quaternius/spear.glb',
});

export const QUATERNIUS_WEAPON_MODEL_URLS: readonly string[] = Object.freeze([
  ...new Set(Object.values(QUATERNIUS_WEAPON_REPLACEMENTS)),
]);

export function quaterniusWeaponModelUrlFor(legacyUrl: string): string {
  const match = /^models\/weapons\/([^/]+)\.glb$/.exec(legacyUrl);
  return match ? (QUATERNIUS_WEAPON_REPLACEMENTS[match[1]] ?? legacyUrl) : legacyUrl;
}
