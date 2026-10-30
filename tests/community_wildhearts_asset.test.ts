import { readFileSync } from 'node:fs';
import type { Root } from '@gltf-transform/core';
import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type ClipIndex,
  createGlbIO,
  indexClip,
  type Pose,
  samplePose,
} from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { type AnimState, locomotionTimeScale } from '../src/render/characters/anim_state';
import { VISUALS } from '../src/render/characters/manifest';
import { clipNamesOf } from '../src/render/characters/clip_names_core';
import { WILDHEART_NATIVE_CLIPS } from '../src/render/characters/community_wildheart_native_clips';
import { desiredModelBaseState } from '../src/render/characters/model_gait_core';
import { MOBS } from '../src/sim/data';
import { mobTemplateForDungeonDifficulty } from '../src/sim/instances/difficulty';
import { createSkinnedPoseFloor } from './helpers/skinned_pose_floor';

const MODELS = [
  {
    key: 'cycle8',
    mob: 'wildheart_high_priest',
    triangles: 103884,
    bones: 82,
    sha: '5137b657e1ff1751b47453e548547394b215abc8c38908c0ef6985a4034b69f7',
    extra: ['Cast', 'Heal', 'Slam', 'Release'],
  },
  {
    key: 'silent1',
    mob: 'wildheart_ravager',
    triangles: 103812,
    bones: 83,
    sha: 'bb9823dd476ede9c165f3e3210969fb9bd84ad16ff8401ab7adef906efbf7c6a',
    extra: ['AxeThrow'],
  },
  {
    key: 'silent4',
    mob: 'wildheart_hexcaller',
    triangles: 103557,
    bones: 85,
    sha: '0d65df1ec25ab87f49683fa6126562e8c125f7f8adc395dd850d8cafe202f10d',
    extra: ['Slam', 'Cast', 'Heal'],
  },
  {
    key: 'silent6',
    mob: 'wildheart_beastmaster',
    triangles: 103911,
    bones: 66,
    sha: '9a05fa6312cec38965a571ea579023284ba56c1f5d0a33fcbd644c2d42152867',
    extra: ['Cast', 'Heal', 'Release'],
  },
  {
    key: 'silent8',
    mob: 'wildheart_stalker',
    triangles: 104034,
    bones: 28,
    sha: '2b5325720ed5423fa65cbfa3e8650676bc5724b0ad7aace12029087c56a64615',
    extra: ['SpearThrow'],
  },
];
const BASE_CLIPS = ['Idle', 'CombatIdle', 'Walk', 'Run', 'Attack', 'Hit', 'Death'];
const SOURCE_HEIGHT = 1.7;
const TARGET_HEIGHTS: Record<string, number> = {
  wildheart_stalker: 2.405,
  wildheart_ravager: 2.5,
  wildheart_hexcaller: 2.394,
  wildheart_beastmaster: 2.7025,
  wildheart_high_priest: 2.996,
};
const duration = (clip: ClipIndex) =>
  Math.max(...[...clip.values()].map((channel) => channel.times.at(-1) ?? 0));

function expectSamePose(actual: Pose, expected: Pose, label: string) {
  for (const [key, a] of expected) {
    const b = actual.get(key);
    expect(b, label + ':' + key).toBeDefined();
    if (!b) continue;
    if (key.endsWith('|rotation')) {
      const dot = a.reduce((sum, value, i) => sum + value * b[i], 0);
      const normA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
      const normB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
      expect(Math.abs(dot / (normA * normB)), label + ':' + key).toBeCloseTo(1, 4);
    } else {
      for (let i = 0; i < a.length; i++) expect(b[i], label + ':' + key).toBeCloseTo(a[i], 3);
    }
  }
}

const travelState = (speed: number): AnimState => ({
  speed,
  moving: true,
  running: true,
  backwards: false,
  airborne: false,
  dead: false,
  casting: false,
  swimming: false,
  submerged: false,
  swimPitch: 0,
  wading: false,
  sitting: false,
});

