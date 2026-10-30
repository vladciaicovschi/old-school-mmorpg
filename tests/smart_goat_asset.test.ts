import { readFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const PATH = 'public/models/creatures/smart_goat.glb';
const TOES = ['Bone_009', 'Bone_014', 'Bone_028', 'Bone_022'];
const CHAINS = [
  ['Bone_013', 'Bone_012', 'Bone_011', 'Bone_010'],
  ['Bone_018', 'Bone_017', 'Bone_016', 'Bone_015'],
  ['Bone_032', 'Bone_031', 'Bone_030', 'Bone_029'],
  ['Bone_026', 'Bone_025', 'Bone_024', 'Bone_023'],
];
const LOOPS = ['Goat_Idle', 'Goat_CombatIdle', 'Goat_Walk', 'Goat_Trot', 'Goat_Run'];
const ATTACKS = ['Goat_HeadbuttLeft', 'Goat_HeadbuttRight', 'Goat_Ram'];
const CLIPS = [
  ...LOOPS,
  ...ATTACKS,
  'Goat_Hit',
  'Goat_Death',
  'Goat_Bleat',
  'Goat_AlertLook',
  'Goat_Graze',
];
const duration = (c: ClipIndex) => Math.max(...[...c.values()].map((ch) => ch.times.at(-1) ?? 0));

describe('native Smart Rig goat', () => {
  let rig: PoseRig;
  let clips: Map<string, ClipIndex>;
  beforeAll(async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    rig = createPoseRig(root);
    clips = new Map(root.listAnimations().map((a) => [a.getName(), indexClip(root, a.getName())]));
  });
  const clip = (name: string) => {
    const c = clips.get(name);
    if (!c) throw new Error(`Missing goat clip ${name}`);
    return c;
  };
  const pose = (name: string, phase: number) =>
    rig.apply(samplePose(clip(name), duration(clip(name)) * phase));
  const node = (name: string) => {
    const bone = rig.named.get(name);
    if (!bone) throw new Error(`Missing goat joint ${name}`);
    return bone;
  };
  const point = (name: string) => node(name).getWorldPosition(new Vector3());

  it('preserves the original mesh, all 44 native joints and compressed PBR maps', async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(44);
    expect(root.listMeshes()).toHaveLength(1);
    const mesh = root.listMeshes()[0];
    expect(mesh.listPrimitives()[0].getIndices()?.getCount()).toBe(310839);
    expect(
      root
        .listNodes()
        .find((n) => n.getMesh() === mesh)
        ?.getExtras().source_sha256,
    ).toBe('dc23d1fa29efdeb602b0d6aa5f60f1e3a7737bfed6b7b89fe79e83ecf8bf6353');
    const bytes = readFileSync(PATH),
      length = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + length).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    expect(json.images).toHaveLength(3);
    for (const image of json.images) {
      expect(image.mimeType).toBe('image/ktx2');
      const view = json.bufferViews[image.bufferView],
        offset = length + 28 + (view.byteOffset ?? 0);
      expect(bytes.readUInt32LE(offset + 20)).toBe(2048);
      expect(bytes.readUInt32LE(offset + 24)).toBe(2048);
    }
    expect(bytes.length).toBeLessThan(10 * 1024 * 1024);
  });

  it('binds every clip, normalizes rotations and keeps body scale constant', () => {
    expect([...clips.keys()].sort()).toEqual([...CLIPS].sort());
    for (const [name, channels] of clips)
      for (const [key, ch] of channels) {
        expect(rig.rest.has(key), `${name}: ${key}`).toBe(true);
        expect([...ch.values].every(Number.isFinite)).toBe(true);
        if (ch.path === 'rotation')
          for (let i = 0; i < ch.values.length; i += 4)
            expect(Math.hypot(...ch.values.slice(i, i + 4))).toBeCloseTo(1, 3);
        if (ch.path === 'scale')
          for (const value of ch.values) expect(value, `${name}: scale`).toBeCloseTo(1, 3);
      }
  });

  it.each(LOOPS)('%s closes without root or pose drift', (name) => {
    const c = clip(name),
      first = samplePose(c, 0),
      last = samplePose(c, duration(c));
    for (const [key, values] of first)
      for (const [i, value] of values.entries())
        expect(last.get(key)?.[i], key).toBeCloseTo(value, 3);
  });

  it('breathes with all four hooves planted', () => {
    pose('Goat_Idle', 0);
    const anchors = TOES.map(point),
      heights: number[] = [];
    for (let frame = 0; frame <= 120; frame++) {
      pose('Goat_Idle', frame / 120);
      heights.push(point('Bone_000').y);
      for (const [i, bone] of TOES.entries())
        expect(point(bone).distanceTo(anchors[i])).toBeLessThan(0.01);
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.008);
  });

  it.each(['Goat_Walk', 'Goat_Trot', 'Goat_Run'])(
    '%s has visible, continuous hoof and hock travel',
    (name) => {
      const joints = [...TOES, ...CHAINS.flat()],
        samples = joints.map(() => [] as Vector3[]);
      for (let frame = 0; frame <= 120; frame++) {
        pose(name, frame / 120);
        for (const [i, bone] of joints.entries()) samples[i].push(point(bone));
        for (const [hip, knee, hock] of CHAINS) {
          const a = point(hip).distanceTo(point(knee)),
            b = point(knee).distanceTo(point(hock));
          expect(
            point(hip).distanceTo(point(hock)) - Math.abs(a - b),
            `${name}: folding`,
          ).toBeGreaterThan(0.06);
        }
      }
      for (const [i, positions] of samples.entries()) {
        if (i < 4) {
          const ys = positions.map((p) => p.y),
            zs = positions.map((p) => p.z);
          expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(
            name === 'Goat_Walk' ? 0.08 : 0.1,
          );
          expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(
            name === 'Goat_Walk' ? 0.43 : 0.5,
          );
          expect(Math.min(...ys)).toBeGreaterThan(-0.015);
        }
        for (let frame = 1; frame < positions.length; frame++)
          expect(
            positions[frame].distanceTo(positions[frame - 1]),
            `${name}: ${joints[i]} snap`,
          ).toBeLessThan(0.08);
      }
    },
  );

  it.each(['Goat_Walk', 'Goat_Run'])('%s matches reference speed on every support hoof', (name) => {
    const offsets = name === 'Goat_Walk' ? [0, 0.5, 0.25, 0.75] : [0, 0.07, 0.49, 0.56];
    const def = VISUALS.npc_dev_smart_goat,
      reference = name === 'Goat_Walk' ? def.walkRef : def.runRef;
    if (!reference) throw new Error('Missing goat reference speed');
    for (const [i, bone] of TOES.entries()) {
      pose(name, (1.1 - offsets[i]) % 1);
      const start = point(bone);
      pose(name, (1.3 - offsets[i]) % 1);
      const measured =
        (((start.z - point(bone).z) / (duration(clip(name)) * 0.2)) * def.height) / 1.7;
      expect(Math.abs(measured / reference - 1), bone).toBeLessThan(0.025);
    }
  });

  it.each(ATTACKS)('%s loads the head, strikes and recovers with stable supports', (name) => {
    pose(name, 0);
    const anchors = TOES.map(point),
      muzzle = point('Bone_042'),
      crown = point('Bone_019');
    const active = name === 'Goat_HeadbuttLeft' ? 2 : 3;
    let headDrop = 0,
      headReach = 0;
    const lift = TOES.map(() => 0);
    let previous: Vector3[] | undefined;
    for (let frame = 0; frame <= 120; frame++) {
      pose(name, frame / 120);
      headDrop = Math.max(headDrop, muzzle.y - point('Bone_042').y);
      headReach = Math.max(headReach, point('Bone_019').z - crown.z);
      for (const [i, bone] of TOES.entries()) {
        lift[i] = Math.max(lift[i], point(bone).y - anchors[i].y);
        // The supporting forehoof stays planted; hind hooves now step into the strike.
        if (name !== 'Goat_Ram' && i >= 2 && i !== active)
          expect(point(bone).distanceTo(anchors[i]), `${bone}: support`).toBeLessThan(0.01);
      }
      const current = [...TOES, 'Bone_020', 'Bone_042', ...CHAINS.flat()].map(point);
      if (previous)
        for (const [i, p] of current.entries())
          expect(p.distanceTo(previous[i])).toBeLessThan(0.09);
      previous = current;
    }
    expect(headDrop).toBeGreaterThan(0.1);
    expect(headReach).toBeGreaterThan(0.08);
    if (name === 'Goat_Ram') {
      expect(lift[2]).toBeGreaterThan(0.15);
      expect(lift[3]).toBeGreaterThan(0.15);
    } else expect(lift[active]).toBeGreaterThan(0.07);
    for (const [i, bone] of TOES.entries())
      expect(point(bone).distanceTo(anchors[i])).toBeLessThan(0.01);
    expect(duration(clip(name))).toBeGreaterThan(1.05);
  });

  it('turns the head to both sides, bleats and lowers its head to forage', () => {
    pose('Goat_HeadbuttLeft', 0.55);
    const left = node('Bone_019').getWorldQuaternion(new Quaternion());
    pose('Goat_HeadbuttRight', 0.55);
    expect(node('Bone_019').getWorldQuaternion(new Quaternion()).angleTo(left)).toBeGreaterThan(
      0.15,
    );
    pose('Goat_Bleat', 0);
    const jaw = node('Bone_043').quaternion.clone();
    pose('Goat_Bleat', 0.5);
    expect(node('Bone_043').quaternion.angleTo(jaw)).toBeGreaterThan(0.18);
    pose('Goat_Graze', 0);
    const height = point('Bone_042').y;
    pose('Goat_Graze', 0.5);
    expect(height - point('Bone_042').y).toBeGreaterThan(0.25);
  });

  it('lets upper hooves settle down and holds a relaxed corpse', () => {
    pose('Goat_Death', 1);
    for (const [top, bottom] of [
      ['Bone_028', 'Bone_022'],
      ['Bone_009', 'Bone_014'],
    ]) {
      expect(point(top).y - point(bottom).y).toBeLessThan(0.25);
      expect(point('Bone_000').y - point(top).y).toBeGreaterThan(0.25);
    }
    const c = clip('Goat_Death'),
      end = samplePose(c, duration(c)),
      held = samplePose(c, duration(c) * 0.9);
    for (const [key, values] of held)
      for (const [i, value] of values.entries())
        expect(end.get(key)?.[i], key).toBeCloseTo(value, 3);
  });

  it('keeps every deformed clip above the floor', async () => {
    const root = (await createGlbIO().read(PATH)).getRoot(),
      skin = root.listSkins()[0];
    const p = root.listMeshes()[0].listPrimitives()[0],
      positions = p.getAttribute('POSITION');
    const weights = p.getAttribute('WEIGHTS_0'),
      joints = p.getAttribute('JOINTS_0'),
      inverse = skin.getInverseBindMatrices();
    if (!positions || !weights || !joints || !inverse) throw new Error('Missing goat skin');
    const v: number[] = [],
      w: number[] = [],
      j: number[] = [],
      m: number[] = [];
    for (const name of CLIPS)
      for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
        pose(name, phase);
        const matrices = skin.listJoints().map((bone, i) => {
          inverse.getElement(i, m);
          return new Matrix4().multiplyMatrices(
            node(bone.getName()).matrixWorld,
            new Matrix4().fromArray(m),
          ).elements;
        });
        let floor = Infinity;
        for (let i = 0; i < positions.getCount(); i++) {
          positions.getElement(i, v);
          weights.getElement(i, w);
          joints.getElement(i, j);
          let y = 0;
          for (let k = 0; k < 4; k++) {
            const a = matrices[j[k]];
            y += w[k] * (a[1] * v[0] + a[5] * v[1] + a[9] * v[2] + a[13]);
          }
          floor = Math.min(floor, y);
        }
        expect(floor, `${name}: ${phase}`).toBeGreaterThan(-0.025);
      }
  });

  it('registers the isolated goat pad, studio poses and varied headbutts', () => {
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_smart_goat' } as never)).toBe(
      'npc_dev_smart_goat',
    );
    const def = VISUALS.npc_dev_smart_goat;
    expect(def.url).toBe('models/creatures/smart_goat.glb');
    expect(def.gait).toEqual({ runEnter: 1.55, runExit: 1.3 });
    expect(def.clips.attack).toEqual([
      'Goat_HeadbuttLeft',
      'Goat_HeadbuttRight',
      'Goat_HeadbuttLeft',
      'Goat_HeadbuttRight',
      'Goat_Ram',
    ]);
    expect(def.clips.presentationPoses).toEqual(['Goat_Trot', 'Goat_Graze']);
    expect(def.clips.emote?.roar?.clips).toEqual(['Goat_Bleat']);
    expect(DEV_MODEL_LAB_MOB_LINEUP.find((m) => m.templateId === 'dev_smart_goat')).toMatchObject({
      x: 812,
      z: 48,
    });
    expect(DEV_MODEL_LAB_MOBS.dev_smart_goat).toMatchObject({
      aggroRadius: 0,
      aggroOnDamageOnly: true,
      idleStationary: true,
      moveSpeed: 3.4,
      loot: [],
    });
  });
});
