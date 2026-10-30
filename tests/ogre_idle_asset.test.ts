import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';
import { VISUALS } from '../src/render/characters/manifest';

describe('native ogre lab idle', () => {
  it('keeps both soles on support throughout the native idle, not a frozen stride', async () => {
    const root = (
      await createGlbIO().read('public/models/chars/npcs/dev_meshy_ogre.glb')
    ).getRoot();
    const rig = createPoseRig(root);
    const point = (name: string) => {
      const bone = rig.named.get(`mixamorig:${name}`);
      assert(bone, name);
      return bone.getWorldPosition(new Vector3());
    };
    const support = ['LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase'];
    const rest = new Map(support.map((name) => [name, point(name)]));
    const idle = indexClip(root, 'MeshyOgreNative_Idle');
    rig.apply(samplePose(idle, 0));
    const first = new Map(support.map((name) => [name, point(name)]));
    const duration = Math.max(...[...idle.values()].map((channel) => channel.times.at(-1) ?? 0));
    for (let frame = 0; frame <= 60; frame++) {
      const time = (duration * frame) / 60;
      rig.apply(samplePose(idle, time));
      for (const name of support) {
        const reference = rest.get(name);
        const initial = first.get(name);
        assert(reference && initial);
        expect(
          Math.abs(point(name).y - reference.y),
          `${name}: no lifted foot at ${time}s`,
        ).toBeLessThan(0.06);
        expect(
          point(name).distanceTo(initial),
          `${name}: no step or foot slide at ${time}s`,
        ).toBeLessThan(0.025);
      }
      expect(
        Math.abs(point('LeftToeBase').y - point('RightToeBase').y),
        'both soles level',
      ).toBeLessThan(0.015);
      expect(
        Math.abs(point('LeftFoot').z - point('RightFoot').z),
        'no held walking stride',
      ).toBeLessThan(0.24);
    }
  });

  it('plays the separate native Idle_11 as a seamless animated loop', async () => {
    await MeshoptDecoder.ready;
    const document = await new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
      .read('public/models/chars/npcs/dev_meshy_ogre.glb');
    const idle = document
      .getRoot()
      .listAnimations()
      .find((animation) => animation.getName() === 'MeshyOgreNative_Idle');
    assert(idle, 'native ogre idle must exist');
    expect(
      document
        .getRoot()
        .listNodes()
        .find((node) => node.getName() === 'dev_meshy_ogre_Rig')
        ?.getExtras().idle_recipe,
    ).toContain('Native Idle_11');
    expect(VISUALS.npc_dev_meshy_ogre.clips).toMatchObject({
      idle: 'MeshyOgreNative_Idle',
      combatIdle: 'MeshyOgreNative_Idle',
    });
    const moving = new Set<string>();
    for (const channel of idle.listChannels()) {
      const node = channel.getTargetNode();
      const sampler = channel.getSampler();
      assert(node && sampler, 'idle channels must be bound to rig nodes and samplers');
      const name = node.getName();
      const input = sampler.getInput();
      const output = sampler.getOutput();
      assert(input && output, 'idle sampler must have input and output');
      const values = output.getArray();
      const size = output.getElementSize();
      const times = input.getArray();
      assert(values && times, 'idle accessors must contain decoded animation data');
      expect(times[times.length - 1] - times[0]).toBeCloseTo(45 / 24, 4);
      let changes = false;
      for (let component = 0; component < size; component++) {
        expect(values[values.length - size + component], `${name}: loop seam`).toBeCloseTo(
          values[component],
          5,
        );
        for (let i = component + size; i < values.length; i += size) {
          if (Math.abs(values[i] - values[component]) > 0.00001) changes = true;
        }
      }
      if (changes) moving.add(name);
      if (name === 'mixamorig:Hips' && channel.getTargetPath() === 'translation') {
        for (let i = 0; i < values.length; i += size) {
          expect(values[i], 'no horizontal root drift').toBeCloseTo(values[0], 5);
          expect(values[i + 2], 'no horizontal root drift').toBeCloseTo(values[2], 5);
        }
      }
    }
    expect([...moving]).toEqual(
      expect.arrayContaining([
        'mixamorig:Spine1',
        'mixamorig:Spine',
        'mixamorig:Head',
        'mixamorig:LeftArm',
        'mixamorig:RightArm',
      ]),
    );
  });

  it('archives rejected smart-rig variants instead of preloading them at boot', () => {
    expect(VISUALS.npc_dev_meshy_treant.lazyPreload).toBe(true);
    expect(VISUALS.npc_dev_skeleton_rogue.lazyPreload).toBe(true);
  });
});
