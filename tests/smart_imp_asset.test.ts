import { readFileSync } from 'node:fs';
import { Matrix4, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const PATH = 'public/models/creatures/smart_imp.glb';
const LOOPS = ['Imp_Hover', 'Imp_CombatHover', 'Imp_Fly', 'Imp_FlyFast', 'Imp_Cast'];
const ATTACKS = ['Imp_ClawLeft', 'Imp_ClawRight', 'Imp_Dive'];
const CLIPS = [
  ...LOOPS,
  ...ATTACKS,
  'Imp_Hit',
  'Imp_Death',
  'Imp_Threat',
  'Imp_AlertLook',
  'Imp_CastRelease',
];
const TIPS = ['Bone_038', 'Bone_041'];
const FEET = ['Bone_007', 'Bone_012'];
const JOINTS = ['Bone_000', 'Bone_025', ...TIPS, ...FEET, 'Bone_029', 'Bone_034', 'Bone_016'];
const def = VISUALS.npc_dev_smart_imp;
function required<T>(value: T | undefined | null): T {
  if (value == null) throw new Error('Missing imp asset component');
  return value;
}
const seconds = (c: ClipIndex) => Math.max(...[...c.values()].map((ch) => ch.times.at(-1) ?? 0));

describe('native flying Smart Rig imp', () => {
  let rig: PoseRig;
  let clips: Map<string, ClipIndex>;
  let vertices: (ids?: number[]) => Vector3[];
  let rest: Vector3[];
  let scale: number;
  let offset: number;
  const clip = (name: string) => required(clips.get(name));
  const pose = (name: string, phase: number) =>
    rig.apply(samplePose(clip(name), seconds(clip(name)) * phase));
  const node = (name: string) => required(rig.named.get(name));
  const point = (name: string) => node(name).getWorldPosition(new Vector3());
  beforeAll(async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    rig = createPoseRig(root);
    clips = new Map(root.listAnimations().map((a) => [a.getName(), indexClip(root, a.getName())]));
    const skin = root.listSkins()[0],
      p = root.listMeshes()[0].listPrimitives()[0];
    const position = required(p.getAttribute('POSITION')),
      weights = required(p.getAttribute('WEIGHTS_0')),
      joints = required(p.getAttribute('JOINTS_0')),
      inverse = required(skin.getInverseBindMatrices());
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
      return (ids ?? Array.from({ length: position.getCount() }, (_, i) => i)).map((id) => {
        position.getElement(id, p);
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
    pose('Imp_Hover', 0.5 / seconds(clip('Imp_Hover')));
    const points = vertices(),
      lo = points.reduce((a, p) => Math.min(a, p.y), Infinity),
      hi = points.reduce((a, p) => Math.max(a, p.y), -Infinity);
    scale = def.height / (hi - lo);
    offset = required(def.hover) - lo * scale;
  });

  it('retains native topology, all 56 joints and compressed 2048px PBR maps', async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(56);
    expect(root.listMeshes()).toHaveLength(1);
    const mesh = root.listMeshes()[0];
    expect(mesh.listPrimitives()[0].getIndices()?.getCount()).toBe(310992);
    expect(
      root
        .listNodes()
        .find((n) => n.getMesh() === mesh)
        ?.getExtras().source_sha256,
    ).toBe('74db4af0ccabaa67cc98b2d0e5b718948f1d4d883ccd080b1ee3171aa16e996f');
    const bytes = readFileSync(PATH),
      length = bytes.readUInt32LE(12),
      json = JSON.parse(bytes.subarray(20, 20 + length).toString());
    expect(json.extensionsRequired).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
    );
    expect(json.images).toHaveLength(3);
    for (const image of json.images) {
      expect(image.mimeType).toBe('image/ktx2');
      const o = length + 28 + (json.bufferViews[image.bufferView].byteOffset ?? 0);
      expect(bytes.readUInt32LE(o + 20)).toBe(2048);
      expect(bytes.readUInt32LE(o + 24)).toBe(2048);
    }
    expect(bytes.length).toBeLessThan(10 * 1024 * 1024);
  });

  it('binds every nonempty clip with finite unit rotations and constant body scale', () => {
    expect([...clips.keys()].sort()).toEqual([...CLIPS].sort());
    for (const [name, channels] of clips) {
      expect(channels.size, name).toBeGreaterThan(0);
      expect(seconds(channels), name).toBeGreaterThan(0.4);
      for (const [key, ch] of channels) {
        expect(rig.rest.has(key), key).toBe(true);
        expect([...ch.values].every(Number.isFinite)).toBe(true);
        if (ch.path === 'rotation')
          for (let i = 0; i < ch.values.length; i += 4)
            expect(Math.hypot(...ch.values.slice(i, i + 4))).toBeCloseTo(1, 3);
        if (ch.path === 'scale')
          for (const value of ch.values) expect(value, name).toBeCloseTo(1, 3);
      }
    }
  });

  it.each(LOOPS)('%s loops without a pose or root pop', (name) => {
    const first = samplePose(clip(name), 0),
      last = samplePose(clip(name), seconds(clip(name)));
    for (const [key, values] of first)
      for (const [i, v] of values.entries()) expect(last.get(key)?.[i], key).toBeCloseTo(v, 3);
    pose(name, 0.99);
    const before = JOINTS.map(point);
    pose(name, 0);
    for (const [i, bone] of JOINTS.entries())
      expect(point(bone).distanceTo(before[i]), bone).toBeLessThan(0.12);
  });

  it.each(LOOPS)('%s visibly flaps both wings and retains tucked legs', (name) => {
    const samples = TIPS.map(() => [] as Vector3[]);
    let previous: Vector3[] | undefined;
    for (let i = 0; i <= 120; i++) {
      pose(name, i / 120);
      const current = JOINTS.map(point);
      if (previous)
        for (const [j, p] of current.entries())
          expect(p.distanceTo(previous[j]), `${name} joint jump`).toBeLessThan(0.12);
      previous = current;
      for (const [j, tip] of TIPS.entries()) {
        const p = point(tip);
        samples[j].push(p);
        expect(Math.abs(p.x), `${name} wing crosses torso`).toBeGreaterThan(0.3);
      }
      for (const [hip, foot] of [
        ['Bone_010', 'Bone_007'],
        ['Bone_015', 'Bone_012'],
      ]) {
        expect(point(hip).y - point(foot).y, 'leg hangs straight down').toBeLessThan(0.49);
        expect(point(foot).y * scale + offset).toBeGreaterThan(0.3);
      }
    }
    for (const points of samples) {
      const ys = points.map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.4);
    }
  });

  it('moves actual outer membrane skin rather than just empty wing joints', () => {
    rig.apply(new Map());
    const ids = rest.flatMap((p, i) => (Math.abs(p.x) > 0.5 && p.y > 0.8 && p.z < 0.08 ? [i] : []));
    expect(ids.length).toBeGreaterThan(1000);
    pose('Imp_Hover', 0);
    const first = vertices(ids);
    pose('Imp_Hover', 0.43 / 4);
    const last = vertices(ids);
    const mean = last.reduce((sum, p, i) => sum + p.distanceTo(first[i]), 0) / ids.length;
    expect(mean).toBeGreaterThan(0.22);
  });

  it.each(ATTACKS)('%s follows a broad airborne hand arc', (name) => {
    const hands =
      name === 'Imp_Dive'
        ? ['Bone_029', 'Bone_034']
        : [name === 'Imp_ClawLeft' ? 'Bone_034' : 'Bone_029'];
    pose(name, 0);
    const start = hands.map(point);
    pose(name, 0.28);
    const windup = hands.map(point);
    pose(name, 0.54);
    for (const [i, hand] of hands.entries()) {
      expect(windup[i].distanceTo(point(hand))).toBeGreaterThan(0.15);
      expect(start[i].distanceTo(point(hand))).toBeGreaterThan(0.1);
      expect(point(hand).z - windup[i].z).toBeGreaterThan(0.08);
    }
  });

  it('keeps actual muzzle and horns rigid through gestures and attacks', () => {
    rig.apply(new Map());
    const inverse = node('Bone_025').matrixWorld.clone().invert();
    const ids = rest.flatMap((p, i) => (p.y > 1.25 && Math.abs(p.x) < 0.25 ? [i] : [])),
      local = ids.map((i) => rest[i].clone().applyMatrix4(inverse));
    expect(ids.length).toBeGreaterThan(100);
    for (const name of [...ATTACKS, 'Imp_Threat', 'Imp_AlertLook', 'Imp_Cast', 'Imp_CastRelease'])
      for (const phase of [0.25, 0.5, 0.75]) {
        pose(name, phase);
        for (const [i, p] of vertices(ids).entries())
          expect(
            p.distanceTo(local[i].clone().applyMatrix4(node('Bone_025').matrixWorld)),
            name,
          ).toBeLessThan(0.008);
      }
  });

  it('clears the floor in flight and lands its corpse despite the hover offset', () => {
    for (const name of CLIPS)
      for (let i = 0; i <= 8; i++) {
        pose(name, i / 8);
        const lo = vertices().reduce((a, p) => Math.min(a, p.y * scale + offset), Infinity);
        expect(lo, `${name} floor ${i}/8`).toBeGreaterThan(-0.015);
        if (name !== 'Imp_Death') expect(lo, `${name} loses air clearance`).toBeGreaterThan(0.2);
        if (name === 'Imp_Death' && i === 8)
          expect(Math.abs(lo), 'corpse still hovering').toBeLessThan(0.015);
      }
  });

  it('holds the grounded final death pose with relaxed wings and limbs', () => {
    pose('Imp_Hover', 0);
    const high = point('Bone_000').y;
    pose('Imp_Death', 1);
    expect(high - point('Bone_000').y).toBeGreaterThan(0.5);
    const end = JOINTS.map(point);
    pose('Imp_Death', 0.95);
    for (const [i, name] of JOINTS.entries())
      expect(point(name).distanceTo(end[i]), name).toBeLessThan(0.002);
  });

  it('charges with both hands together and releases them forward while flying', () => {
    expect(def.clips.cast).toBe('Imp_Cast');
    expect(def.clips.castReleaseByTarget).toEqual({ hostile: 'Imp_CastRelease' });
    expect(def.clips.attackByAbility?.emberkin_felbolt).toBe('Imp_CastRelease');
    expect(seconds(clip('Imp_CastRelease'))).toBeCloseTo(1.2);
    for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
      pose('Imp_Cast', phase);
      const a = point('Bone_029'),
        b = point('Bone_034');
      expect(a.distanceTo(b)).toBeLessThan(0.32);
      for (const p of [a, b]) {
        expect(p.y).toBeGreaterThan(0.94);
        expect(p.z).toBeGreaterThan(0.2);
      }
    }
    pose('Imp_CastRelease', 0);
    const first = ['Bone_029', 'Bone_034'].map(point);
    pose('Imp_CastRelease', 0.38);
    for (const [i, bone] of ['Bone_029', 'Bone_034'].entries()) {
      expect(point(bone).z - first[i].z).toBeGreaterThan(0.15);
      expect(point(bone).y).toBeGreaterThan(first[i].y);
    }
  });

  it('uses its own flying demon subject and retains the optional claw clips', () => {
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_smart_imp' } as never)).toBe(
      'npc_dev_smart_imp',
    );
    expect(def.clips.attack).toEqual(ATTACKS);
    expect(def.clips.attackWeights).toEqual([2, 2, 1]);
    expect(def.hover).toBe(0.6);
    expect(required(def.gait).runEnter).toBeLessThan(DEV_MODEL_LAB_MOBS.dev_smart_imp.moveSpeed);
    expect(DEV_MODEL_LAB_MOBS.dev_smart_imp).toMatchObject({
      family: 'demon',
      aggroOnDamageOnly: true,
      idleStationary: true,
      loot: [],
    });
    expect(DEV_MODEL_LAB_MOB_LINEUP.find((s) => s.templateId === 'dev_smart_imp')).toMatchObject({
      x: 716,
      z: 72,
    });
    expect(VISUALS.npc_dev_smart_raptor.url).toBe('models/creatures/smart_raptor.glb');
  });
});
