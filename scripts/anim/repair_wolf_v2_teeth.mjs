// Separate the owner's fused canine stalks before rebinding the native wolf.
// All bounds are in the original glTF source coordinates. Body faces stay intact.
import sharp from 'sharp';

const LEVEL = 0.985;
const GAP = 0.003;
const PATCHES = [
  [0.33, 0.38],
  [0.415, 0.46],
];
const upperSeeds = [16702, 17206, 17540, 17387, 18602, 19086, 17748];

export async function repairWolfV2Teeth(root) {
  const mesh = root.listMeshes()[0],
    p = mesh.listPrimitives()[0];
  if (mesh.getExtras().wolf_v2_teeth_revision === 1) return { alreadyRepaired: true };
  if (p.getIndices().getCount() !== 312252) throw new Error('Expected original wolf V2 teeth');
  const semantics = p.listSemantics(),
    attributes = Object.fromEntries(semantics.map((s) => [s, p.getAttribute(s)]));
  const rows = Array.from({ length: attributes.POSITION.getCount() }, (_, i) =>
    Object.fromEntries(semantics.map((s) => [s, attributes[s].getElement(i, [])])),
  );
  const originalCount = rows.length,
    indices = Array.from(p.getIndices().getArray());
  const { data, info } = await sharp(p.getMaterial().getBaseColorTexture().getImage())
    .raw()
    .toBuffer({ resolveWithObject: true });
  const parent = Int32Array.from(rows, (_, i) => i),
    enabled = rows.map((row) => {
      const [, y, z] = row.POSITION,
        [u, v] = row.TEXCOORD_0;
      const offset =
        (Math.min(info.height - 1, Math.floor(v * info.height)) * info.width +
          Math.min(info.width - 1, Math.floor(u * info.width))) *
        info.channels;
      const [r, g, b] = data.subarray(offset, offset + 3);
      return (
        y > 0.9 &&
        y < 1.08 &&
        z > 0.98 &&
        z < 1.24 &&
        r > 155 &&
        g > 145 &&
        b > 115 &&
        Math.max(r, g, b) - Math.min(r, g, b) < 85
      );
    });
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (a, b) => {
    parent[find(a)] = find(b);
  };
  const exact = new Map();
  for (let i = 0; i < rows.length; i++)
    if (enabled[i]) {
      const key = rows[i].POSITION.map((x) => x.toFixed(8)).join(',');
      if (exact.has(key)) join(i, exact.get(key));
      else exact.set(key, i);
    }
  for (let i = 0; i < indices.length; i += 3) {
    const corners = indices.slice(i, i + 3).filter((id) => enabled[id]);
    for (let k = 1; k < corners.length; k++) join(corners[0], corners[k]);
  }
  const upperGroups = new Set(upperSeeds.filter((i) => enabled[i]).map(find));
  const fusedGroups = new Set([16702, 17206].filter((i) => enabled[i]).map(find));
  const joints = root.listSkins()[0].listJoints();
  const skull = joints.findIndex((b) => b.getName() === 'Bone_025'),
    jaw = joints.findIndex((b) => b.getName() === 'Bone_042');
  const rigid = (row, upper) => {
    row.JOINTS_0 = [upper ? skull : jaw, 0, 0, 0];
    row.WEIGHTS_0 = [1, 0, 0, 0];
  };
  let dentalVertices = 0;
  for (let i = 0; i < originalCount; i++)
    if (enabled[i] && upperGroups.has(find(i))) {
      rigid(rows[i], !fusedGroups.has(find(i)) || rows[i].POSITION[1] >= LEVEL);
      dentalVertices++;
    }
  // The canine shadow is brown in the texture. Include its full hard surface,
  // not just bright enamel pixels. These narrow stalk bounds exclude the
  // separate posterior lower teeth and the central lower incisors.
  for (let i = 0; i < originalCount; i++) {
    const [x, y, z] = rows[i].POSITION;
    if (
      PATCHES.some(([lo, hi]) => x > lo && x < hi) &&
      z > 1.065 &&
      z < 1.17 &&
      y > 0.965 &&
      y < 1.04
    )
      rigid(rows[i], y >= LEVEL);
  }
  const newIndices = [],
    cutEdges = [[], []];
  const interpolate = (a, b, t, upper) => {
    const row = Object.fromEntries(
      semantics.map((s) => [s, rows[a][s].map((v, k) => v + (rows[b][s][k] - v) * t)]),
    );
    rigid(row, upper);
    rows.push(row);
    return rows.length - 1;
  };
  const clip = (ids, upper) => {
    const out = [],
      intersections = [],
      plane = LEVEL + (upper ? GAP / 2 : -GAP / 2),
      sign = upper ? 1 : -1;
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i],
        b = ids[(i + 1) % ids.length],
        da = rows[a].POSITION[1] - plane,
        db = rows[b].POSITION[1] - plane;
      if (sign * da >= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const id = interpolate(a, b, da / (da - db), upper);
        out.push(id);
        intersections.push(id);
      }
    }
    if (intersections.length === 2) cutEdges[upper ? 0 : 1].push(intersections);
    return out;
  };
  let cutTriangles = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const ids = indices.slice(i, i + 3),
      points = ids.map((id) => rows[id].POSITION);
    const min = (axis) => Math.min(...points.map((v) => v[axis])),
      max = (axis) => Math.max(...points.map((v) => v[axis]));
    const probeY = Math.max(min(1), Math.min(max(1), LEVEL)),
      crossings = [];
    for (let k = 0; k < 3; k++) {
      const a = points[k],
        b = points[(k + 1) % 3];
      if ((a[1] <= probeY && b[1] >= probeY) || (a[1] >= probeY && b[1] <= probeY)) {
        const t = Math.abs(b[1] - a[1]) < 1e-12 ? 0 : (probeY - a[1]) / (b[1] - a[1]);
        crossings.push(a.map((v, i) => v + (b[i] - v) * t));
      }
    }
    const center = crossings.length
      ? crossings[0].map((_, k) => crossings.reduce((s, p) => s + p[k], 0) / crossings.length)
      : points[0];
    const inPatch =
      PATCHES.some(([lo, hi]) => center[0] > lo && center[0] < hi) &&
      center[2] > 1.065 &&
      center[2] < 1.135;
    if (!inPatch || min(1) > LEVEL + GAP / 2 || max(1) < LEVEL - GAP / 2) {
      newIndices.push(...ids);
      continue;
    }
    cutTriangles++;
    for (const upper of [true, false]) {
      const polygon = clip(ids, upper);
      for (let k = 1; k + 1 < polygon.length; k++)
        newIndices.push(polygon[0], polygon[k], polygon[k + 1]);
    }
  }
  let capLoops = 0;
  const tips = [];
  for (const [side, edges] of cutEdges.entries()) {
    const positions = new Map(),
      neighbors = new Map();
    const key = (id) => rows[id].POSITION.map((v) => v.toFixed(6)).join(',');
    for (const [a, b] of edges) {
      const ka = key(a),
        kb = key(b);
      positions.set(ka, a);
      positions.set(kb, b);
      if (!neighbors.has(ka)) neighbors.set(ka, new Set());
      if (!neighbors.has(kb)) neighbors.set(kb, new Set());
      neighbors.get(ka).add(kb);
      neighbors.get(kb).add(ka);
    }
    const unseen = new Set(neighbors.keys());
    while (unseen.size) {
      const start = unseen.values().next().value,
        loop = [];
      let current = start,
        previous;
      do {
        if (!unseen.has(current) && current !== start) throw new Error('Open dental cap boundary');
        loop.push(positions.get(current));
        unseen.delete(current);
        const next = [...neighbors.get(current)].find((n) => n !== previous);
        previous = current;
        current = next;
      } while (current && current !== start && loop.length < 100);
      if (current !== start || loop.length < 3)
        throw new Error(
          `Incomplete dental cap boundary: cut ${cutTriangles}, ${start}, ${current}, ${loop.length}`,
        );
      const center = [0, 0, 0];
      for (const id of loop)
        for (let k = 0; k < 3; k++) center[k] += rows[id].POSITION[k] / loop.length;
      tips.push({ center, upper: side === 0 });
      const capRow = (position) => {
        const row = structuredClone(rows[loop[0]]);
        row.POSITION = position;
        row.NORMAL = [0, side === 0 ? -1 : 1, 0];
        row.TEXCOORD_0 = [0.2149, 0.7372];
        if (row.TANGENT) row.TANGENT = [1, 0, 0, 1];
        rigid(row, side === 0);
        rows.push(row);
        return rows.length - 1;
      };
      const middle = capRow(center),
        ring = loop.map((id) => capRow([...rows[id].POSITION]));
      for (let i = 0; i < ring.length; i++) {
        let a = ring[i],
          b = ring[(i + 1) % ring.length];
        const pa = rows[a].POSITION,
          pb = rows[b].POSITION;
        const normalY =
          (pa[2] - center[2]) * (pb[0] - center[0]) - (pa[0] - center[0]) * (pb[2] - center[2]);
        if (normalY * (side === 0 ? -1 : 1) < 0) [a, b] = [b, a];
        newIndices.push(middle, a, b);
      }
      capLoops++;
    }
  }
  if (cutTriangles < 30 || capLoops !== 4)
    throw new Error(`Unexpected dental split: ${cutTriangles} triangles, ${capLoops} caps`);
  // The fused stalks have no original tooth tips. Taper the last millimeters
  // into each tiny cap, so splitting does not leave four flat-ended bars.
  const moved = new Set();
  for (const { center, upper } of tips)
    for (let i = 0; i < rows.length; i++) {
      const point = rows[i].POSITION,
        depth = (point[1] - center[1]) * (upper ? 1 : -1);
      if (
        depth < -0.000001 ||
        depth > 0.012 ||
        Math.abs(point[0] - center[0]) > 0.025 ||
        Math.abs(point[2] - center[2]) > 0.045
      )
        continue;
      const t = Math.max(0, Math.min(1, depth / 0.012)),
        ease = t * t * t * (10 + t * (-15 + 6 * t)),
        scale = 0.06 + 0.94 * ease;
      for (const k of [0, 2]) point[k] = center[k] + (point[k] - center[k]) * scale;
      moved.add(i);
    }
  const normalSums = new Map([...moved].map((i) => [i, [0, 0, 0]]));
  for (let i = 0; i < newIndices.length; i += 3) {
    const ids = newIndices.slice(i, i + 3),
      [a, b, c] = ids.map((id) => rows[id].POSITION);
    const u = b.map((v, k) => v - a[k]),
      v = c.map((x, k) => x - a[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const id of ids)
      if (normalSums.has(id)) for (let k = 0; k < 3; k++) normalSums.get(id)[k] += n[k];
  }
  for (const [id, n] of normalSums) {
    const length = Math.hypot(...n);
    if (length > 1e-10) rows[id].NORMAL = n.map((x) => x / length);
  }
  for (const s of semantics)
    attributes[s]
      .setArray(
        s === 'JOINTS_0'
          ? new Uint16Array(rows.flatMap((r) => r[s]))
          : new Float32Array(rows.flatMap((r) => r[s])),
      )
      .setNormalized(false);
  p.getIndices().setArray(new Uint32Array(newIndices));
  const report = {
    cutTriangles,
    capLoops,
    dentalVertices,
    taperedVertices: moved.size,
    addedVertices: rows.length - originalCount,
    addedTriangles: (newIndices.length - indices.length) / 3,
  };
  mesh.setExtras({
    ...mesh.getExtras(),
    wolf_v2_teeth_revision: 1,
    wolf_v2_teeth_added_triangles: report.addedTriangles,
  });
  return report;
}
