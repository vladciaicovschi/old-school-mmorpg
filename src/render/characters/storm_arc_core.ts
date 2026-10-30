// Sample-and-hold jagged discharges with one short branch per connection.
// Geometry and per-vertex flash gain share the same deterministic burst epoch.
export const ARC_SEGMENTS = 9;
export const ARC_MAIN_FLOATS_PER_LINK = ARC_SEGMENTS * 12 * 3;
export const ARC_FLOATS_PER_LINK = ARC_MAIN_FLOATS_PER_LINK * 2;
const hash = (n: number) => {
  const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export function writeStormArcs(
  out: Float32Array,
  endpoints: Float32Array,
  clock: number,
  gains?: Float32Array,
  reducedMotion = false,
): void {
  let at = 0;
  for (let link = 0; link < endpoints.length / 6; link++) {
    const a = link * 6,
      sx = endpoints[a],
      sy = endpoints[a + 1],
      sz = endpoints[a + 2];
    const dx = endpoints[a + 3] - sx,
      dy = endpoints[a + 4] - sy,
      dz = endpoints[a + 5] - sz;
    const length = Math.hypot(dx, dy, dz),
      inv = length > 1e-8 ? 1 / length : 0;
    const nx = dx * inv,
      ny = dy * inv,
      nz = dz * inv;
    let ux = Math.abs(ny) < 0.9 ? -nz : ny,
      uy = Math.abs(ny) < 0.9 ? 0 : -nx,
      uz = Math.abs(ny) < 0.9 ? nx : 0;
    const ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-8) {
      ux = 1;
      uy = 0;
      uz = 0;
    } else {
      ux /= ul;
      uy /= ul;
      uz /= ul;
    }
    const vx = ny * uz - nz * uy,
      vy = nz * ux - nx * uz,
      vz = nx * uy - ny * ux;
    const period = 1.6 + hash(link + 3) * 1.7;
    const cycle = clock + hash(link + 37) * period;
    const epoch = reducedMotion ? 0 : Math.floor(cycle / period),
      phase = cycle % period;
    let gain =
      phase < 0.16
        ? Math.min(1, phase / 0.012) * (1 - phase / 0.16) ** 0.6
        : phase > 0.21 && phase < 0.25
          ? 0.16
          : 0;
    if (reducedMotion) gain = link % 6 === 0 ? 0.65 : 0;
    const seed = link * 17.71 + epoch * 71.37;
    const branchT = 4 / ARC_SEGMENTS,
      envelope = Math.sin(Math.PI * branchT);
    const j1 = (hash(4 * 3.17 + seed) * 2 - 1) * envelope * length * 0.17;
    const j2 = (hash(4 * 9.23 + seed) * 2 - 1) * envelope * length * 0.1;
    const bx = sx + dx * branchT + ux * j1 + vx * j2,
      by = sy + dy * branchT + uy * j1 + vy * j2,
      bz = sz + dz * branchT + uz * j1 + vz * j2;
    const sign = hash(seed + 6) > 0.5 ? 1 : -1;
    for (let path = 0; path < 2; path++) {
      const px = path ? bx : sx,
        py = path ? by : sy,
        pz = path ? bz : sz;
      const qx = path ? dx * 0.18 + (ux * 0.26 * sign + vx * 0.12) * length : dx;
      const qy = path ? dy * 0.18 + (uy * 0.26 * sign + vy * 0.12) * length : dy;
      const qz = path ? dz * 0.18 + (uz * 0.26 * sign + vz * 0.12) * length : dz;
      const width = Math.min(0.0045, length * 0.045) * (path ? 0.55 : 1);
      for (let segment = 0; segment < ARC_SEGMENTS; segment++)
        for (let plane = 0; plane < 2; plane++) {
          const wx = plane ? vx : ux,
            wy = plane ? vy : uy,
            wz = plane ? vz : uz;
          for (let vertex = 0; vertex < 6; vertex++) {
            const end = vertex === 2 || vertex === 4 || vertex === 5,
              side = vertex === 0 || vertex === 3 || vertex === 5 ? -1 : 1;
            const step = segment + (end ? 1 : 0),
              t = step / ARC_SEGMENTS;
            const fade = step === 0 || step === ARC_SEGMENTS ? 0 : Math.sin(Math.PI * t);
            const h1 =
              (hash(step * 3.17 + seed + path * 113) * 2 - 1) *
              fade *
              length *
              (path ? 0.05 : 0.17);
            const h2 =
              (hash(step * 9.23 + seed + path * 59) * 2 - 1) * fade * length * (path ? 0.035 : 0.1);
            if (gains) gains[at / 3] = gain * (path ? 0.6 : 1);
            out[at++] = px + qx * t + ux * h1 + vx * h2 + wx * width * side;
            out[at++] = py + qy * t + uy * h1 + vy * h2 + wy * width * side;
            out[at++] = pz + qz * t + uz * h1 + vz * h2 + wz * width * side;
          }
        }
    }
  }
}
