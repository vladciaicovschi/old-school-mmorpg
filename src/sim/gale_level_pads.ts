// The Galecrest's level ground (terrainHeight above): each pad blends the
// finished height to its center's, wide enough that every tent, tower,
// palisade run, and barn sits flush instead of sinking into a rise.
export function galeLevelPads(
  waterLevel: number,
): { x: number; z: number; r: number; h?: number }[] {
  return [
    { x: 252, z: 250, r: 14 },
    { x: 210, z: 410, r: 14 },
    { x: 354, z: 664, r: 14 },
    // the stable barns' lakeside terrace on the Mirror Tarn's north bank: an
    // explicit height keeps it a low shelf above the beach, the downs rising
    // behind it, instead of a high pad with a sheer rim over the water
    { x: 299, z: 531, r: 12, h: waterLevel + 3.2 },
    // the Old Beacon's lawn: one flat disc under the whole tower and spiral
    // stair, so the stair foot always meets level ground (a sloping lawn left
    // the first tread hovering and broke click-to-move approaches)
    { x: 498, z: 308, r: 11 },
  ];
}
