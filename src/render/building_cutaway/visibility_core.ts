export interface CutawayBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface CutawayWing {
  id: string;
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  roofY: number;
  storeyHeight: number;
}

export interface CutawayShape {
  radial: boolean;
  wings: readonly CutawayWing[];
}

/** A build-time partition key, independent of material or world rotation. */
export function cutawayPartKey(
  x: number,
  y: number,
  z: number,
  shape: CutawayShape,
  role: string,
): string {
  let wing = shape.wings[0];
  for (let i = 1; i < shape.wings.length; i++) {
    const other = shape.wings[i];
    if (
      Math.abs(x - other.x) < other.halfWidth + 0.2 &&
      Math.abs(z - other.z) < other.halfDepth + 0.2 &&
      Math.abs(z - wing.z) > wing.halfDepth - 0.15
    )
      wing = other;
  }
  const dx = x - wing.x,
    dz = z - wing.z;
  const radial = shape.radial
    ? `sector-${Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * 12) % 12}`
    : '';
  const side = role.startsWith('wall-')
    ? role.slice(5)
    : Math.abs(dx / wing.halfWidth) > Math.abs(dz / wing.halfDepth)
      ? dx > 0
        ? 'right'
        : 'left'
      : dz > 0
        ? 'front'
        : 'back';
  if (role.includes('roof') || y >= wing.roofY + 0.02) return `${wing.id}:roof:${radial || side}`;
  const level = Math.round(y / wing.storeyHeight);
  if (
    role === 'floor' ||
    role.endsWith('-floor') ||
    role === 'gallery-deck' ||
    Math.abs(y - level * wing.storeyHeight) < 0.09
  )
    return `${wing.id}:floor:${Math.round(y / 0.5)}`;
  return `${wing.id}:wall:${radial || side}:${Math.max(0, Math.floor(y / wing.storeyHeight))}`;
}

/** Finite, padded sightline. A supporting floor never becomes a cutaway. */
export function cutawayBlocksView(
  b: CutawayBounds,
  floor: boolean,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  camX: number,
  camY: number,
  camZ: number,
  wasHidden = false,
): boolean {
  if (floor && b.minY <= eyeY + 0.1) return false;
  const padding = wasHidden ? 0.38 : 0.25;
  // The renderer aims at body height (player Y + 2), not at the head or feet.
  // A single centre ray can leave a roof lip over the character's head.
  return (
    segmentHits(b, eyeX, eyeY, eyeZ, camX, camY, camZ, padding) ||
    segmentHits(b, eyeX, eyeY + 0.9, eyeZ, camX, camY, camZ, padding) ||
    segmentHits(b, eyeX, eyeY - 1.8, eyeZ, camX, camY, camZ, padding)
  );
}

function segmentHits(
  b: CutawayBounds,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  camX: number,
  camY: number,
  camZ: number,
  padding: number,
): boolean {
  let enter = 0,
    leave = 1;
  for (let axis = 0; axis < 3; axis++) {
    const a = axis === 0 ? eyeX : axis === 1 ? eyeY : eyeZ;
    const delta = (axis === 0 ? camX : axis === 1 ? camY : camZ) - a;
    const pad = axis === 1 ? 0.08 : padding;
    const min = (axis === 0 ? b.minX : axis === 1 ? b.minY : b.minZ) - pad;
    const max = (axis === 0 ? b.maxX : axis === 1 ? b.maxY : b.maxZ) + pad;
    if (Math.abs(delta) < 1e-9) {
      if (a < min || a > max) return false;
      continue;
    }
    let first = (min - a) / delta,
      second = (max - a) / delta;
    if (first > second) {
      const swap = first;
      first = second;
      second = swap;
    }
    enter = Math.max(enter, first);
    leave = Math.min(leave, second);
    if (leave < enter) return false;
  }
  return leave > 0.001 && enter < 0.999;
}
