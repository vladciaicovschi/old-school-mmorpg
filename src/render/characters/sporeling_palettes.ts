// Broad, reversible HSV edits toward the supplied mushroom concept. Source
// atlases, their painted shading, UVs and geometry are retained unchanged.
import type { ArmorDyeSpec } from './armor_dye';

export const SPORELING_PALETTES: Record<'ordinary' | 'infected', ArmorDyeSpec> = {
  ordinary: {
    rules: [
      // Muted red cap becomes warmer rust, without recoloring dark cracks.
      {
        ref: 8,
        band: 25,
        sat: [0.2, 0.3, 0.85, 0.98],
        val: [0.34, 0.46, 1.01, 1.02],
        hueMode: 'abs',
        hue: 16,
        satMul: 1.08,
        satAdd: 0.015,
        valMul: 1.06,
        valAdd: 0,
      },
      // Saturated lime moss becomes olive, retaining individual leaf values.
      {
        ref: 78,
        band: 36,
        sat: [0.22, 0.35, 1.01, 1.02],
        val: [0.08, 0.18, 1.01, 1.02],
        hueMode: 'abs',
        hue: 72,
        satMul: 0.6,
        satAdd: 0,
        valMul: 0.91,
        valAdd: 0,
      },
      // Pale underside/chest stays cream; only its greenish cast is reduced.
      {
        ref: 52,
        band: 32,
        sat: [0.02, 0.08, 0.36, 0.5],
        val: [0.5, 0.62, 1.01, 1.02],
        hueMode: 'abs',
        hue: 39,
        satMul: 0.85,
        satAdd: 0,
        valMul: 1.03,
        valAdd: 0.01,
      },
      // Warm the existing brown limbs a little; do not repaint them flat ivory.
      {
        ref: 24,
        band: 14,
        sat: [0.12, 0.2, 0.32, 0.4],
        val: [0.13, 0.2, 0.43, 0.53],
        hueMode: 'abs',
        hue: 30,
        satMul: 0.9,
        satAdd: 0,
        valMul: 1.18,
        valAdd: 0.008,
      },
    ],
  },
  infected: {
    rules: [
      {
        ref: 14,
        band: 30,
        sat: [0.12, 0.22, 0.85, 0.98],
        val: [0.3, 0.42, 1.01, 1.02],
        hueMode: 'abs',
        hue: 17,
        satMul: 1.15,
        satAdd: 0.04,
        valMul: 1.08,
        valAdd: 0,
      },
      {
        ref: 78,
        band: 36,
        sat: [0.22, 0.35, 1.01, 1.02],
        val: [0.08, 0.18, 1.01, 1.02],
        hueMode: 'abs',
        hue: 70,
        satMul: 0.56,
        satAdd: 0,
        valMul: 0.86,
        valAdd: 0,
      },
      // Dark neutral skin is lifted toward aged mushroom tissue. Black eye
      // sockets stay black, so the infected model retains its decayed face.
      {
        ref: 180,
        band: 360,
        sat: [-0.02, -0.01, 0.18, 0.3],
        val: [0.1, 0.19, 0.58, 0.7],
        hueMode: 'abs',
        hue: 39,
        satMul: 0.35,
        satAdd: 0.15,
        valMul: 1.4,
        valAdd: 0.035,
      },
      {
        ref: 48,
        band: 35,
        sat: [0.02, 0.08, 0.34, 0.48],
        val: [0.55, 0.68, 1.01, 1.02],
        hueMode: 'abs',
        hue: 38,
        satMul: 0.85,
        satAdd: 0,
        valMul: 1.03,
        valAdd: 0,
      },
    ],
  },
};
