import { readFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const PATH = 'public/models/creatures/smart_wolf.glb';
const TOES = ['Bone_002', 'Bone_007', 'Bone_025', 'Bone_031'];
const JOINTS = [
  ...TOES,
  'Bone_006',
  'Bone_005',
  'Bone_004',
  'Bone_003',
  'Bone_011',
  'Bone_010',
  'Bone_009',
  'Bone_008',
  'Bone_029',
  'Bone_028',
  'Bone_027',
  'Bone_026',
  'Bone_035',
  'Bone_034',
  'Bone_033',
  'Bone_032',
];
const LOOPS = ['Wolf_Idle', 'Wolf_CombatIdle', 'Wolf_Walk', 'Wolf_Trot', 'Wolf_Run'];
const CLIPS = [
  ...LOOPS,
  'Wolf_BiteLeft',
  'Wolf_BiteRight',
  'Wolf_Lunge',
  'Wolf_Hit',
  'Wolf_Death',
  'Wolf_Howl',
  'Wolf_AlertLook',
];
const duration = (c: ClipIndex) => Math.max(...[...c.values()].map((x) => x.times.at(-1) ?? 0));

describe('owner-supplied Smart Rig wolf', () => {
  let rig: PoseRig;
  let clips: Map<string, ClipIndex>;
  beforeAll(async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    rig = createPoseRig(root);
    clips = new Map(root.listAnimations().map((a) => [a.getName(), indexClip(root, a.getName())]));
  });
  const clip = (name: string) => {
    const c = clips.get(name);
    if (!c) throw new Error(`Missing wolf clip ${name}`);
    return c;
  };
  const point = (name: string) => {
    const n = rig.named.get(name);
    if (!n) throw new Error(`Missing wolf bone ${name}`);
    return n.getWorldPosition(new Vector3());
  };
  const rotation = (name: string, local = false) => {
    const n = rig.named.get(name);
    if (!n) throw new Error(`Missing wolf bone ${name}`);
    return local ? n.quaternion.clone() : n.getWorldQuaternion(new Quaternion());
  };
  const pose = (name: string, phase: number) =>
    rig.apply(samplePose(clip(name), duration(clip(name)) * phase));

  it('keeps original topology, all 43 skin joints and compressed 2k PBR maps', async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(43);
    expect(root.listMeshes()).toHaveLength(1);
    const mesh = root.listMeshes()[0];
    expect(mesh.listPrimitives()[0].getIndices()?.getCount()).toBe(311877);
    expect(
      root
        .listNodes()
        .find((n) => n.getMesh() === mesh)
        ?.getExtras().source_sha256,
    ).toBe('27137214a7002978b3c8400bc213a0b37a92b038cbfd63ac6bb1ad9b5bcd7a2d');
    const bytes = readFileSync(PATH);
    const jsonLength = bytes.readUInt32LE(12);
    const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    expect(doc.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(doc.extensionsRequired).toContain('KHR_texture_basisu');
    expect(doc.images).toHaveLength(3);
    for (const image of doc.images) {
      expect(image.mimeType).toBe('image/ktx2');
      const view = doc.bufferViews[image.bufferView];
      const offset = jsonLength + 28 + (view.byteOffset ?? 0);
      expect(bytes.readUInt32LE(offset + 20)).toBe(2048);
      expect(bytes.readUInt32LE(offset + 24)).toBe(2048);
    }
    expect(bytes.length).toBeLessThan(10 * 1024 * 1024);
  });

  it('ships the complete native clip vocabulary with finite bound channels and unit quaternions', () => {
    expect([...clips.keys()].sort()).toEqual([...CLIPS].sort());
    for (const [name, channels] of clips)
      for (const [key, ch] of channels) {
        expect(rig.rest.has(key), `${name}: ${key}`).toBe(true);
        expect([...ch.values].every(Number.isFinite), name).toBe(true);
        if (ch.path === 'rotation')
          for (let i = 0; i < ch.values.length; i += 4)
            expect(Math.hypot(...ch.values.slice(i, i + 4)), `${name}: ${key}`).toBeCloseTo(1, 3);
      }
  });

  it.each(LOOPS)('%s closes every channel without a seam or root drift', (name) => {
    const channels = clip(name);
    const first = samplePose(channels, 0);
    const last = samplePose(channels, duration(channels));
    for (const [key, values] of first) {
      const end = last.get(key);
      expect(end, key).toBeDefined();
      if (end) for (const [i, value] of values.entries()) expect(end[i], key).toBeCloseTo(value, 3);
    }
  });

  it('breathes with all four idle paws planted', () => {
    pose('Wolf_Idle', 0);
    const anchors = TOES.map(point);
    const heights: number[] = [];
    for (let frame = 0; frame <= 120; frame++) {
      pose('Wolf_Idle', frame / 120);
      heights.push(point('Bone_000').y);
      for (const [i, n] of TOES.entries())
        expect(point(n).distanceTo(anchors[i]), n).toBeLessThan(0.01);
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.008);
  });

  it.each(['Wolf_Walk', 'Wolf_Trot', 'Wolf_Run'])(
    '%s articulates every hock and paw continuously',
    (name) => {
      const samples = JOINTS.map(() => [] as Vector3[]);
      for (let frame = 0; frame <= 120; frame++) {
        pose(name, frame / 120);
        JOINTS.forEach((bone, i) => {
          samples[i].push(point(bone));
        });
      }
      samples.forEach((positions, i) => {
        if (i < 4) {
          const ys = positions.map((p) => p.y);
          const zs = positions.map((p) => p.z);
          expect(Math.max(...ys) - Math.min(...ys), JOINTS[i]).toBeGreaterThan(
            name === 'Wolf_Run' ? 0.18 : 0.09,
          );
          expect(Math.max(...zs) - Math.min(...zs), JOINTS[i]).toBeGreaterThan(
            name === 'Wolf_Run' ? 0.8 : 0.48,
          );
          expect(Math.min(...ys), `${name}: paw floor`).toBeGreaterThan(-0.015);
        }
        for (let j = 1; j < positions.length; j++)
          expect(
            positions[j].distanceTo(positions[j - 1]),
            `${name}: ${JOINTS[i]} snap`,
          ).toBeLessThan(0.1);
      });
    },
  );

  it.each(['Wolf_Walk', 'Wolf_Run'])('%s support velocity matches its runtime cadence', (name) => {
    pose(name, 0.12);
    const start = point('Bone_003');
    pose(name, 0.32);
    const end = point('Bone_003');
    const def = VISUALS.npc_dev_smart_wolf;
    const measured = (((start.z - end.z) / (duration(clip(name)) * 0.2)) * def.height) / 1.7;
    const reference = name === 'Wolf_Run' ? def.runRef : def.walkRef;
    if (!reference) throw new Error('Missing wolf reference speed');
    expect(Math.abs(measured / reference - 1)).toBeLessThan(0.025);
  });

  it.each(['Wolf_BiteLeft', 'Wolf_BiteRight', 'Wolf_Lunge'])(
    '%s opens and snaps the jaw, reaches and recovers',
    (name) => {
      pose(name, 0);
      const jaw = rotation('Bone_038', true);
      const muzzle = point('Bone_037');
      const anchors = TOES.map(point);
      pose(name, 0.32);
      expect(rotation('Bone_038', true).angleTo(jaw)).toBeGreaterThan(0.4);
      pose(name, 0.5);
      expect(rotation('Bone_038', true).angleTo(jaw)).toBeLessThan(0.3);
      expect(point('Bone_037').z - muzzle.z).toBeGreaterThan(name === 'Wolf_Lunge' ? 0.18 : 0.09);
      for (let frame = 0; frame <= 120; frame++) {
        pose(name, frame / 120);
        TOES.forEach((n, i) => {
          const active = name === 'Wolf_BiteLeft' ? 2 : 3;
          if (name === 'Wolf_Lunge' ? i < 2 : i !== active)
            expect(point(n).distanceTo(anchors[i]), `${name}: support`).toBeLessThan(0.01);
        });
      }
      expect(rotation('Bone_038', true).angleTo(jaw)).toBeLessThan(0.01);
      for (const [i, n] of TOES.entries())
        expect(point(n).distanceTo(anchors[i]), `${name}: recovery`).toBeLessThan(0.01);
    },
  );

  it('uses distinct bite sides and lifts front paws during the lunge', () => {
    pose('Wolf_BiteLeft', 0.32);
    const left = rotation('Bone_023');
    pose('Wolf_BiteRight', 0.32);
    expect(rotation('Bone_023').angleTo(left)).toBeGreaterThan(0.15);
    pose('Wolf_Lunge', 0);
    const anchors = TOES.map(point);
    pose('Wolf_Lunge', 0.4);
    for (let i = 2; i < 4; i++) expect(point(TOES[i]).y - anchors[i].y).toBeGreaterThan(0.08);
  });

  it.each([
    ['Wolf_BiteLeft', 'Bone_025'],
    ['Wolf_BiteRight', 'Bone_031'],
  ])('%s braces with a lifted front step and a broader neck arc', (name, active) => {
    pose(name, 0);
    const start = point(active);
    const rest = rotation('Bone_023', true);
    let lift = 0;
    let reach = 0;
    let turn = 0;
    for (let frame = 0; frame <= 120; frame++) {
      pose(name, frame / 120);
      lift = Math.max(lift, point(active).y - start.y);
      reach = Math.max(reach, point(active).z - start.z);
      turn = Math.max(turn, rotation('Bone_023', true).angleTo(rest));
    }
    expect(lift).toBeGreaterThan(0.1);
    expect(reach).toBeGreaterThan(0.17);
    expect(turn).toBeGreaterThan(0.23);
    expect(duration(clip(name))).toBeGreaterThan(1.05);
  });

  it('raises the muzzle to howl and turns its head during the alert idle', () => {
    pose('Wolf_Howl', 0);
    const head = rotation('Bone_024');
    const muzzle = point('Bone_037');
    const jaw = rotation('Bone_038', true);
    pose('Wolf_Howl', 0.5);
    expect(rotation('Bone_024').angleTo(head)).toBeGreaterThan(0.35);
    expect(rotation('Bone_038', true).angleTo(jaw)).toBeGreaterThan(0.3);
    expect(point('Bone_037').y - muzzle.y).toBeGreaterThan(0.1);
    pose('Wolf_AlertLook', 0.25);
    const a = rotation('Bone_023');
    pose('Wolf_AlertLook', 0.75);
    expect(rotation('Bone_023').angleTo(a)).toBeGreaterThan(0.25);
  });

  it('keeps deformed vertices above the floor and holds a settled corpse', async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    const skin = root.listSkins()[0];
    const p = root.listMeshes()[0].listPrimitives()[0];
    const positions = p.getAttribute('POSITION'),
      weights = p.getAttribute('WEIGHTS_0'),
      joints = p.getAttribute('JOINTS_0');
    const inverse = skin.getInverseBindMatrices();
    if (!positions || !weights || !joints || !inverse) throw new Error('Missing wolf skin');
    const v: number[] = [],
      w: number[] = [],
      j: number[] = [],
      m: number[] = [];
    for (const name of CLIPS)
      for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
        pose(name, phase);
        const transforms = skin.listJoints().map((bone, i) => {
          const node = rig.named.get(bone.getName());
          if (!node) throw new Error('Missing wolf skin bone');
          inverse.getElement(i, m);
          return new Matrix4().multiplyMatrices(node.matrixWorld, new Matrix4().fromArray(m))
            .elements;
        });
        let floor = Infinity;
        for (let i = 0; i < positions.getCount(); i++) {
          positions.getElement(i, v);
          weights.getElement(i, w);
          joints.getElement(i, j);
          let y = 0;
          for (let k = 0; k < 4; k++) {
            const a = transforms[j[k]];
            y += w[k] * (a[1] * v[0] + a[5] * v[1] + a[9] * v[2] + a[13]);
          }
          floor = Math.min(floor, y);
        }
        expect(floor, `${name} floor at ${phase}`).toBeGreaterThan(-0.025);
      }
    const c = clip('Wolf_Death');
    const settled = samplePose(c, duration(c) * 0.9);
    const end = samplePose(c, duration(c));
    for (const [key, values] of settled)
      for (const [i, value] of values.entries())
        expect(end.get(key)?.[i], key).toBeCloseTo(value, 3);
    rig.apply(end);
    expect(point('Bone_022').y).toBeLessThan(0.85);
  });

  it('adds one isolated wolf subject, with both bite sides and an occasional lunge', () => {
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_smart_wolf' } as never)).toBe(
      'npc_dev_smart_wolf',
    );
    const def = VISUALS.npc_dev_smart_wolf;
    expect(def.url).toBe('models/creatures/smart_wolf.glb');
    expect(def.clips.attack).toEqual(['Wolf_BiteLeft', 'Wolf_BiteRight', 'Wolf_Lunge']);
    expect(def.clips.attackWeights).toEqual([2, 2, 1]);
    expect(def.clips.presentationPoses).toContain('Wolf_Trot');
    expect(def.clips.emote?.roar?.clips).toEqual(['Wolf_Howl']);
    expect(DEV_MODEL_LAB_MOBS.dev_smart_wolf).toMatchObject({
      family: 'beast',
      aggroOnDamageOnly: true,
      idleStationary: true,
      loot: [],
    });
    expect(DEV_MODEL_LAB_MOB_LINEUP.filter((x) => x.templateId === 'dev_smart_wolf')).toEqual([
      { templateId: 'dev_smart_wolf', x: 812, z: 24, facing: Math.PI / 2 },
    ]);
  });
});
