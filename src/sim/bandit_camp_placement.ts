import { BANDIT_CAMP, BANDIT_CAMP_MODELS } from './bandit_camp';
import type { SettlementItem } from './settlements_layout';
import type { TerrainHeight } from './wickharbor_layout';

type Vector = [number, number, number];
const dot = (a: Vector, b: Vector) => a.reduce((v, x, i) => v + x * b[i], 0);
const unit = (a: Vector): Vector => {
  const n = Math.hypot(...a);
  return a.map((v) => v / n) as Vector;
};
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** The study's rigid ground frame, shared by the visual and compound collider. */
export function banditCampPlacement(item: SettlementItem, height: TerrainHeight) {
  const b = BANDIT_CAMP_MODELS[item.modelId].bounds;
  const scale = typeof item.scale === 'number' ? item.scale : 1;
  const up = unit([
    -(height(item.x + 0.5, item.z) - height(item.x - 0.5, item.z)),
    1,
    -(height(item.x, item.z + 0.5) - height(item.x, item.z - 0.5)),
  ]);
  const yaw: Vector = [Math.cos(item.rot ?? 0), 0, -Math.sin(item.rot ?? 0)],
    d = dot(yaw, up);
  const right = unit(yaw.map((v, i) => v - d * up[i]) as Vector),
    forward = cross(right, up);
  const minY = b.min[1],
    origin: Vector = [item.x, 0, item.z];
  const contacts = [
    [b.min[0], b.min[2]],
    [b.max[0], b.min[2]],
    [b.min[0], b.max[2]],
    [b.max[0], b.max[2]],
    [0, 0],
  ];
  origin[1] = Math.max(
    ...contacts.map(([x, z]) => {
      const wx = item.x + (right[0] * x + forward[0] * z) * scale;
      const wz = item.z + (right[2] * x + forward[2] * z) * scale;
      return height(wx, wz) - (right[1] * x + forward[1] * z) * scale;
    }),
  );
  if (item.tent && item.floorY !== undefined) {
    const tent = BANDIT_CAMP.dressing.find((t) => t.id === item.tent);
    if (!tent) throw new Error(`Unknown camp floor: ${item.tent}`);
    const floor = height(tent.x, tent.z) + item.floorY;
    origin[1] = floor;
  }
  return { origin, right, up, forward, scale, minY };
}
