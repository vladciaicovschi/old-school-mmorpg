import type { ArmorDyeSpec } from './armor_dye';

export type SpiritKind = 'ghost' | 'ice' | 'lily' | 'glimmer' | 'dusk' | 'gale';

// A finite shared palette: all wisps share the same authored mesh and maps.
export const SPIRIT_APPEARANCE = {
  ghost: { color: 0x8ecbff, opacity: 0.72, glow: 0.16, hue: 205, saturation: 0.22 },
  ice: { color: 0x8edfff, opacity: 0.94, glow: 0.4, hue: 195, saturation: 0.3 },
  lily: { color: 0xb3ed89, opacity: 0.94, glow: 0.35, hue: 91, saturation: 0.36 },
  glimmer: { color: 0xffde8f, opacity: 0.94, glow: 0.4, hue: 43, saturation: 0.34 },
  dusk: { color: 0xbb96f1, opacity: 0.94, glow: 0.32, hue: 270, saturation: 0.38 },
  gale: { color: 0x98e9de, opacity: 0.94, glow: 0.35, hue: 168, saturation: 0.24 },
} as const;

export function spiritDye(kind: SpiritKind): ArmorDyeSpec {
  const style = SPIRIT_APPEARANCE[kind];
  return {
    rules: [
      {
        ref: 180,
        band: 360,
        sat: [-0.02, -0.01, 1.01, 1.02],
        val: [-0.02, -0.01, 1.01, 1.02],
        hueMode: 'abs',
        hue: style.hue,
        satMul: 0.12,
        satAdd: style.saturation,
        valMul: 1,
        valAdd: 0,
      },
    ],
  };
}
