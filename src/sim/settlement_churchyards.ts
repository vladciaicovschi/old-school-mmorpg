import type { SettlementItem } from './settlements_layout';

type Point = { x: number; z: number };
type Bounds = { xMin: number; xMax: number; zMin: number; zMax: number };

// Only the village's visual cluster is replaced. Release points and remote
// grave fields belong to their existing gameplay/content records.
const replaced: Readonly<Record<string, Point>> = {
  wickharbor: { x: 400, z: 342 },
  gullhaven: { x: 290, z: 86 },
  gibbetmere: { x: 386, z: 1420 },
};

export function settlementLegacyChurchyards<T extends Point>(
  legacy: readonly T[],
  id: string,
  bounds: Bounds,
): T[] {
  const target = replaced[id];
  return legacy.filter((point) => {
    if (id === 'eastbrook')
      return (
        point.x < bounds.xMin ||
        point.x > bounds.xMax ||
        point.z < bounds.zMin ||
        point.z > bounds.zMax
      );
    return !target || Math.hypot(point.x - target.x, point.z - target.z) > 1;
  });
}

const models = [
  'eastbrook:gravestone-4',
  'eastbrook:gravestone-2',
  'eastbrook:gravestone-8',
  'wickharbor:gravestone-3',
  'wickharbor:gravestone-6',
  'wickharbor:gravestone-7',
] as const;

// Small hand-offset groups face a shared approach without becoming a grid.
// Different mixed repeats let each churchyard read as a local burial ground.
const groups: Readonly<
  Record<string, readonly (readonly [number, number, number, number, number])[]>
> = {
  gullhaven: [
    [286.2, 89.8, 0, 0.88, -0.08],
    [288.5, 90.7, 3, 0.83, 0.11],
    [291.1, 90.1, 0, 0.92, -0.17],
    [293.2, 91.7, 4, 0.89, 0.06],
    [286.9, 92.6, 3, 0.86, 0.19],
    [289.7, 93.5, 4, 0.94, -0.04],
    [292.2, 94.1, 0, 0.84, -0.13],
  ],
  gibbetmere: [
    [383.4, 1417.4, 5, 0.87, -0.15],
    [385.5, 1415.8, 2, 0.93, 0.08],
    [388.2, 1416.6, 1, 0.85, -0.06],
    [389.2, 1419.2, 2, 0.9, 0.17],
    [386.8, 1420.6, 5, 0.95, -0.11],
    [383.5, 1421.3, 1, 0.89, 0.12],
    [390.4, 1422.1, 3, 0.82, 0.04],
    [386.2, 1423.1, 2, 0.86, -0.18],
  ],
  icemantle: [
    [-37.4, 1582.8, 4, 0.9, -0.09],
    [-35.8, 1584.3, 0, 0.94, 0.14],
    [-33.7, 1584.1, 4, 0.86, -0.12],
    [-37, 1585.9, 2, 0.91, 0.06],
    [-34.7, 1586.7, 0, 0.88, -0.17],
  ],
};

export function settlementChurchyardItems(id: string): SettlementItem[] {
  return (groups[id] ?? []).map(([x, z, variant, scale, yaw], index) => ({
    id: `churchyard-grave-${index + 1}`,
    modelId: models[variant],
    x,
    z,
    scale,
    rot: Math.PI + yaw,
  }));
}
