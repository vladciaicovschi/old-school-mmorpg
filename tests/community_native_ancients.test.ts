import { readFileSync } from 'node:fs';
import type { Root } from '@gltf-transform/core';
import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { locomotionTimeScale } from '../src/render/characters/anim_state';
import { clipNamesOf } from '../src/render/characters/clip_names_core';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_COMPARISONS } from '../src/sim/content/dev_model_comparisons';
import { MOBS } from '../src/sim/data';
import { createSkinnedPoseFloor } from './helpers/skinned_pose_floor';

const MODELS = [
  {
    key: 'mob_wreck_warden',
    asset: 'community_wreck_warden',
    mob: 'the_wreck_warden',
    joints: 62,
    triangles: 103815,
    clips: 14,
    sha: '633f7cf05452dc630b3ebab366f069b8014f7307534ec624d2f7e1f903a76ca8',
  },
  {
    key: 'mob_treant_warrior',
    asset: 'community_treant_warrior',
    mob: 'dev_treant_warrior',
    joints: 28,
    triangles: 169831,
    clips: 11,
    sha: 'fe3fe7b7b59941a61379a535e9f77b9da1b75b551a9af4263066431df1e16cea',
  },
  {
    key: 'mob_ancient_guardian',
    asset: 'community_verdant_golem',
    mob: 'ancient_guardian',
    joints: 50,
    triangles: 103886,
    clips: 20,
    sha: '5103fcb35755e29f2d181ddc3dd01dd78b7c7dc1d3d43a546460a5925cfe5279',
  },
  {
    key: 'mob_waking_warden',
    asset: 'community_verdant_golem',
    mob: 'waking_warden',
    joints: 50,
    triangles: 103886,
    clips: 20,
    sha: '5103fcb35755e29f2d181ddc3dd01dd78b7c7dc1d3d43a546460a5925cfe5279',
  },
];
const duration = (clip: ClipIndex) =>
  Math.max(...[...clip.values()].map((c) => c.times.at(-1) ?? 0));

