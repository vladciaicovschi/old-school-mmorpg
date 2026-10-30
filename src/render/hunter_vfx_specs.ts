// Class-owned projectile presentation. Generated gallery tables stay intact.
import type { AbilityVfxFullSpec, AbilityVfxSpec } from './ability_vfx_core';
import { ABILITY_VFX_FULL_SPECS } from './ability_vfx_full_specs';

export const MEASURED_SHOT_VFX_SPEC: AbilityVfxSpec = {
  c: '#dfe6ee',
  p: 'physical',
  pw: 0.8,
  sp: 6,
  b: { v: 40, h: 0.5 },
  a: 'bolt',
};

export const HUNTER_ARROW_VFX_FULL_SPECS: Readonly<Record<string, AbilityVfxFullSpec>> =
  Object.fromEntries(
    [
      'arcane_shot',
      'concussive_shot',
      'aimed_shot',
      'measured_shot',
      'serpent_sting',
      'counter_shot',
      'multi_shot',
      'startle_shot',
    ].map((id) => {
      const source = ABILITY_VFX_FULL_SPECS[id === 'measured_shot' ? 'concussive_shot' : id];
      return [
        id,
        {
          ...source,
          bolt: { ...source.bolt, style: 'arrow', coils: false, jagged: false, forkEvery: 0 },
        } satisfies AbilityVfxFullSpec,
      ];
    }),
  );
