import { readFileSync } from 'node:fs';
import { Matrix4, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { locomotionTimeScale } from '../src/render/characters/anim_state';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_COMPARISONS } from '../src/sim/content/dev_model_comparisons';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';
import { MOBS } from '../src/sim/data';

const PATH = 'public/models/creatures/smart_spider.glb';
const LOOPS = ['Spider_Idle', 'Spider_CombatIdle', 'Spider_Walk', 'Spider_Run'];
const CLIPS = [...LOOPS, 'Spider_Bite', 'Spider_Lunge', 'Spider_Hit', 'Spider_Death'];
// Measured native final segments, including the source's asymmetric front toes.
const FEET: [string, number][] = [
  ['Bone_006', 0.109614],
  ['Bone_012', 0.15352],
  ['Bone_042', 0.15352],
  ['Bone_018', 0.152007],
  ['Bone_024', 0.150479],
  ['Bone_036', 0.128982],
  ['Bone_048', 0.150479],
  ['Bone_030', 0.152007],
];
const duration = (c: ClipIndex) => Math.max(...[...c.values()].map((s) => s.times.at(-1) ?? 0));
const keyFor = (id: string) => visualKeyFor({ kind: 'mob', templateId: id } as never);

describe('supplied Smart Rig spider replacement', () => {
  let rig: PoseRig;
  let clips: Map<string, ClipIndex>;
  beforeAll(async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    rig = createPoseRig(root);
    clips = new Map(root.listAnimations().map((a) => [a.getName(), indexClip(root, a.getName())]));
  });
  const clip = (name: string) => {
    const c = clips.get(name);
    if (!c) throw new Error(`Missing spider clip ${name}`);
    return c;
  };
  const point = (bone: string) => {
    const object = rig.named.get(bone);
    if (!object) throw new Error(`Missing spider bone ${bone}`);
    return object.getWorldPosition(new Vector3());
  };
  const feet = () =>
    FEET.map(([name, length]) => {
      const object = rig.named.get(name);
      if (!object) throw new Error(`Missing spider toe ${name}`);
      return object.localToWorld(new Vector3(0, length, 0));
    });

  it('preserves the original topology and rig with compressed PBR textures', async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(62);
    expect(root.listMeshes()).toHaveLength(1);
    expect(root.listMeshes()[0].listPrimitives()[0].getIndices()?.getCount()).toBe(103844 * 3);
    expect(
      root
        .listNodes()
        .find((n) => n.getMesh())
        ?.getExtras().source_sha256,
    ).toBe('3306d9b84af333472b29caaa8cb36483a7ff1c4d68db766a1aac28f268b06e9f');
    const bytes = readFileSync(PATH);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    expect(json.images).toHaveLength(3);
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
    expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
  });

  it('binds every baked channel and closes every loop without root drift', () => {
    expect([...clips.keys()].sort()).toEqual([...CLIPS].sort());
    for (const [name, c] of clips) {
      for (const [key, ch] of c) {
        expect(rig.rest.has(key), `${name}:${key}`).toBe(true);
        expect([...ch.values].every(Number.isFinite)).toBe(true);
      }
    }
    for (const name of LOOPS) {
      const c = clip(name),
        first = samplePose(c, 0),
        last = samplePose(c, duration(c));
      for (const [key, values] of first) {
        for (let i = 0; i < values.length; i++)
          expect(last.get(key)?.[i], key).toBeCloseTo(values[i], 3);
      }
      rig.apply(first);
      const start = point('Bone_000');
      for (let i = 0; i <= 30; i++) {
        rig.apply(samplePose(c, (duration(c) * i) / 30));
        expect(Math.abs(point('Bone_000').z - start.z)).toBeLessThan(0.001);
      }
    }
  });

  it('breathes with all eight toes planted, within shipping quantization tolerance', () => {
    const c = clip('Spider_Idle');
    rig.apply(samplePose(c, 0));
    const anchors = feet(),
      hips: number[] = [];
    for (let i = 0; i <= 40; i++) {
      rig.apply(samplePose(c, (duration(c) * i) / 40));
      hips.push(point('Bone_000').y);
      feet().forEach((p, index) => {
        expect(p.distanceTo(anchors[index])).toBeLessThan(0.035);
      });
    }
    expect(Math.max(...hips) - Math.min(...hips)).toBeGreaterThan(0.015);
  });

  it.each(['Spider_Walk', 'Spider_Run'])(
    '%s lifts each foot and retains four-foot support',
    (name) => {
      const c = clip(name),
        samples = FEET.map(() => [] as Vector3[]);
      for (let i = 0; i <= 120; i++) {
        rig.apply(samplePose(c, (duration(c) * i) / 120));
        feet().forEach((p, j) => {
          samples[j].push(p);
        });
      }
      for (const values of samples) {
        const ys = values.map((p) => p.y),
          zs = values.map((p) => p.z);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.17);
        expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.85);
      }
      for (let i = 0; i <= 120; i++) {
        const supported = samples.filter(
          (values) => values[i].y - Math.min(...values.map((p) => p.y)) < 0.065,
        );
        expect(supported.length, `${name}: frame ${i}`).toBeGreaterThanOrEqual(4);
      }
    },
  );

  it('matches pursuit foot speed at the fastest existing spider template speed', () => {
    const c = clip('Spider_Run');
    const speed = Math.max(
      ...Object.values(MOBS)
        .filter((m) => m.family === 'spider')
        .map((m) => m.moveSpeed),
    );
    const def = VISUALS.mob_spider;
    const rate = locomotionTimeScale('run', { speed, backwards: false }, def.walkRef, def.runRef);
    expect(rate).not.toBeNull();
    rig.apply(samplePose(c, duration(c) * 0.1));
    const start = feet()[0];
    rig.apply(samplePose(c, duration(c) * 0.4));
    const end = feet()[0];
    const footSpeed =
      (Math.abs(end.z - start.z) * (def.height / 1.7) * (rate ?? 0)) / (duration(c) * 0.3);
    expect(Math.abs(footSpeed - speed)).toBeLessThan(0.65);
    expect(def.gait).toEqual({ runEnter: 1.8, runExit: 1.6 });
  });

  it.each(['Spider_Bite', 'Spider_Lunge'])(
    '%s prepares then bites forward and recovers',
    (name) => {
      const c = clip(name);
      rig.apply(samplePose(c, 0));
      const start = point('Bone_003');
      rig.apply(samplePose(c, duration(c) * 0.3));
      const windup = point('Bone_003');
      rig.apply(samplePose(c, duration(c) * 0.48));
      expect(point('Bone_003').z - windup.z).toBeGreaterThan(0.35);
      rig.apply(samplePose(c, duration(c)));
      expect(point('Bone_003').distanceTo(start)).toBeLessThan(0.01);
    },
  );

  it('collapses to a grounded corpse and holds the final pose', async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    const skin = root.listSkins()[0],
      primitive = root.listMeshes()[0].listPrimitives()[0];
    const pos = primitive.getAttribute('POSITION')!,
      weights = primitive.getAttribute('WEIGHTS_0')!;
    const joints = primitive.getAttribute('JOINTS_0')!,
      inverse = skin.getInverseBindMatrices()!;
    const c = clip('Spider_Death');
    rig.apply(samplePose(c, 0));
    const standing = point('Bone_000').y;
    for (const phase of [0.25, 0.5, 0.75, 1]) {
      rig.apply(samplePose(c, duration(c) * phase));
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
      let floor = Infinity;
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        weights.getElement(i, w);
        joints.getElement(i, j);
        let y = 0;
        for (let k = 0; k < 4; k++) {
          const a = transforms[j[k]];
          y += w[k] * (a[1] * v[0] + a[5] * v[1] + a[9] * v[2] + a[13]);
        }
        floor = Math.min(floor, y);
      }
      expect(floor, `corpse floor at ${phase}`).toBeGreaterThan(-0.035);
      if (phase === 1) expect(floor).toBeLessThan(0.035);
    }
    expect(point('Bone_000').y).toBeLessThan(standing - 0.4);
    const settled = samplePose(c, duration(c) * 0.95),
      end = samplePose(c, duration(c));
    for (const [key, values] of settled) {
      for (let i = 0; i < values.length; i++)
        expect(end.get(key)?.[i], key).toBeCloseTo(values[i], 3);
    }
  });

  it('replaces living spiders while preserving eggs and gameplay data', () => {
    const spiders = Object.values(MOBS).filter(
      (m) =>
        m.family === 'spider' &&
        !m.id.startsWith('dev_') &&
        !['spider_egg', 'spider_egg_sac'].includes(m.id),
    );
    expect(spiders.length).toBeGreaterThan(5);
    for (const m of spiders) expect(keyFor(m.id), m.id).toBe('mob_spider');
    for (const id of ['spider_egg', 'spider_egg_sac'])
      expect(keyFor(id)).toBe('mob_spider_egg_sac');
    expect(VISUALS.mob_spider.url).toBe('models/creatures/smart_spider.glb');
    expect(VISUALS.mob_spider.animUrls).toBeUndefined();
    expect(DEV_MODEL_LAB_MOBS.dev_smart_spider).toMatchObject({
      name: 'Spider (Replaced)',
      aggroOnDamageOnly: true,
      loot: [],
    });
    expect(
      DEV_MODEL_LAB_MOB_LINEUP.filter((p) => p.templateId === 'dev_smart_spider'),
    ).toHaveLength(1);
    expect(DEV_MODEL_COMPARISONS.find((r) => r.id === 'spider')).toMatchObject({
      newVisual: 'mob_spider',
      installed: true,
    });
  });
});
