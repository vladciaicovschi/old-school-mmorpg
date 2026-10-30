// Final developer-island grading, independent of seed or renderer. The caller
// scopes this to the lab and supplies its existing translated coast mask.
export const DEV_MODEL_LAB_FLAT_PAD = {
  xMin: 576,
  xMax: 904,
  zMin: -160,
  zMax: 160,
  skirt: 10,
} as const;

/** Fill the copied small bays only around the testing floor, with a soft coast. */
export function devModelLabPadLandness(x: number, z: number): number {
  const pad = DEV_MODEL_LAB_FLAT_PAD;
  const dx = Math.max(pad.xMin - x, 0, x - pad.xMax);
  const dz = Math.max(pad.zMin - z, 0, z - pad.zMax);
  const t = Math.min(1, Math.hypot(dx, dz) / pad.skirt);
  return 1 - 2 * t * t * (3 - 2 * t);
}

export function devModelLabFlatHeight(
  height: number,
  landness: number,
  waterLevel: number,
): number {
  const t = Math.max(0, Math.min(1, (landness - 0.02) / 0.1));
  const weight = t * t * (3 - 2 * t);
  // A level floor with generous freeboard, blending back into the old beaches.
  return height + (waterLevel + 6 - height) * weight;
}
