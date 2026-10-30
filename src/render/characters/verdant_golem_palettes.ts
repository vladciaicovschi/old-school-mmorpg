// Select neutral stone and saturated green fissures separately, preserving
// painted light, shadow and original material maps on the shared body.
import type { ArmorDyeSpec } from './armor_dye';

function stone(hue: number, saturation: number, value: number): ArmorDyeSpec['rules'][number] {
  return {
    ref: 180,
    band: 360,
    sat: [-0.02, -0.01, 0.2, 0.38],
    val: [0.08, 0.16, 1.01, 1.02],
    hueMode: 'abs',
    hue,
    satMul: 0.8,
    satAdd: saturation,
    valMul: value,
    valAdd: 0,
  };
}
function veins(hue: number, saturation: number): ArmorDyeSpec['rules'][number] {
  return {
    ref: 85,
    band: 38,
    sat: [0.2, 0.35, 1.01, 1.02],
    val: [0.12, 0.22, 1.01, 1.02],
    hueMode: 'abs',
    hue,
    satMul: saturation,
    satAdd: 0,
    valMul: 1,
    valAdd: 0,
  };
}
export const VERDANT_GOLEM_PALETTES = {
  guardian: { rules: [stone(205, 0.08, 0.96), veins(112, 0.85)] },
  warden: { rules: [stone(32, 0.13, 0.9), veins(37, 1)] },
} satisfies Record<string, ArmorDyeSpec>;
