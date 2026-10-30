import { readFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const CASES = [
  {
    animal: 'deer',
    prefix: 'Deer',
    bones: 44,
    indices: 311148,
    x: 764,
    hash: '403cf27544effc07baa9f689ce03ce9671902030e3571060d4adc241e9552234',
    loops: ['Idle', 'CombatIdle', 'Walk', 'Trot', 'Run'],
    attacks: ['AntlerLeft', 'AntlerRight', 'Charge'],
    extra: ['Hit', 'Death', 'Challenge', 'AlertLook', 'Graze'],
    feet: ['Bone_015', 'Bone_010', 'Bone_025', 'Bone_031'],
    chains: [
      ['Bone_018', 'Bone_017', 'Bone_016', 'Bone_015'],
      ['Bone_013', 'Bone_012', 'Bone_011', 'Bone_010'],
      ['Bone_028', 'Bone_027', 'Bone_026', 'Bone_025'],
      ['Bone_034', 'Bone_033', 'Bone_032', 'Bone_031'],
    ],
    skull: 'Bone_021',
    rigid: ['Bone_037', 'Bone_036', 'Bone_039', 'Bone_038'],
  },
  {
    animal: 'raptor',
    prefix: 'Raptor',
    bones: 64,
    indices: 312498,
    x: 740,
    hash: 'e114cefdd26f97c15af516c5acca1e9154efeed9258e69c7ede91e4ba08ba3cf',
    loops: ['Idle', 'CombatIdle', 'Walk', 'Run'],
    attacks: ['SlashLeft', 'SlashRight', 'Pounce', 'TailWhip'],
    extra: ['Hit', 'Death', 'AlertLook', 'Threat'],
    feet: ['Bone_012', 'Bone_006'],
    chains: [
      ['Bone_016', 'Bone_015', 'Bone_014', 'Bone_013', 'Bone_012'],
      ['Bone_010', 'Bone_009', 'Bone_008', 'Bone_007', 'Bone_006'],
    ],
    skull: 'Bone_026',
    rigid: ['Bone_025', 'Bone_024'],
  },
] as const;

function required<T>(value: T | undefined | null): T {
  if (value == null) throw new Error('Missing native asset component');
  return value;
}
const duration = (clip: ClipIndex) =>
  Math.max(...[...clip.values()].map((c) => c.times.at(-1) ?? 0));

describe.each(CASES)('$animal native motion', (spec) => {
  let rig: PoseRig;
  let clips: Map<string, ClipIndex>;
  let vertices: (ids?: number[]) => Vector3[];
  let rest: Vector3[];
  const path = `public/models/creatures/smart_${spec.animal}.glb`;
  const key = `npc_dev_smart_${spec.animal}`;
  const def = required(VISUALS[key]);
  const clip = (suffix: string) => required(clips.get(`${spec.prefix}_${suffix}`));
  const pose = (suffix: string, phase: number) =>
    rig.apply(samplePose(clip(suffix), duration(clip(suffix)) * phase));
  const node = (name: string) => required(rig.named.get(name));
  const point = (name: string) => node(name).getWorldPosition(new Vector3());

  beforeAll(async () => {
    const root = (await createGlbIO().read(path)).getRoot();
    rig = createPoseRig(root);
    clips = new Map(root.listAnimations().map((a) => [a.getName(), indexClip(root, a.getName())]));
    const skin = root.listSkins()[0],
      primitive = root.listMeshes()[0].listPrimitives()[0];
    const positions = required(primitive.getAttribute('POSITION'));
    const weights = required(primitive.getAttribute('WEIGHTS_0'));
    const joints = required(primitive.getAttribute('JOINTS_0'));
    const inverse = required(skin.getInverseBindMatrices());
    const bind = skin.listJoints().map((_, i) => {
      const m: number[] = [];
      inverse.getElement(i, m);
      return new Matrix4().fromArray(m);
    });
    vertices = (ids) => {
      const matrices = skin
        .listJoints()
        .map((b, i) => node(b.getName()).matrixWorld.clone().multiply(bind[i]));
      const p: number[] = [],
        w: number[] = [],
        j: number[] = [],
        v = new Vector3();
      return (ids ?? Array.from({ length: positions.getCount() }, (_, i) => i)).map((id) => {
        positions.getElement(id, p);
        weights.getElement(id, w);
        joints.getElement(id, j);
        const out = new Vector3();
        for (let k = 0; k < 4; k++)
          out.addScaledVector(v.fromArray(p).applyMatrix4(matrices[j[k]]), w[k]);
        return out;
      });
    };
    rig.apply(new Map());
    rest = vertices();
  });

  it('ships the complete native mesh, rig and GPU compressed PBR maps', async () => {
    const root = (await createGlbIO().read(path)).getRoot();
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(spec.bones);
    expect(root.listMeshes()).toHaveLength(1);
    const mesh = root.listMeshes()[0];
    expect(mesh.listPrimitives()[0].getIndices()?.getCount()).toBe(spec.indices);
    expect(
      root
        .listNodes()
        .find((n) => n.getMesh() === mesh)
        ?.getExtras().source_sha256,
    ).toBe(spec.hash);
    const bytes = readFileSync(path),
      length = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + length).toString());
    expect(json.extensionsRequired).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
    );
    expect(json.images).toHaveLength(3);
    for (const image of json.images) {
      expect(image.mimeType).toBe('image/ktx2');
      const offset = length + 28 + (json.bufferViews[image.bufferView].byteOffset ?? 0);
      expect(bytes.readUInt32LE(offset + 20)).toBe(2048);
      expect(bytes.readUInt32LE(offset + 24)).toBe(2048);
    }
    expect(bytes.length).toBeLessThan(10 * 1024 * 1024);
  });

  it('binds every clip with finite unit rotations and constant body scale', () => {
    expect([...clips.keys()].sort()).toEqual(
      [...spec.loops, ...spec.attacks, ...spec.extra].map((s) => `${spec.prefix}_${s}`).sort(),
    );
    for (const [name, channels] of clips) {
      expect(channels.size, name).toBeGreaterThan(0);
      expect(duration(channels), name).toBeGreaterThan(0.25);
      for (const [key, ch] of channels) {
        expect(rig.rest.has(key), `${name}: ${key}`).toBe(true);
        expect([...ch.values].every(Number.isFinite)).toBe(true);
        if (ch.path === 'rotation')
          for (let i = 0; i < ch.values.length; i += 4)
            expect(Math.hypot(...ch.values.slice(i, i + 4))).toBeCloseTo(1, 3);
        if (ch.path === 'scale') for (const value of ch.values) expect(value).toBeCloseTo(1, 3);
      }
    }
  });

  it.each(spec.loops)('%s joins seamlessly', (name) => {
    const first = samplePose(clip(name), 0),
      last = samplePose(clip(name), duration(clip(name)));
    for (const [key, values] of first)
      for (const [i, value] of values.entries())
        expect(last.get(key)?.[i], key).toBeCloseTo(value, 3);
  });

  it('keeps its supports planted while breathing', () => {
    pose('Idle', 0);
    const anchors = spec.feet.map(point);
    for (let i = 0; i <= 40; i++) {
      pose('Idle', i / 40);
      for (const [j, foot] of spec.feet.entries())
        expect(point(foot).distanceTo(anchors[j])).toBeLessThan(0.008);
    }
  });

  it.each(['Walk', 'Run'])(
    '%s has visible smooth travel without collapsing a native joint',
    (name) => {
      const samples: Vector3[][] = spec.feet.map(() => []);
      let previous: Vector3[] | undefined;
      for (let frame = 0; frame <= 120; frame++) {
        pose(name, frame / 120);
        const all = spec.chains.flat().map(point);
        if (previous)
          for (const [i, p] of all.entries())
            expect(p.distanceTo(previous[i]), `${name} joint jump`).toBeLessThan(0.12);
        previous = all;
        for (const [i, foot] of spec.feet.entries()) samples[i].push(point(foot));
        for (const [upper, knee, hock] of spec.chains) {
          const a = point(upper).distanceTo(point(knee)),
            b = point(knee).distanceTo(point(hock));
          expect(
            point(upper).distanceTo(point(hock)) - Math.abs(a - b),
            `${name} fold`,
          ).toBeGreaterThan(0.025);
        }
      }
      for (const points of samples) {
        const ys = points.map((p) => p.y),
          zs = points.map((p) => p.z);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.09);
        expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.35);
      }
    },
  );

  it.each(['Walk', 'Run'])('%s cadence matches the planted foot speed', (name) => {
    pose('Idle', 0.5 / duration(clip('Idle')));
    const skin = vertices();
    const height =
      skin.reduce((a, v) => Math.max(a, v.y), -Infinity) -
      skin.reduce((a, v) => Math.min(a, v.y), Infinity);
    pose(name, 0.1);
    const first = point(spec.feet[0]);
    pose(name, 0.3);
    const last = point(spec.feet[0]);
    const measured = (((first.z - last.z) / (duration(clip(name)) * 0.2)) * def.height) / height;
    expect(measured).toBeCloseTo(required(name === 'Walk' ? def.walkRef : def.runRef), 2);
  });

  it('keeps actual antler or muzzle skin rigid through attacks and head turns', () => {
    rig.apply(new Map());
    const inverse = node(spec.skull).matrixWorld.clone().invert();
    const ids = rest.flatMap((v, i) =>
      (spec.animal === 'deer' ? v.y > 1.48 : v.z > 1.12 && v.y > 1.22) ? [i] : [],
    );
    expect(ids.length).toBeGreaterThan(100);
    const locals = ids.map((i) => rest[i].clone().applyMatrix4(inverse));
    for (const name of [...spec.attacks, 'AlertLook'])
      for (const phase of [0.25, 0.5, 0.75]) {
        pose(name, phase);
        const actual = vertices(ids);
        for (const [i, p] of actual.entries())
          expect(
            p.distanceTo(locals[i].clone().applyMatrix4(node(spec.skull).matrixWorld)),
            `${name} facial stretch`,
          ).toBeLessThan(0.008);
        for (const bone of spec.rigid)
          for (const path of ['rotation', 'scale']) {
            const value =
              samplePose(clip(name), duration(clip(name)) * phase).get(`${bone}|${path}`) ??
              rig.rest.get(`${bone}|${path}`);
            const restValue = required(rig.rest.get(`${bone}|${path}`));
            if (path === 'rotation')
              expect(
                Math.abs(
                  new Quaternion()
                    .fromArray(required(value))
                    .dot(new Quaternion().fromArray(restValue)),
                ),
              ).toBeCloseTo(1, 3);
            else
              for (const [i, component] of required(value).entries())
                expect(component).toBeCloseTo(restValue[i], 3);
          }
      }
  });

  it('keeps actual skin above the floor during motion and collapse', () => {
    let floor = Infinity,
      lowest = '';
    for (const suffix of [...spec.loops, ...spec.attacks, ...spec.extra])
      for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
        pose(suffix, phase);
        for (const p of vertices())
          if (p.y < floor) {
            floor = p.y;
            lowest = `${suffix} at ${phase}`;
          }
      }
    expect(floor, lowest).toBeGreaterThan(-0.012);
  });

  it('rests with released upper limbs and a held final death pose', () => {
    pose('Idle', 0);
    const standing = point('Bone_000').y;
    pose('Death', 1);
    expect(standing - point('Bone_000').y).toBeGreaterThan(0.2);
    if (spec.animal === 'raptor') expect(point('Bone_017').y).toBeLessThan(0.25);
    const end = spec.feet.map(point);
    for (const [i, p] of end.entries()) expect(p.y, `foot ${i}`).toBeLessThan(0.35);
    pose('Death', 0.95);
    for (const [i, foot] of spec.feet.entries())
      expect(point(foot).distanceTo(end[i])).toBeLessThan(0.002);
  });

  it('uses random attack variants and an isolated direct-pull island subject', () => {
    const templateId = `dev_smart_${spec.animal}`;
    expect(visualKeyFor({ kind: 'mob', templateId } as never)).toBe(key);
    expect(def.clips.attack).toEqual(spec.attacks.map((s) => `${spec.prefix}_${s}`));
    expect(def.clips.attackWeights).toEqual(spec.animal === 'raptor' ? [2, 2, 1, 1] : [2, 2, 1]);
    expect(required(def.gait).runEnter).toBeLessThan(DEV_MODEL_LAB_MOBS[templateId].moveSpeed);
    expect(DEV_MODEL_LAB_MOBS[templateId]).toMatchObject({
      aggroOnDamageOnly: true,
      idleStationary: true,
      loot: [],
    });
    expect(DEV_MODEL_LAB_MOB_LINEUP.find((s) => s.templateId === templateId)).toMatchObject({
      x: spec.x,
      z: 72,
    });
  });
});
