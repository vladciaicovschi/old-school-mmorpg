import { readFileSync } from 'node:fs';
import type { Root } from '@gltf-transform/core';
import { Matrix4, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { desiredModelBaseState } from '../src/render/characters/model_gait_core';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const PATH = 'public/models/creatures/smart_bufalo.glb';
const TOES = ['Bone_013', 'Bone_018', 'Bone_032', 'Bone_026'];
const CHAINS = [
  ['Bone_017', 'Bone_016', 'Bone_015', 'Bone_014'],
  ['Bone_022', 'Bone_021', 'Bone_020', 'Bone_019'],
  ['Bone_036', 'Bone_035', 'Bone_034', 'Bone_033'],
  ['Bone_030', 'Bone_029', 'Bone_028', 'Bone_027'],
];
const LOOPS = ['Buffalo_Idle', 'Buffalo_CombatIdle', 'Buffalo_Walk', 'Buffalo_Trot', 'Buffalo_Run'];
const ATTACKS = ['Buffalo_HornLeft', 'Buffalo_HornRight', 'Buffalo_Charge'];
const CLIPS = [
  ...LOOPS,
  ...ATTACKS,
  'Buffalo_Hit',
  'Buffalo_Death',
  'Buffalo_Bellow',
  'Buffalo_AlertLook',
  'Buffalo_Graze',
];
const duration = (clip: ReturnType<typeof indexClip>) =>
  Math.max(...[...clip.values()].map((ch) => ch.times.at(-1) ?? 0));

describe('native Smart Rig buffalo', () => {
  let root: Root;
  let rig: ReturnType<typeof createPoseRig>;
  beforeAll(async () => {
    root = (await createGlbIO().read(PATH)).getRoot();
    rig = createPoseRig(root);
  });
  const node = (name: string) => {
    const n = rig.named.get(name);
    if (!n) throw new Error(`Missing ${name}`);
    return n;
  };
  const point = (name: string) => node(name).getWorldPosition(new Vector3());
  const pose = (name: string, phase: number) => {
    const c = indexClip(root, name);
    rig.apply(samplePose(c, duration(c) * phase));
  };

  it('retains the native topology, skin, source provenance and compressed maps', () => {
    expect(root.listSkins()[0].listJoints()).toHaveLength(52);
    expect(root.listMeshes()).toHaveLength(1);
    const mesh = root.listMeshes()[0];
    expect(mesh.listPrimitives()[0].getIndices()?.getCount()).toBe(311628);
    expect(
      root
        .listNodes()
        .find((n) => n.getMesh() === mesh)
        ?.getExtras().source_sha256,
    ).toBe('4704eb3c89a0ce66e8fef1266ac25aaf9eb3cebebb9c608217c4e33934de4100');
    const bytes = readFileSync(PATH),
      json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    expect(json.images).toHaveLength(3);
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
    expect(bytes.length).toBeLessThan(10 * 1024 * 1024);
  });
  it('binds all clips with finite normalized rotations and no expanding body scale', () => {
    expect(
      root
        .listAnimations()
        .map((a) => a.getName())
        .sort(),
    ).toEqual([...CLIPS].sort());
    for (const name of CLIPS)
      for (const [key, ch] of indexClip(root, name)) {
        expect(rig.rest.has(key), key).toBe(true);
        expect([...ch.values].every(Number.isFinite)).toBe(true);
        if (ch.path === 'scale') for (const x of ch.values) expect(x).toBeCloseTo(1, 3);
        if (ch.path === 'rotation')
          for (let i = 0; i < ch.values.length; i += 4)
            expect(Math.hypot(...ch.values.slice(i, i + 4))).toBeCloseTo(1, 3);
      }
  });
  it.each(LOOPS)('%s closes seamlessly', (name) => {
    const c = indexClip(root, name),
      a = samplePose(c, 0),
      b = samplePose(c, duration(c));
    for (const [key, values] of a)
      for (const [i, value] of values.entries()) expect(b.get(key)?.[i], key).toBeCloseTo(value, 3);
  });
  it.each(['Buffalo_Walk', 'Buffalo_Trot', 'Buffalo_Run'])(
    '%s articulates safely with visible hoof clearance',
    (name) => {
      const heights = TOES.map(() => [] as number[]);
      let previous: Vector3[] | undefined;
      for (let frame = 0; frame <= 240; frame++) {
        pose(name, frame / 240);
        TOES.forEach((b, i) => {
          heights[i].push(point(b).y);
        });
        const current = [...rig.named.keys()].filter((n) => n.startsWith('Bone_')).map(point);
        if (previous)
          for (let i = 0; i < current.length; i++)
            expect(current[i].distanceTo(previous[i]), `${name} joint ${i}`).toBeLessThan(0.055);
        previous = current;
        for (const [upper, knee, hock] of CHAINS) {
          const a = point(upper).distanceTo(point(knee)),
            b = point(knee).distanceTo(point(hock));
          expect(
            point(upper).distanceTo(point(hock)) - Math.abs(a - b),
            'folded hock',
          ).toBeGreaterThan(0.055);
        }
      }
      for (const ys of heights) {
        expect(Math.min(...ys)).toBeGreaterThan(-0.015);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.06);
      }
    },
  );
  it.each([
    ['Buffalo_Walk', 0.7],
    ['Buffalo_Run', 0.5],
  ] as const)('%s matches support speed on every hoof', (name, stance) => {
    const def = VISUALS.npc_dev_smart_bufalo,
      ref = name === 'Buffalo_Walk' ? def.walkRef : def.runRef;
    if (!ref) throw new Error('Missing cadence');
    const offsets = name === 'Buffalo_Walk' ? [0.25, 0.75, 0, 0.5] : [0, 0.09, 0.48, 0.57];
    const seconds = duration(indexClip(root, name));
    TOES.forEach((bone, i) => {
      const phase = (0.2 * stance - offsets[i] + 1) % 1;
      pose(name, phase);
      const a = point(bone);
      pose(name, (phase + 0.1 * stance) % 1);
      const b = point(bone);
      const measured = ((Math.abs(b.z - a.z) / (0.1 * stance * seconds)) * 2.4) / 1.7;
      expect(Math.abs(measured / ref - 1), bone).toBeLessThan(0.025);
    });
  });
  it.each(['Buffalo_Walk', 'Buffalo_Trot'])(
    '%s gives both front feet matching recovery and fetlock posture',
    (name) => {
      for (let frame = 0; frame < 80; frame++) {
        const phase = frame / 80;
        pose(name, phase);
        const left = point('Bone_033');
        const leftHock = point('Bone_034').sub(left);
        pose(name, (phase + 0.5) % 1);
        const right = point('Bone_027');
        const rightHock = point('Bone_028').sub(right);
        expect(Math.abs(left.z - right.z), 'unequal forward placement').toBeLessThan(0.02);
        expect(Math.abs(left.y - right.y), 'unequal recovery clearance').toBeLessThan(0.015);
        expect(Math.abs(leftHock.z - rightHock.z), 'one fetlock leans differently').toBeLessThan(
          0.015,
        );
        expect(Math.abs(leftHock.y - rightHock.y), 'unequal fetlock support height').toBeLessThan(
          0.015,
        );
      }
    },
  );
  it.each(ATTACKS)('%s drives the horns with a planted forehoof and recovers', (name) => {
    pose(name, 0);
    const anchors = TOES.map(point),
      crown = point('Bone_023'),
      rootStart = point('Bone_000');
    let reach = 0;
    const lift = [0, 0];
    let previous: Vector3[] | undefined;
    for (let frame = 0; frame <= 120; frame++) {
      pose(name, frame / 120);
      reach = Math.max(reach, point('Bone_023').z - crown.z);
      const active = name === 'Buffalo_HornLeft' ? 2 : 3;
      TOES.forEach((b, i) => {
        if (name !== 'Buffalo_Charge' && i >= 2 && i !== active)
          expect(point(b).distanceTo(anchors[i]), b).toBeLessThan(0.01);
        else if (i >= 2) lift[i - 2] = Math.max(lift[i - 2], point(b).y - anchors[i].y);
      });
      const current = [...TOES, 'Bone_023', 'Bone_046', ...CHAINS.flat()].map(point);
      if (previous)
        for (let i = 0; i < current.length; i++)
          expect(current[i].distanceTo(previous[i])).toBeLessThan(0.065);
      previous = current;
    }
    expect(reach).toBeGreaterThan(0.08);
    if (name === 'Buffalo_Charge') {
      expect(lift[0]).toBeGreaterThan(0.06);
      expect(lift[1]).toBeGreaterThan(0.06);
    } else expect(lift[name === 'Buffalo_HornLeft' ? 0 : 1]).toBeGreaterThan(0.06);
    pose(name, 0.57);
    const muzzle = point('Bone_046').sub(point('Bone_023'));
    expect(muzzle.z, 'horns must lead the nose').toBeLessThan(
      name === 'Buffalo_Charge' ? -0.13 : -0.09,
    );
    expect(muzzle.y).toBeLessThan(-0.33);
    const tips =
      name === 'Buffalo_Charge'
        ? ['Bone_048', 'Bone_050']
        : [name === 'Buffalo_HornLeft' ? 'Bone_048' : 'Bone_050'];
    for (const tip of tips)
      expect(point(tip).z - point('Bone_046').z, `${tip}: actual horn must lead`).toBeGreaterThan(
        0.11,
      );
    pose(name, 0.6);
    expect(point('Bone_000').z - rootStart.z, 'body must commit into the strike').toBeGreaterThan(
      name === 'Buffalo_Charge' ? 0.31 : 0.2,
    );
    pose(name, 1);
    TOES.forEach((b, i) => {
      expect(point(b).distanceTo(anchors[i])).toBeLessThan(0.01);
    });
  });
  it('starts walking near the planted front feet instead of yanking a leg backward', () => {
    pose('Buffalo_Idle', 0);
    const idle = ['Bone_032', 'Bone_026'].map(point);
    pose('Buffalo_Walk', 0);
    for (const [i, bone] of ['Bone_032', 'Bone_026'].entries())
      expect(point(bone).distanceTo(idle[i]), `${bone}: idle entry gap`).toBeLessThan(0.1);
  });
  it('releases upper legs and holds a relaxed death pose', () => {
    pose('Buffalo_Death', 1);
    for (const [top, bottom] of [
      ['Bone_032', 'Bone_026'],
      ['Bone_013', 'Bone_018'],
    ])
      expect(point(top).y - point(bottom).y).toBeLessThan(0.25);
    const c = indexClip(root, 'Buffalo_Death'),
      a = samplePose(c, duration(c) * 0.9),
      b = samplePose(c, duration(c));
    for (const [key, values] of a)
      for (const [i, value] of values.entries()) expect(b.get(key)?.[i], key).toBeCloseTo(value, 3);
  });
  it('keeps both horns rigid relative to the skull in every motion', () => {
    pose('Buffalo_Idle', 0);
    const tips = ['Bone_048', 'Bone_050'];
    const rest = tips.map((name) => node('Bone_023').worldToLocal(point(name)));
    for (const name of CLIPS)
      for (let frame = 0; frame <= 40; frame++) {
        pose(name, frame / 40);
        for (const [i, tip] of tips.entries()) {
          const local = node('Bone_023').worldToLocal(point(tip));
          expect(
            local.distanceTo(rest[i]),
            `${name}: horn ${tip} bends independently`,
          ).toBeLessThan(0.002);
        }
      }
  });
  it('keeps the deformed mesh above the floor in every clip', () => {
    const skin = root.listSkins()[0],
      p = root.listMeshes()[0].listPrimitives()[0],
      positions = p.getAttribute('POSITION'),
      weights = p.getAttribute('WEIGHTS_0'),
      joints = p.getAttribute('JOINTS_0'),
      inverse = skin.getInverseBindMatrices();
    if (!positions || !weights || !joints || !inverse) throw new Error('Missing skin');
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
        expect(floor, `${name} ${phase}`).toBeGreaterThan(-0.025);
      }
  });
  it('registers the dry isolated pad, attack variants and native run at chase speed', () => {
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_smart_bufalo' } as never)).toBe(
      'npc_dev_smart_bufalo',
    );
    const mob = DEV_MODEL_LAB_MOBS.dev_smart_bufalo,
      def = VISUALS.npc_dev_smart_bufalo;
    expect(mob.moveSpeed).toBe(4.2);
    expect(mob.aggroOnDamageOnly).toBe(true);
    expect(mob.loot).toEqual([]);
    expect(DEV_MODEL_LAB_MOB_LINEUP.find((x) => x.templateId === mob.id)).toMatchObject({
      x: 812,
      z: 72,
    });
    expect(def.clips.attack).toEqual([
      'Buffalo_HornLeft',
      'Buffalo_HornRight',
      'Buffalo_HornLeft',
      'Buffalo_HornRight',
      'Buffalo_Charge',
    ]);
    expect(
      desiredModelBaseState(
        { speed: 4.2, moving: true, running: false } as never,
        false,
        false,
        false,
        def.gait,
        'walk',
      ),
    ).toBe('run');
  });
});
