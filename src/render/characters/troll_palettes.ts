// Trials for the imported Meshy troll's blue-green skin. The broad cool hue
// window covers both olive highlights and teal shadows, excluding warm
// leather, bone, eyes and the pale painted tattoos.
import type { ArmorDyeSpec } from './armor_dye';

function palette(hue: number, saturation: number, value: number, satMul: number): ArmorDyeSpec {
  return {
    rules: [
      {
        ref: 142,
        band: 58,
        sat: [0.035, 0.075, 0.7, 0.85],
        val: [0.08, 0.16, 1.1, 1.2],
        hueMode: 'abs',
        hue,
        satMul,
        satAdd: saturation,
        valMul: value,
        valAdd: 0,
      },
    ],
  };
}

export const TROLL_PALETTES = {
  marsh: palette(108, 0.16, 0.94, 0.75),
  sand: palette(39, 0.27, 1.08, 0.75),
  rift: palette(145, 0.025, 1.14, 0.3),
} satisfies Record<string, ArmorDyeSpec>;
