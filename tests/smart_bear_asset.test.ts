import { readFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const PATH = 'public/models/creatures/smart_bear.glb';
const TOES = ['Bone_003', 'Bone_009', 'Bone_023', 'Bone_029'];
const LOOPS = ['Bear_Idle', 'Bear_CombatIdle', 'Bear_Walk', 'Bear_Run'];
const CLIPS = [
  ...LOOPS,
  'Bear_SwipeLeft',
  'Bear_SwipeRight',
  'Bear_DoubleSlam',
  'Bear_Hit',
  'Bear_Death',
  'Bear_Roar',
];
const duration = (clip: ClipIndex) =>
  Math.max(...[...clip.values()].map((ch) => ch.times.at(-1) ?? 0));

describe('owner-supplied Smart Rig bear', () => {
  let rig: PoseRig;
  let clips: Map<string, ClipIndex>;
  beforeAll(async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    rig = createPoseRig(root);
    clips = new Map(root.listAnimations().map((a) => [a.getName(), indexClip(root, a.getName())]));
  });
  const clip = (name: string) => {
    const result = clips.get(name);
    if (!result) throw new Error(`Missing bear clip ${name}`);
    return result;
  };
  const point = (bone: string) => {
    const node = rig.named.get(bone);
    if (!node) throw new Error(`Missing bear bone ${bone}`);
    return node.getWorldPosition(new Vector3());
  };

  it('preserves the supplied skin and original mesh, with compressed 2k PBR maps', async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(34);
    expect(root.listMeshes()).toHaveLength(1);
    const mesh = root.listMeshes()[0];
    expect(
      root
        .listNodes()
        .find((node) => node.getMesh() === mesh)
        ?.getExtras().source_sha256,
    ).toBe('e0dffd26e673563560c6b5124b9ce4295dd65bb373c1ffe222e0f40afedcfe20');
    expect(mesh.listPrimitives()[0].getIndices()?.getCount()).toBe(103783 * 3);
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

  it('binds every authored channel to the target and exports unit quaternions', () => {
    expect([...clips.keys()].sort()).toEqual([...CLIPS].sort());
    for (const [name, channels] of clips) {
      for (const [key, ch] of channels) {
        expect(rig.rest.has(key), `${name}: ${key}`).toBe(true);
        expect([...ch.values].every(Number.isFinite), name).toBe(true);
        if (ch.path !== 'rotation') continue;
        for (let i = 0; i < ch.values.length; i += 4) {
          expect(Math.hypot(...ch.values.slice(i, i + 4)), `${name}: ${key}`).toBeCloseTo(1, 3);
        }
      }
    }
  });

  it('closes loops without root drift or a bind-pose snap', () => {
    for (const name of LOOPS) {
      const channels = clip(name);
      const first = samplePose(channels, 0);
      const last = samplePose(channels, duration(channels));
      for (const [key, a] of first) {
        const b = last.get(key);
        expect(b, key).toBeDefined();
        if (!b) continue;
        for (let i = 0; i < a.length; i++) expect(b[i], `${name}: ${key}`).toBeCloseTo(a[i], 3);
      }
      const root = channels.get('Bone_000|translation');
      if (!root) throw new Error('Bear has no root translation');
      const xs = [...root.values].filter((_, i) => i % 3 === 0);
      const zs = [...root.values].filter((_, i) => i % 3 === 2);
      // A bounded sideways weight shift closes at the seam without travelling.
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.12);
      expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(0.001);
    }
  });

  it('breathes while keeping idle paws planted', () => {
    const channels = clip('Bear_Idle');
    rig.apply(samplePose(channels, 0));
    const anchors = TOES.map(point);
    const hips: number[] = [];
    for (let frame = 0; frame <= 60; frame++) {
      rig.apply(samplePose(channels, (duration(channels) * frame) / 60));
      hips.push(point('Bone_000').y);
      for (const [i, bone] of TOES.entries())
        expect(point(bone).distanceTo(anchors[i]), bone).toBeLessThan(0.015);
    }
    expect(Math.max(...hips) - Math.min(...hips)).toBeGreaterThan(0.008);
  });

  it('walks with visible paw clearance and a rolling transfer of body weight', () => {
    const channels = clip('Bear_Walk');
    const hips: Vector3[] = [];
    const paws = TOES.map(() => [] as number[]);
    for (let frame = 0; frame <= 120; frame++) {
      rig.apply(samplePose(channels, (duration(channels) * frame) / 120));
      hips.push(point('Bone_000'));
      TOES.forEach((bone, i) => {
        paws[i].push(point(bone).y);
      });
    }
    const xs = hips.map((p) => p.x);
    const ys = hips.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.07);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.035);
    for (const heights of paws)
      expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.15);
  });

  it.each([
    ['Bear_SwipeLeft', 'Bone_023', -1],
    ['Bear_SwipeRight', 'Bone_029', 1],
  ] as const)('%s rakes down and across from a high outside windup', (name, active, side) => {
    const channels = clip(name);
    const wrist = active === 'Bone_023' ? 'Bone_025' : 'Bone_031';
    rig.apply(samplePose(channels, duration(channels) * 0.32));
    const windup = point(active);
    const windupWrist = point(wrist);
    rig.apply(samplePose(channels, duration(channels) * 0.6));
    const strike = point(active);
    expect(windup.y).toBeGreaterThan(0.72);
    expect((windup.x - strike.x) * side).toBeGreaterThan(0.5);
    expect(windup.y - strike.y).toBeGreaterThan(0.32);
    // Cross-body travel leads the stroke; forward reach no longer reads as a jab.
    // Measure reach at the wrist; turning the broad paw moves its claw tip.
    expect(point(wrist).z - windupWrist.z).toBeGreaterThan(0.3);
    // The recovery returns the attacking paw to the same support point.
    rig.apply(samplePose(channels, 0));
    const start = point(active);
    rig.apply(samplePose(channels, duration(channels)));
    expect(point(active).distanceTo(start)).toBeLessThan(0.01);
  });

  it.each([
    ['Bear_SwipeLeft', 'Bone_023'],
    ['Bear_SwipeRight', 'Bone_029'],
  ])('%s follows a rounded sweep with continuous elbow and paw travel', (name, active) => {
    const channels = clip(name);
    const at = (phase: number) => {
      rig.apply(samplePose(channels, duration(channels) * phase));
      return point(active);
    };
    const start = at(0.32);
    const end = at(0.6);
    const middle = at(0.46);
    const chord = end.clone().sub(start).normalize();
    const offset = middle.clone().sub(start);
    expect(offset.clone().addScaledVector(chord, -offset.dot(chord)).length()).toBeGreaterThan(
      0.26,
    );
    const samples: Vector3[] = [];
    let previous: Vector3[] | undefined;
    for (let frame = 0; frame <= 120; frame++) {
      const phase = frame / 120;
      rig.apply(samplePose(channels, duration(channels) * phase));
      const positions = [...TOES, 'Bone_006', 'Bone_012', 'Bone_026', 'Bone_032'].map(point);
      if (previous)
        for (const [i, p] of positions.entries())
          expect(p.distanceTo(previous[i]), `${name}: joint snap`).toBeLessThan(0.1);
      if (phase >= 0.37 && phase <= 0.57) {
        samples.push(point(active));
        if (samples.length > 1)
          expect(
            samples.at(-1)?.distanceTo(samples[samples.length - 2]),
            'mid-sweep pause',
          ).toBeGreaterThan(0.015);
      }
      previous = positions;
    }
    const width = Math.abs(end.x - start.x);
    const depth = Math.abs(end.z - start.z);
    expect(width).toBeGreaterThan(depth * 3);
  });

  it.each([
    ['Bear_SwipeLeft', 'Bone_025', -1],
    ['Bear_SwipeRight', 'Bone_031', 1],
  ] as const)('%s presents the broad underside into the diagonal sweep', (name, wrist, side) => {
    const channels = clip(name);
    const bone = rig.named.get(wrist);
    if (!bone) throw new Error(`Missing bear wrist ${wrist}`);
    rig.apply(samplePose(channels, 0));
    const sole = new Vector3(0, -1, 0).applyQuaternion(
      bone.getWorldQuaternion(new Quaternion()).invert(),
    );
    rig.apply(samplePose(channels, duration(channels) * 0.46));
    const normal = sole.clone().applyQuaternion(bone.getWorldQuaternion(new Quaternion()));
    expect(-side * normal.x).toBeGreaterThan(0.35);
    expect(normal.y).toBeLessThan(-0.65);
    rig.apply(samplePose(channels, duration(channels)));
    expect(sole.applyQuaternion(bone.getWorldQuaternion(new Quaternion())).y).toBeLessThan(-0.999);
  });

  it.each(['Bear_Walk', 'Bear_Run'])(
    '%s swings all four paws without reversing a knee mid-stride',
    (name) => {
      const channels = clip(name);
      const joints = [...TOES, 'Bone_006', 'Bone_012', 'Bone_026', 'Bone_032'];
      const samples = joints.map(() => [] as Vector3[]);
      for (let frame = 0; frame <= 120; frame++) {
        rig.apply(samplePose(channels, (duration(channels) * frame) / 120));
        for (const [i, bone] of joints.entries()) samples[i].push(point(bone));
      }
      for (const [i, positions] of samples.entries()) {
        const ys = positions.map((p) => p.y);
        const zs = positions.map((p) => p.z);
        if (i < TOES.length) {
          expect(Math.max(...ys) - Math.min(...ys), joints[i]).toBeGreaterThan(
            name === 'Bear_Run' ? 0.17 : 0.07,
          );
          expect(Math.max(...zs) - Math.min(...zs), joints[i]).toBeGreaterThan(
            name === 'Bear_Run' ? 0.75 : 0.4,
          );
          expect(Math.min(...ys), `${name}: paw below floor`).toBeGreaterThan(0.065);
        }
        for (let j = 1; j < positions.length; j++)
          expect(
            positions[j].distanceTo(positions[j - 1]),
            `${name}: ${joints[i]} snap`,
          ).toBeLessThan(0.075);
      }
    },
  );

  it.each(['Bear_Walk', 'Bear_Run'])(
    '%s reference speed matches the shipped paw support velocity',
    (name) => {
      const channels = clip(name);
      const def = VISUALS.npc_dev_smart_bear;
      rig.apply(samplePose(channels, duration(channels) * 0.12));
      const start = point('Bone_003');
      rig.apply(samplePose(channels, duration(channels) * 0.32));
      const end = point('Bone_003');
      const measured = (((start.z - end.z) / (duration(channels) * 0.2)) * def.height) / 1.7;
      const reference = name === 'Bear_Run' ? def.runRef : def.walkRef;
      if (reference === undefined) throw new Error('Missing bear speed reference');
      expect(Math.abs(measured / reference - 1)).toBeLessThan(0.025);
    },
  );

  it('swipes with one front paw while the other three support the body', () => {
    for (const [name, active] of [
      ['Bear_SwipeLeft', 'Bone_023'],
      ['Bear_SwipeRight', 'Bone_029'],
    ]) {
      const channels = clip(name);
      rig.apply(samplePose(channels, 0));
      const anchors = TOES.map(point);
      for (let frame = 0; frame <= 120; frame++) {
        rig.apply(samplePose(channels, (duration(channels) * frame) / 120));
        for (const [i, bone] of TOES.entries()) {
          if (bone !== active)
            expect(point(bone).distanceTo(anchors[i]), `${name}: support paw`).toBeLessThan(0.01);
        }
      }
    }
  });

  it('rears onto planted hind paws and brings both front paws down together', () => {
    const channels = clip('Bear_DoubleSlam');
    rig.apply(samplePose(channels, 0));
    const anchors = TOES.map(point);
    const head = point('Bone_020');
    rig.apply(samplePose(channels, duration(channels) * 0.4));
    expect(point('Bone_020').y - head.y).toBeGreaterThan(0.5);
    const raised = ['Bone_023', 'Bone_029'].map(point);
    for (const paw of raised) expect(paw.y).toBeGreaterThan(1.2);
    const raisedWrists = ['Bone_025', 'Bone_031'].map(point);
    rig.apply(samplePose(channels, duration(channels) * 0.68));
    ['Bone_023', 'Bone_029'].forEach((bone, i) => {
      expect(raised[i].y - point(bone).y).toBeGreaterThan(0.8);
      expect(point(i === 0 ? 'Bone_025' : 'Bone_031').z - raisedWrists[i].z).toBeGreaterThan(0.44);
    });
    let previous: Vector3[] | undefined;
    for (let frame = 0; frame <= 120; frame++) {
      rig.apply(samplePose(channels, (duration(channels) * frame) / 120));
      for (let i = 0; i < 2; i++)
        expect(point(TOES[i]).distanceTo(anchors[i]), 'hind support').toBeLessThan(0.01);
      const positions = [...TOES, 'Bone_006', 'Bone_012', 'Bone_026', 'Bone_032'].map(point);
      if (previous)
        for (const [i, p] of positions.entries())
          expect(p.distanceTo(previous[i])).toBeLessThan(0.1);
      previous = positions;
    }
    for (const [i, bone] of TOES.entries())
      expect(point(bone).distanceTo(anchors[i])).toBeLessThan(0.01);
  });

  it.each([
    ['Bone_025', -1],
    ['Bone_031', 1],
  ] as const)('double slam rounds %s inward with broad-paw contact', (wrist, side) => {
    const channels = clip('Bear_DoubleSlam');
    const bone = rig.named.get(wrist);
    if (!bone) throw new Error(`Missing bear wrist ${wrist}`);
    rig.apply(samplePose(channels, 0));
    const sole = new Vector3(0, -1, 0).applyQuaternion(
      bone.getWorldQuaternion(new Quaternion()).invert(),
    );
    rig.apply(samplePose(channels, duration(channels) * 0.44));
    const start = point(wrist);
    rig.apply(samplePose(channels, duration(channels) * 0.68));
    const end = point(wrist);
    rig.apply(samplePose(channels, duration(channels) * 0.56));
    const offset = point(wrist).sub(start);
    const chord = end.sub(start).normalize();
    expect(offset.addScaledVector(chord, -offset.dot(chord)).length()).toBeGreaterThan(0.25);
    const normal = sole.clone().applyQuaternion(bone.getWorldQuaternion(new Quaternion()));
    expect(-side * normal.x).toBeGreaterThan(0.35);
    expect(normal.y).toBeLessThan(-0.65);
    let previous: Vector3 | undefined;
    for (let frame = 0; frame <= 24; frame++) {
      const phase = 0.47 + (0.18 * frame) / 24;
      rig.apply(samplePose(channels, duration(channels) * phase));
      const current = point(wrist);
      if (previous) expect(current.distanceTo(previous)).toBeGreaterThan(0.012);
      previous = current;
    }
    rig.apply(samplePose(channels, duration(channels)));
    expect(sole.applyQuaternion(bone.getWorldQuaternion(new Quaternion())).y).toBeLessThan(-0.999);
  });

  it('keeps the corpse and attack skinned meshes above the floor', async () => {
    const root = (await createGlbIO().read(PATH)).getRoot();
    const skin = root.listSkins()[0];
    const primitive = root.listMeshes()[0].listPrimitives()[0];
    const positions = primitive.getAttribute('POSITION');
    const weights = primitive.getAttribute('WEIGHTS_0');
    const joints = primitive.getAttribute('JOINTS_0');
    const inverse = skin.getInverseBindMatrices();
    if (!positions || !weights || !joints || !inverse) throw new Error('Missing bear skin data');
    const channels = clip('Bear_Death');
    const vertex: number[] = [],
      weight: number[] = [],
      joint: number[] = [],
      matrix: number[] = [];
    const floorSamples: [string, number][] = [
      ...[0, 0.2, 0.4, 0.6, 0.8, 1].map((phase): [string, number] => ['Bear_Death', phase]),
      ...[0, 0.12, 0.38, 0.44, 0.54, 0.56, 0.58, 0.62, 0.64, 0.68, 0.7, 0.8, 1].map(
        (phase): [string, number] => ['Bear_DoubleSlam', phase],
      ),
      ...['Bear_SwipeLeft', 'Bear_SwipeRight'].flatMap((name) =>
        [0.32, 0.46, 0.6, 0.7, 0.85].map((phase): [string, number] => [name, phase]),
      ),
    ];
    for (const [name, phase] of floorSamples) {
      const sampled = clip(name);
      rig.apply(samplePose(sampled, duration(sampled) * phase));
      const transforms = skin.listJoints().map((bone, i) => {
        const object = rig.named.get(bone.getName());
        if (!object) throw new Error(`Missing skin bone ${bone.getName()}`);
        inverse.getElement(i, matrix);
        return new Matrix4().multiplyMatrices(object.matrixWorld, new Matrix4().fromArray(matrix))
          .elements;
      });
      let floor = Infinity;
      for (let i = 0; i < positions.getCount(); i++) {
        positions.getElement(i, vertex);
        weights.getElement(i, weight);
        joints.getElement(i, joint);
        let y = 0;
        for (let j = 0; j < 4; j++) {
          const m = transforms[joint[j]];
          y += weight[j] * (m[1] * vertex[0] + m[5] * vertex[1] + m[9] * vertex[2] + m[13]);
        }
        floor = Math.min(floor, y);
      }
      expect(floor, `${name} floor at ${phase}`).toBeGreaterThan(
        name === 'Bear_Death' ? -0.025 : -0.01,
      );
    }
    // The last quarter is a settled corpse, not a looping recovery to standing.
    const settled = samplePose(channels, duration(channels) * 0.9);
    const end = samplePose(channels, duration(channels));
    for (const [key, value] of settled) {
      for (let i = 0; i < value.length; i++)
        expect(end.get(key)?.[i], key).toBeCloseTo(value[i], 3);
    }
    rig.apply(end);
    expect(point('Bone_020').y).toBeLessThan(0.9);
  });

  it('adds only an isolated, damage-pulled lab subject using the new body', () => {
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_smart_bear' } as never)).toBe(
      'npc_dev_smart_bear',
    );
    expect(VISUALS.npc_dev_smart_bear.url).toBe('models/creatures/smart_bear.glb');
    expect(VISUALS.npc_dev_smart_bear.clips.attack).toEqual([
      'Bear_SwipeLeft',
      'Bear_SwipeRight',
      'Bear_SwipeLeft',
      'Bear_SwipeRight',
      'Bear_DoubleSlam',
    ]);
    expect(DEV_MODEL_LAB_MOBS.dev_smart_bear).toMatchObject({
      family: 'beast',
      aggroOnDamageOnly: true,
      idleStationary: true,
      loot: [],
    });
    expect(DEV_MODEL_LAB_MOB_LINEUP.filter((p) => p.templateId === 'dev_smart_bear')).toHaveLength(
      1,
    );
    expect(visualKeyFor({ kind: 'mob', templateId: 'old_cragmaw' } as never)).toBe('mob_bear');
    expect(VISUALS.mob_bear.url).toBe('models/creatures/yetialt.glb');
  });
});
