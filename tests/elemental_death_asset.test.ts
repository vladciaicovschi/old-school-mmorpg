import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';
import { VISUALS } from '../src/render/characters/manifest';

function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('Missing elemental geometry or bone');
  return value;
}

describe.each(['fire', 'ice', 'water', 'storm', 'stone'])('%s elemental landing', (kind) => {
  it('lands every disconnected body segment, including fingers and ice shoulder crystals', async () => {
    const root = (
      await createGlbIO().read(`public/models/creatures/${kind}_elemental_prototype.glb`)
    ).getRoot();
    const skin = root.listSkins()[0],
      joints = skin.listJoints();
    const primitive = root.listMeshes()[0].listPrimitives()[0];
    const pos = required(primitive.getAttribute('POSITION')),
      weights = required(primitive.getAttribute('WEIGHTS_0')),
      ids = required(primitive.getAttribute('JOINTS_0'));
    const parent = Array.from({ length: pos.getCount() }, (_, i) => i);
    const find = (i: number): number => {
      if (parent[i] !== i) parent[i] = find(parent[i]);
      return parent[i];
    };
    const join = (a: number, b: number) => {
      parent[find(a)] = find(b);
    };
    const indices = required(primitive.getIndices());
    for (let i = 0; i < indices.getCount(); i += 3) {
      join(indices.getScalar(i), indices.getScalar(i + 1));
      join(indices.getScalar(i), indices.getScalar(i + 2));
    }
    const welded = new Map<string, number>();
    for (let i = 0; i < pos.getCount(); i++) {
      const key = pos
        .getElement(i, [])
        .map((v: number) => Math.round(v * 1e5))
        .join(',');
      const previous = welded.get(key);
      if (previous !== undefined) join(i, previous);
      else welded.set(key, i);
    }
    expect(new Set(parent.map((_, i) => find(i))).size).toBe(28);
    const rig = createPoseRig(root),
      death = indexClip(root, 'Death');
    const duration = Math.max(...[...death.values()].map((c) => c.times.at(-1) ?? 0));
    const bind = joints.map((_: unknown, i: number) =>
      new Matrix4().fromArray(required(skin.getInverseBindMatrices()).getElement(i, [])),
    );
    const sample = new Vector3(),
      point = new Vector3();
    function bodyMins() {
      const matrices = joints.map((j: { getName(): string }, i: number) =>
        new Matrix4().multiplyMatrices(required(rig.named.get(j.getName())).matrixWorld, bind[i]),
      );
      const result = new Map<number, number>();
      for (let i = 0; i < pos.getCount(); i++) {
        const v = pos.getElement(i, []),
          w = weights.getElement(i, []),
          joint = ids.getElement(i, []);
        sample.set(0, 0, 0);
        for (let k = 0; k < 4; k++)
          if (w[k])
            sample.addScaledVector(point.fromArray(v).applyMatrix4(matrices[joint[k]]), w[k]);
        const group = find(i);
        result.set(group, Math.min(result.get(group) ?? Infinity, sample.y));
      }
      return result;
    }
    rig.apply(samplePose(indexClip(root, `${kind[0].toUpperCase() + kind.slice(1)}_Idle`), 0.5));
    const floor = Math.min(...bodyMins().values());
    for (const t of [duration * 0.9, duration]) {
      rig.apply(samplePose(death, t));
      for (const min of bodyMins().values()) expect(Math.abs(min - floor)).toBeLessThan(0.0015);
      if (kind === 'ice')
        for (const side of ['l', 'r']) {
          const name = `IceCrystal_upperarm.${side}`,
            node = root.listNodes().find((n) => n.getName() === name);
          const positions = node?.getMesh()?.listPrimitives()[0].getAttribute('POSITION');
          expect(positions).toBeDefined();
          let min = Infinity;
          for (let i = 0; i < (positions?.getCount() ?? 0); i++)
            min = Math.min(
              min,
              point
                .fromArray(positions?.getElement(i, []) ?? [])
                .applyMatrix4(required(rig.named.get(name)).matrixWorld).y,
            );
          expect(Math.abs(min - floor)).toBeLessThan(0.0015);
        }
    }
    const def = VISUALS[`npc_dev_${kind}_elemental`];
    expect(def.deathGroundOffset).toBe(def.hover);
  });
});