describe.each(MODELS)('native community Wildheart $key', (model) => {
  it('matches the reference troll size with a modest elite or boss increase', () => {
    const visual = VISUALS[`mob_${model.mob}`];
    const height = visual.height * MOBS[model.mob].scale;
    const reference = VISUALS.npc_dev_troll.height * MOBS.dev_troll.scale;
    expect(reference).toBeCloseTo(2.4, 4);
    expect(height).toBeCloseTo(TARGET_HEIGHTS[model.mob], 4);
    expect(height).toBeGreaterThan(reference * 0.98);
    expect(height).toBeLessThan(reference * 1.26);
  });
  const file = `public/models/creatures/community_wildheart_${model.key}.glb`;
  const names = [...BASE_CLIPS, ...model.extra];
  let root: Root, rig: PoseRig, clips: Map<string, ClipIndex>, floor: () => number;
  const point = (name: string) =>
    rig.named.get(`mixamorig:${name}`)!.getWorldPosition(new Vector3());
  beforeAll(async () => {
    root = (await createGlbIO().read(file)).getRoot();
    rig = createPoseRig(root);
    clips = new Map(names.map((name) => [name, indexClip(root, `Wildheart_${name}`)]));
    floor = createSkinnedPoseFloor(root, rig);
  });

  it('preserves the fingerprinted native topology, skin and original compressed maps', () => {
    expect(root.listMeshes()).toHaveLength(1);
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(model.bones);
    const primitive = root.listMeshes()[0].listPrimitives()[0];
    expect(primitive.getIndices()!.getCount()).toBe(model.triangles * 3);
    const extras = root
      .listNodes()
      .find((node) => node.getMesh())!
      .getExtras();
    expect(extras.source_sha256).toBe(model.sha);
    expect(extras.original_triangles).toBe(model.triangles);
    expect(extras.original_joint_count).toBe(model.bones);
    const weights = primitive.getAttribute('WEIGHTS_0')!;
    const values: number[] = [];
    for (let i = 0; i < weights.getCount(); i++) {
      weights.getElement(i, values);
      if (
        !values.every(Number.isFinite) ||
        Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 0.001
      ) {
        throw new Error(`Invalid native weights at vertex ${i}`);
      }
    }
    const bytes = readFileSync(file);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    expect(json.extensionsUsed).not.toContain('KHR_draco_mesh_compression');
    expect(json.images).toHaveLength(3);
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
    for (const texture of root.listTextures())
      expect(Math.max(...texture.getSize()!)).toBeLessThanOrEqual(2048);
    expect(root.listCameras()).toHaveLength(0);
    expect(root.listMaterials()[0].getAlphaMode()).toBe('OPAQUE');
  });

  it('binds its complete own-rig vocabulary and closes every standing/travel loop', () => {
    expect(
      root
        .listAnimations()
        .map((animation) => animation.getName())
        .sort(),
    ).toEqual(
      expect.arrayContaining([
        ...names.map((name) => `Wildheart_${name}`),
        ...WILDHEART_NATIVE_CLIPS[model.key],
      ]),
    );
    for (const [name, clip] of clips) {
      expect(duration(clip), name).toBeGreaterThan(0.2);
      for (const [key, channel] of clip) {
        expect(rig.rest.has(key), name + ':' + key).toBe(true);
        expect([...channel.values].every(Number.isFinite), name + ':' + key).toBe(true);
      }
    }
    for (const name of WILDHEART_NATIVE_CLIPS[model.key]) {
      expect(clipNamesOf(VISUALS[`mob_${model.mob}`])).toContain(name);
      const native = indexClip(root, name);
      expect(native.size, name).toBeGreaterThan(0);
      for (const [key, channel] of native) {
        expect(rig.rest.has(key), name + ':' + key).toBe(true);
        expect([...channel.values].every(Number.isFinite), name + ':' + key).toBe(true);
      }
    }
    for (const name of ['Idle', 'CombatIdle', 'Walk', 'Run']) {
      const clip = clips.get(name)!;
      expectSamePose(samplePose(clip, duration(clip)), samplePose(clip, 0), name);
    }
  });

  it('uses a grounded relaxed idle with both hands below the shoulders', () => {
    const clip = clips.get('Idle')!;
    for (const phase of [0, 0.5, 1]) {
      rig.apply(samplePose(clip, duration(clip) * phase));
      for (const side of ['Left', 'Right']) {
        expect(point(side + 'Arm').y - point(side + 'Hand').y, side).toBeGreaterThan(
          SOURCE_HEIGHT * 0.18,
        );
      }
      expect(Math.abs(floor())).toBeLessThan(0.035);
    }
  });

  it('keeps the supplied hit reaction above ground as it plays', () => {
    const hit = clips.get('Hit')!;
    for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
      rig.apply(samplePose(hit, duration(hit) * phase));
      expect(floor(), `hit ${phase}`).toBeGreaterThan(-0.04);
      if (phase === 0 || phase === 1) expect(floor(), `hit ${phase}`).toBeLessThan(0.015);
    }
  });

  it.each(['Walk', 'Run'])('%s has articulated feet and a moving upper body', (name) => {
    const clip = clips.get(name)!;
    const trajectories = new Map<string, Vector3[]>(
      ['LeftFoot', 'RightFoot', 'LeftHand', 'RightHand'].map((n) => [n, []]),
    );
    for (let i = 0; i <= 40; i++) {
      rig.apply(samplePose(clip, (duration(clip) * i) / 40));
      for (const [bone, samples] of trajectories) samples.push(point(bone));
    }
    for (const [bone, samples] of trajectories) {
      const initial = samples[0];
      expect(Math.max(...samples.map((p) => p.distanceTo(initial))), bone).toBeGreaterThan(0.075);
      if (bone.endsWith('Foot')) {
        const ys = samples.map((p) => p.y);
        expect(Math.max(...ys) - Math.min(...ys), bone).toBeGreaterThan(0.035);
      }
    }
  });

  it.each([
    { mode: 'normal' as const, movement: 'wander' },
    { mode: 'heroic' as const, movement: 'wander' },
    { mode: 'normal' as const, movement: 'chase' },
    { mode: 'heroic' as const, movement: 'chase' },
  ])(
    'matches both feet at actual $mode $movement speed through gait selection and playback caps',
    ({ mode, movement }) => {
      const mob = mobTemplateForDungeonDifficulty(MOBS[model.mob], 'wildheart_basin', mode);
      const speed = mob.moveSpeed * (movement === 'wander' ? 0.35 : 1);
      const expected = movement === 'wander' ? 'walk' : 'run';
      const def = VISUALS[`mob_${model.mob}`];
      expect(def.url).toBe(`models/creatures/community_wildheart_${model.key}.glb`);
      const state = travelState(speed);
      const base = desiredModelBaseState(state, false, false, true, def.gait, 'idle');
      expect(base).toBe(expected);
      // Also cross the hysteresis from the preceding opposite gait.
      expect(
        desiredModelBaseState(
          state,
          false,
          false,
          true,
          def.gait,
          expected === 'walk' ? 'run' : 'walk',
        ),
      ).toBe(expected);
      const clip = clips.get(expected === 'walk' ? 'Walk' : 'Run')!;
      const rate = locomotionTimeScale(base, state, def.walkRef, def.runRef)!;
      const scale = (def.height / SOURCE_HEIGHT) * mob.scale;
      for (const side of ['LeftFoot', 'RightFoot']) {
        const samples: Vector3[] = [];
        for (let i = 0; i <= 200; i++) {
          rig.apply(samplePose(clip, (duration(clip) * i) / 200));
          samples.push(point(side));
        }
        const ys = samples.map((p) => p.y),
          lo = Math.min(...ys),
          hi = Math.max(...ys);
        const stance = lo + (hi - lo) * 0.25;
        const speeds: number[] = [];
        for (let i = 1; i < samples.length; i++) {
          if (samples[i].y > stance || samples[i - 1].y > stance) continue;
          const v = (samples[i].z - samples[i - 1].z) / (duration(clip) / 200);
          if (v < 0) speeds.push(-v * scale * rate);
        }
        speeds.sort((a, b) => a - b);
        expect(speeds.length, side).toBeGreaterThan(5);
        const median = speeds[Math.floor(speeds.length / 2)];
        expect(Math.abs(median - speed), `${side}: ${median} vs ${speed}`).toBeLessThan(
          speed * 0.22,
        );
      }
    },
  );

  it('plays the full grounded fall and holds the final corpse pose', () => {
    rig.apply(samplePose(clips.get('Idle')!, 0));
    const standingAxis = point('Head').sub(point('Hips')).y;
    const death = clips.get('Death')!;
    expect(duration(death)).toBeGreaterThan(2);
    for (const phase of [0.3, 0.6, 0.9, 1]) {
      rig.apply(samplePose(death, duration(death) * phase));
      expect(Math.abs(floor()), `fall phase ${phase}`).toBeLessThan(0.04);
    }
    expect(Math.abs(point('Head').sub(point('Hips')).y)).toBeLessThan(standingAxis * 0.45);
    expectSamePose(
      samplePose(death, duration(death)),
      samplePose(death, duration(death) * 0.97),
      'corpse hold',
    );
  });
});
