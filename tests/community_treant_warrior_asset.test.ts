import { readFileSync } from 'node:fs';
import type { Root } from '@gltf-transform/core';
import { Matrix4, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { locomotionTimeScale } from '../src/render/characters/anim_state';

const FILE = 'public/models/creatures/community_treant_warrior.glb';
const CLIPS = ['Idle', 'CombatIdle', 'Walk', 'Run', 'Attack', 'Combo', 'Death', 'Hit'];
const duration = (c: ClipIndex) => Math.max(...[...c.values()].map((ch) => ch.times.at(-1) ?? 0));

describe('separate supplied community Treant Warrior', () => {
  let root: Root;
  let rig: PoseRig, clips: Map<string, ClipIndex>;
  beforeAll(async () => {
    root = (await createGlbIO().read(FILE)).getRoot();
    rig = createPoseRig(root);
    clips = new Map(CLIPS.map((name) => [name, indexClip(root, `TreantWarrior_${name}`)]));
  });
  const point = (name: string) =>
    rig.named.get(`mixamorig:${name}`)!.getWorldPosition(new Vector3());
  const floor = () => {
    const skin = root.listSkins()[0],
      primitive = root.listMeshes()[0].listPrimitives()[0];
    const pos = primitive.getAttribute('POSITION')!,
      weights = primitive.getAttribute('WEIGHTS_0')!,
      joints = primitive.getAttribute('JOINTS_0')!,
      inverse = skin.getInverseBindMatrices()!;
    const m: number[] = [],
      v: number[] = [],
      w: number[] = [],
      j: number[] = [];
    const transforms = skin.listJoints().map((bone, i) => {
      inverse.getElement(i, m);
      return new Matrix4().multiplyMatrices(
        rig.named.get(bone.getName())!.matrixWorld,
        new Matrix4().fromArray(m),
      ).elements;
    });
    let lowest = Infinity;
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v);
      weights.getElement(i, w);
      joints.getElement(i, j);
      let y = 0;
      for (let k = 0; k < 4; k++) {
        const a = transforms[j[k]];
        y += w[k] * (a[1] * v[0] + a[5] * v[1] + a[9] * v[2] + a[13]);
      }
      lowest = Math.min(lowest, y);
    }
    return lowest;
  };

  it('preserves native geometry, weights and original maps through Meshopt/KTX2', () => {
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(28);
    expect(root.listMeshes()).toHaveLength(1);
    expect(root.listMeshes()[0].listPrimitives()[0].getIndices()!.getCount()).toBe(169831 * 3);
    expect(
      root
        .listNodes()
        .find((n) => n.getMesh())
        ?.getExtras().source_sha256,
    ).toBe('c3395950f829e77c58cc6f8c36b7385b9806ff93ebb7cfe5a82084fa5bb9b7d0');
    const bytes = readFileSync(FILE),
      json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    expect(json.extensionsUsed).not.toContain('KHR_draco_mesh_compression');
    expect(json.images).toHaveLength(1);
    const material = root.listMaterials()[0];
    expect(material.getAlphaMode()).toBe('OPAQUE');
    expect(material.getMetallicFactor()).toBe(0);
    expect(material.getRoughnessFactor()).toBe(1);
    for (const texture of root.listTextures()) {
      expect(Math.max(...texture.getSize()!)).toBeLessThanOrEqual(2048);
    }
    const primitive = root.listMeshes()[0].listPrimitives()[0];
    const weights = primitive.getAttribute('WEIGHTS_0')!,
      values: number[] = [];
    for (let i = 0; i < weights.getCount(); i++) {
      weights.getElement(i, values);
      const sum = values.reduce((total, weight) => total + weight, 0);
      if (!values.every(Number.isFinite) || Math.abs(sum - 1) > 0.001) {
        throw new Error(`Invalid skin weights at vertex ${i}: ${values.join(', ')}`);
      }
    }
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
  });

  it('binds every supplied clip to its own rig and closes standing/travel loops', () => {
    expect(
      root
        .listAnimations()
        .map((a) => a.getName())
        .sort(),
    ).toEqual(CLIPS.map((n) => `TreantWarrior_${n}`).sort());
    for (const [name, clip] of clips) {
      for (const [key, ch] of clip) {
        expect(rig.rest.has(key), `${name}:${key}`).toBe(true);
        expect([...ch.values].every(Number.isFinite)).toBe(true);
      }
    }
    for (const name of ['Idle', 'CombatIdle', 'Walk', 'Run']) {
      const c = clips.get(name)!,
        first = samplePose(c, 0),
        last = samplePose(c, duration(c));
      for (const [key, a] of first)
        for (let i = 0; i < a.length; i++)
          expect(last.get(key)![i], `${name}:${key}`).toBeCloseTo(a[i], 3);
    }
  });

  it.each(['Walk', 'Run'])(
    '%s articulates both feet instead of sliding the entire mesh',
    (name) => {
      const c = clips.get(name)!,
        samples = [[], []] as Vector3[][];
      for (let i = 0; i <= 40; i++) {
        rig.apply(samplePose(c, (duration(c) * i) / 40));
        samples[0].push(point('LeftFoot'));
        samples[1].push(point('RightFoot'));
      }
      for (const foot of samples) {
        for (const axis of ['y', 'z'] as const) {
          const values = foot.map((p) => p[axis]);
          expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.04);
        }
      }
    },
  );

  it.each([
    { state: 'walk' as const, clip: 'Walk', speed: 2.275 },
    { state: 'run' as const, clip: 'Run', speed: 6.5 },
  ])(
    'matches $state foot speed through the actual playback cap and mob scale',
    ({ state, clip, speed }) => {
      const c = clips.get(clip)!;
      const def = { height: 2.8, walkRef: 2.2876924873, runRef: 4.4232062303 };
      const mob = { scale: 1 };
      const rate = locomotionTimeScale(
        state,
        { speed, backwards: false },
        def.walkRef,
        def.runRef,
      )!;
      const normalizedScale = (def.height / 1.7) * mob.scale;
      for (const side of ['LeftFoot', 'RightFoot']) {
        const samples: Vector3[] = [];
        for (let i = 0; i <= 200; i++) {
          rig.apply(samplePose(c, (duration(c) * i) / 200));
          samples.push(point(side));
        }
        const ys = samples.map((p) => p.y),
          lo = Math.min(...ys),
          hi = Math.max(...ys),
          stance = lo + (hi - lo) * 0.25;
        const speeds: number[] = [];
        for (let i = 1; i < samples.length; i++) {
          if (samples[i].y > stance || samples[i - 1].y > stance) continue;
          const v = (samples[i].z - samples[i - 1].z) / (duration(c) / 200);
          if (v < 0) speeds.push(-v * normalizedScale * rate);
        }
        speeds.sort((a, b) => a - b);
        expect(speeds.length).toBeGreaterThan(5);
        const median = speeds[Math.floor(speeds.length / 2)];
        expect(Math.abs(median - speed), side).toBeLessThan(speed * 0.22);
      }
    },
  );

  it('preserves the native hand strike and keeps combo and reaction distinct', () => {
    const c = clips.get('Attack')!,
      positions: Vector3[] = [];
    for (let i = 0; i <= 30; i++) {
      rig.apply(samplePose(c, (duration(c) * i) / 30));
      positions.push(point('RightHand'));
    }
    expect(Math.max(...positions.map((p) => p.distanceTo(positions[0])))).toBeGreaterThan(0.12);
    expect(clips.get('Hit')).not.toEqual(clips.get('Idle'));
    expect(duration(clips.get('Combo')!)).toBeGreaterThan(duration(c) * 2);
  });

  it('plays the complete fall, keeps the corpse above ground and holds the landing', () => {
    const c = clips.get('Death')!;
    rig.apply(samplePose(clips.get('Idle')!, 0));
    const standingAxis = point('Head').sub(point('Hips')).y;
    for (const p of [0.3, 0.6, 0.9, 1]) {
      rig.apply(samplePose(c, duration(c) * p));
      expect(floor()).toBeGreaterThan(-0.035);
    }
    expect(floor()).toBeLessThan(0.04);
    // A wide mushroom cap supports the fallen body above its standing pelvis.
    // Verify the torso actually lies over, rather than assuming humanoid height.
    expect(Math.abs(point('Head').sub(point('Hips')).y)).toBeLessThan(standingAxis * 0.4);
    const a = samplePose(c, duration(c) * 0.97),
      b = samplePose(c, duration(c));
    for (const [key, v] of a)
      for (let i = 0; i < v.length; i++) expect(b.get(key)![i]).toBeCloseTo(v[i], 3);
  });

  it('keeps a relaxed idle with the hands below the head', () => {
    const c = clips.get('Idle')!;
    for (const phase of [0, 0.3, 0.6, 1]) {
      rig.apply(samplePose(c, duration(c) * phase));
      expect(point('Head').y - point('RightHand').y).toBeGreaterThan(0.25);
      expect(point('Head').y - point('LeftHand').y).toBeGreaterThan(0.25);
      expect(floor()).toBeGreaterThan(-0.035);
      expect(floor()).toBeLessThan(0.04);
    }
  });
});