describe.each(MODELS)('$asset supplied animation import', (model) => {
  let root: Root, rig: PoseRig, floor: () => number;
  const def = VISUALS[model.key];
  const mob = MOBS[model.mob];
  beforeAll(async () => {
    root = (await createGlbIO().read(`public/models/creatures/${model.asset}.glb`)).getRoot();
    rig = createPoseRig(root);
    floor = createSkinnedPoseFloor(root, rig);
  });
  const clip = (name: string) => indexClip(root, name);
  const point = (name: string) => {
    const joint = root
      .listSkins()[0]
      .listJoints()
      .find((bone) => bone.getName().split(':').at(-1) === name)!;
    return rig.named.get(joint.getName())!.getWorldPosition(new Vector3());
  };
  it('preserves source geometry, skin and fingerprint through Meshopt and KTX2', () => {
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(model.joints);
    expect(
      root
        .listMeshes()
        .flatMap((mesh) => mesh.listPrimitives())
        .reduce((n, primitive) => n + primitive.getIndices()!.getCount() / 3, 0),
    ).toBe(model.triangles);
    expect(
      root
        .listNodes()
        .find((node) => node.getMesh())!
        .getExtras().source_sha256,
    ).toBe(model.sha);
    const bytes = readFileSync(`public/models/creatures/${model.asset}.glb`);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
    );
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
    for (const texture of root.listTextures())
      expect(Math.max(...texture.getSize()!)).toBeLessThanOrEqual(2048);
    expect(def.authoredAtlas).toBe(true);
    expect(def.matte).toBe(true);
    expect(def.animUrls).toBeUndefined();
  });
  it('binds all supplied clips and exposes all of them in the animation editor', () => {
    const names = root.listAnimations().map((action) => action.getName());
    expect(names).toHaveLength(model.clips);
    expect(new Set(clipNamesOf(def))).toEqual(new Set(names));
    expect(def.clips.hit).toBeUndefined();
    for (const name of names)
      for (const [key, channel] of clip(name)) {
        expect(rig.rest.has(key), `${name}:${key}`).toBe(true);
        expect([...channel.values].every(Number.isFinite)).toBe(true);
      }
  });
  it('closes both stances and locomotion without pose pops', () => {
    for (const name of [def.clips.idle, def.clips.combatIdle!, def.clips.walk!, def.clips.run!]) {
      const c = clip(name),
        first = samplePose(c, 0),
        last = samplePose(c, duration(c));
      for (const [key, values] of first)
        for (let i = 0; i < values.length; i++)
          expect(last.get(key)![i], `${name}:${key}`).toBeCloseTo(values[i], 3);
    }
  });
  it.each(['walk', 'run'] as const)('matches %s stance-foot speed at actual mob scale', (state) => {
    const c = clip(def.clips[state]!),
      speed = mob.moveSpeed * (state === 'walk' ? 0.35 : 1);
    const rate = locomotionTimeScale(state, { speed, backwards: false }, def.walkRef, def.runRef)!;
    const scale = (def.height / 1.7) * mob.scale;
    for (const foot of ['LeftFoot', 'RightFoot']) {
      const samples: Vector3[] = [];
      for (let i = 0; i <= 200; i++) {
        rig.apply(samplePose(c, (duration(c) * i) / 200));
        samples.push(point(foot));
      }
      const ys = samples.map((p) => p.y),
        min = Math.min(...ys),
        max = Math.max(...ys),
        threshold = min + (max - min) * 0.25;
      expect(max - min).toBeGreaterThan(0.025);
      const speeds: number[] = [];
      for (let i = 1; i < samples.length; i++) {
        if (samples[i].y > threshold || samples[i - 1].y > threshold) continue;
        const velocity = (samples[i].z - samples[i - 1].z) / (duration(c) / 200);
        if (velocity < 0) speeds.push(-velocity * scale * rate);
      }
      speeds.sort((a, b) => a - b);
      expect(speeds.length, foot).toBeGreaterThan(5);
      expect(Math.abs(speeds[Math.floor(speeds.length / 2)] - speed), foot).toBeLessThan(
        speed * 0.25,
      );
    }
  });
  it('plays a full grounded death and holds the corpse', () => {
    rig.apply(samplePose(clip(def.clips.idle), 0));
    const standingAxis = Math.abs(point('Head').sub(point('Hips')).y);
    const c = clip(def.clips.death!);
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      rig.apply(samplePose(c, duration(c) * p));
      expect(floor()).toBeGreaterThan(-0.04);
      expect(floor()).toBeLessThan(0.05);
    }
    expect(Math.abs(point('Head').sub(point('Hips')).y)).toBeLessThan(standingAxis * 0.55);
    const first = samplePose(c, duration(c) - 0.1),
      last = samplePose(c, duration(c));
    for (const [key, values] of first)
      for (let i = 0; i < values.length; i++) expect(last.get(key)![i]).toBeCloseTo(values[i], 3);
  });
  it('retains source airborne clearance in the optional kick', () => {
    const name = root
      .listAnimations()
      .find((action) => action.getName().endsWith('_Spartan_Kick'))!
      .getName();
    const c = clip(name),
      heights: number[] = [];
    for (let i = 0; i <= 40; i++) {
      rig.apply(samplePose(c, (duration(c) * i) / 40));
      heights.push(floor());
    }
    expect(Math.min(...heights)).toBeGreaterThan(-0.04);
    if (model.key === 'mob_wreck_warden') expect(Math.max(...heights)).toBeGreaterThan(0.03);
    if (model.key === 'mob_treant_warrior') expect(Math.max(...heights)).toBeGreaterThan(0.01);
  });
});

it('keeps Treant Warrior separate and replaces only the intended production bodies', () => {
  const keyFor = (templateId: string) => visualKeyFor({ kind: 'mob', templateId } as never);
  expect(keyFor('the_wreck_warden')).toBe('mob_wreck_warden');
  expect(keyFor('ancient_guardian')).toBe('mob_ancient_guardian');
  expect(keyFor('waking_warden')).toBe('mob_waking_warden');
  for (const id of ['orchard_treant', 'treant_elder', 'gravenbark_shambler'])
    expect(keyFor(id)).toBe('mob_treant');
  expect(keyFor('dev_treant_v2')).toBe('npc_dev_treant_v2');
  expect(DEV_MODEL_COMPARISONS.find((row) => row.id === 'treant_warrior')).toMatchObject({
    newVisual: 'mob_treant_warrior',
    combatMobId: 'dev_treant_warrior',
  });
  expect(
    DEV_MODEL_COMPARISONS.find((row) => row.id === 'treant_warrior')!.installed,
  ).toBeUndefined();
  expect(VISUALS.mob_ancient_guardian.clips.walk).toBe('VerdantGolem_Slow_Orc_Walk');
  expect(MOBS.dev_ancient_guardian.stoneskin).toEqual(MOBS.ancient_guardian.stoneskin);
  expect(MOBS.dev_waking_warden.aoePulse).toEqual(MOBS.waking_warden.aoePulse);
  expect(VISUALS.mob_waking_warden.runRef).toBeGreaterThan(VISUALS.mob_ancient_guardian.runRef!);
});
