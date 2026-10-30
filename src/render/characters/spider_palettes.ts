// Lab-only trials on the supplied spider atlas. Most shell texels are dark,
// low-saturation grey; the eyes and fissures occupy a saturated violet band.
// Select them independently rather than multiplying the entire texture.
import type { ArmorDyeSpec } from './armor_dye';

function palette(
  shellHue: number,
  shellSat: number,
  shellValue: number,
  shellLift: number,
  accentHue: number,
): ArmorDyeSpec {
  return {
    rules: [
      {
        ref: 180,
        band: 260,
        sat: [-0.02, -0.01, 0.3, 0.5],
        val: [0, 0.035, 0.7, 0.95],
        hueMode: 'abs',
        hue: shellHue,
        satMul: 0.25,
        satAdd: shellSat,
        valMul: shellValue,
        valAdd: shellLift,
      },
      {
        ref: 285,
        band: 52,
        sat: [0.28, 0.5, 1.1, 1.2],
        val: [0.04, 0.1, 1.1, 1.2],
        hueMode: 'abs',
        hue: accentHue,
        satMul: 0.85,
        satAdd: 0.12,
        valMul: 1.08,
        valAdd: 0.015,
      },
    ],
  };
}

export const SPIDER_VARIANTS = {
  forest: { scale: 0.9, dye: palette(92, 0.3, 1.45, 0.025, 46) },
  marsh: { scale: 1.05, dye: palette(150, 0.26, 1.18, 0.015, 112) },
  sand: { scale: 0.8, dye: palette(34, 0.38, 2.0, 0.045, 22) },
  frost: { scale: 1.1, dye: palette(204, 0.11, 2.45, 0.12, 187) },
  broodmother: { scale: 1.3, dye: palette(8, 0.35, 1.12, 0.018, 0) },
} satisfies Record<string, { scale: number; dye: ArmorDyeSpec }>;
