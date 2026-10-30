import { readFileSync } from 'node:fs';
import type { Root } from '@gltf-transform/core';
import { Matrix4, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { locomotionTimeScale } from '../src/render/characters/anim_state';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_COMPARISONS } from '../src/sim/content/dev_model_comparisons';
import { MOBS } from '../src/sim/data';

const FILE = 'public/models/creatures/community_sporeling.glb';
const CLIPS = [
  'Idle',
  'CombatIdle',
  'Walk',
  'Run',
  'Attack',
  'Kick',
  'Spin',
  'Combo',
  'Death',
  'Hit',
];
const duration = (c: ClipIndex) => Math.max(...[...c.values()].map((ch) => ch.times.at(-1) ?? 0));

describe('supplied animated community sporeling', () => {
  let root: Root;
  let rig: PoseRig, clips: Map<string, ClipIndex>;
  beforeAll(async () => {
    root = (await createGlbIO().read(FILE)).getRoot();
    rig = createPoseRig(root);
    clips = new Map(CLIPS.map((name) => [name, indexClip(root, `Sporeling_${name}`)]));
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
    expect(root.listSkins()[0].listJoints()).toHaveLength(23);
    expect(root.listMeshes()).toHaveLength(1);
    expect(root.listMeshes()[0].listPrimitives()[0].getIndices()!.getCount()).toBe(9994 * 3);
    expect(
      root
        .listNodes()
        .find((n) => n.getMesh())
        ?.getExtras().source_sha256,
    ).toBe('deb1fce490bca9295c1758089850bfe18885a743a7c76a6377f1acb0ae4ef110');
    const bytes = readFileSync(FILE),
      json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    expect(json.extensionsUsed).not.toContain('KHR_draco_mesh_compression');
    expect(json.images).toHaveLength(3);
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
  });

  it('binds every supplied clip to its own rig and closes standing/travel loops', () => {
    expect(
      root
        .listAnimations()
        .map((a) => a.getName())
        .sort(),
    ).toEqual(CLIPS.map((n) => `Sporeling_${n}`).sort());
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

  it('matches pursuit foot speed through the actual playback cap and mob scale', () => {
    const def = VISUALS.mob_glub,
      mob = MOBS.sporeling_gatherer,
      c = clips.get('Run')!;
    const rate = locomotionTimeScale(
      'run',
      { speed: mob.moveSpeed, backwards: false },
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
      expect(Math.abs(median - mob.moveSpeed), side).toBeLessThan(mob.moveSpeed * 0.22);
    }
  });

  it('uses an actual unarmed hand strike and a separate reaction', () => {
    const c = clips.get('Attack')!,
      positions: Vector3[] = [];
    for (let i = 0; i <= 30; i++) {
      rig.apply(samplePose(c, (duration(c) * i) / 30));
      positions.push(point('RightHand'));
    }
    expect(Math.max(...positions.map((p) => p.distanceTo(positions[0])))).toBeGreaterThan(0.12);
    expect(clips.get('Hit')).not.toEqual(clips.get('Idle'));
    expect(VISUALS.mob_glub.attach).toBeUndefined();
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

  it('replaces both populations with their separate supplied models and retains combat kits', () => {
    expect(visualKeyFor({ kind: 'mob', templateId: 'sporeling_gatherer' } as never)).toBe(
      'mob_glub',
    );
    expect(visualKeyFor({ kind: 'mob', templateId: 'corrupted_sporeling' } as never)).toBe(
      'mob_corrupted_sporeling',
    );
    expect(VISUALS.mob_corrupted_sporeling.url).toBe(
      'models/creatures/community_sporeling_infected.glb',
    );
    expect(VISUALS.mob_glub.url).toBe('models/creatures/community_sporeling.glb');
    expect(VISUALS.mob_glub.hover).toBeUndefined();
    expect(MOBS.sporeling_gatherer.aggroRadius).toBe(0);
    expect(MOBS.corrupted_sporeling.packFrenzy).toEqual({
      radius: 12,
      hasteMult: 1.3,
      duration: 8,
    });
    expect(DEV_MODEL_COMPARISONS.find((r) => r.id === 'sporeling')).toMatchObject({
      newVisual: 'mob_glub',
      installed: true,
    });
  });
});
