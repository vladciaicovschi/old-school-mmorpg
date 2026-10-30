import { readFileSync } from 'node:fs';
import type { Root } from '@gltf-transform/core';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const PATH = 'public/models/creatures/smart_wolf_v2.glb';
const LOOPS = ['Wolf_Idle', 'Wolf_CombatIdle', 'Wolf_Walk', 'Wolf_Trot', 'Wolf_Run'];
const ATTACKS = ['Wolf_BiteLeft', 'Wolf_BiteRight', 'Wolf_Lunge'];
const FEET = ['Bone_020', 'Bone_014', 'Bone_028', 'Bone_033'];
const seconds = (clip: ReturnType<typeof indexClip>) =>
  Math.max(...[...clip.values()].map((c) => c.times.at(-1) ?? 0));
const required = <T>(value: T | null | undefined): T => {
  if (value == null) throw new Error('Missing wolf V2 asset data');
  return value;
};

describe('normalized native wolf V2', () => {
  let root: Root;
  let rig: ReturnType<typeof createPoseRig>;
  let clips: Map<string, ReturnType<typeof indexClip>>;
  let vertices: (ids?: number[]) => Vector3[];
  let rest: Vector3[];
  beforeAll(async () => {
    root = (await createGlbIO().read(PATH)).getRoot();
    rig = createPoseRig(root);
    clips = new Map(root.listAnimations().map((a) => [a.getName(), indexClip(root, a.getName())]));
    const skin = root.listSkins()[0],
      p = root.listMeshes()[0].listPrimitives()[0];
    const position = required(p.getAttribute('POSITION')),
      weights = required(p.getAttribute('WEIGHTS_0')),
      joints = required(p.getAttribute('JOINTS_0')),
      inverse = required(skin.getInverseBindMatrices());
    vertices = (ids) => {
      const m: number[] = [],
        v: number[] = [],
        w: number[] = [],
        j: number[] = [];
      const transforms = skin.listJoints().map((b, i) => {
        inverse.getElement(i, m);
        return new Matrix4().multiplyMatrices(
          required(rig.named.get(b.getName())).matrixWorld,
          new Matrix4().fromArray(m),
        );
      });
      return (ids ?? Array.from({ length: position.getCount() }, (_, i) => i)).map((i) => {
        position.getElement(i, v);
        weights.getElement(i, w);
        joints.getElement(i, j);
        const point = new Vector3();
        for (let k = 0; k < 4; k++)
          point.addScaledVector(new Vector3().fromArray(v).applyMatrix4(transforms[j[k]]), w[k]);
        return point;
      });
    };
    rest = vertices();
  });
  const point = (name: string) => required(rig.named.get(name)).getWorldPosition(new Vector3());
  const pose = (name: string, p: number) => {
    const c = required(clips.get(name));
    rig.apply(samplePose(c, seconds(c) * p));
  };

  it('preserves 47 native joints and body topology with bounded canine caps', () => {
    expect(root.listSkins()[0].listJoints()).toHaveLength(47);
    // Only the two fused tooth stalks are split and capped: 166 added triangles.
    expect(root.listMeshes()[0].listPrimitives()[0].getIndices()?.getCount()).toBe(312750);
    const mesh = root.listNodes().find((n) => n.getMesh());
    expect(mesh?.getExtras().source_sha256).toBe(
      '840671509d895aec77813cadf6ffcab2cd7af87f6545da48d112553fa39ef419',
    );
    expect(mesh?.getExtras().wolf_v2_stance_revision).toBe(1);
    expect(mesh?.getExtras().wolf_v2_muzzle_skin_revision).toBe(2);
    expect(mesh?.getExtras().wolf_v2_teeth_revision).toBe(1);
    const bytes = readFileSync(PATH),
      n = bytes.readUInt32LE(12),
      json = JSON.parse(bytes.subarray(20, 20 + n).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    expect(json.images).toHaveLength(3);
    expect(json.images.every((i: { mimeType: string }) => i.mimeType === 'image/ktx2')).toBe(true);
    expect(bytes.length).toBeLessThan(10 * 1024 * 1024);
  });

  it('adapts all twelve motions with finite unit rotations and no body scaling', () => {
    expect([...clips.keys()].sort()).toEqual(
      [...LOOPS, ...ATTACKS, 'Wolf_Hit', 'Wolf_Death', 'Wolf_Howl', 'Wolf_AlertLook'].sort(),
    );
    for (const [name, c] of clips)
      for (const [key, ch] of c) {
        expect(rig.rest.has(key), `${name}: ${key}`).toBe(true);
        expect([...ch.values].every(Number.isFinite)).toBe(true);
        if (ch.path === 'rotation')
          for (let i = 0; i < ch.values.length; i += 4)
            expect(Math.hypot(...ch.values.slice(i, i + 4))).toBeCloseTo(1, 3);
        if (ch.path === 'scale') for (const v of ch.values) expect(v).toBeCloseTo(1, 4);
      }
  });

  it.each(LOOPS)('%s closes without drift and keeps native limb continuity', (name) => {
    const c = required(clips.get(name)),
      first = samplePose(c, 0),
      last = samplePose(c, seconds(c));
    for (const [key, v] of first)
      for (let i = 0; i < v.length; i++) expect(last.get(key)?.[i], key).toBeCloseTo(v[i], 3);
    let previous: Vector3[] | undefined;
    for (let i = 0; i <= 120; i++) {
      pose(name, i / 120);
      const now = root
        .listSkins()[0]
        .listJoints()
        .map((b) => point(b.getName()));
      if (previous)
        for (let j = 0; j < now.length; j++)
          expect(now[j].distanceTo(previous[j]), name).toBeLessThan(0.13);
      previous = now;
    }
  });

  it('grounds the windup supports and advances the muzzle along the normalized heading', () => {
    pose('Wolf_Idle', 0);
    expect(Math.abs(point('Bone_025').x)).toBeLessThan(0.04);
    expect(Math.abs(point(FEET[0]).y - point(FEET[1]).y)).toBeLessThan(0.01);
    expect(Math.abs(point(FEET[2]).y - point(FEET[3]).y)).toBeLessThan(0.01);
    for (const name of ATTACKS) {
      pose(name, 0);
      const start = point('Bone_041');
      const anchors = FEET.slice(0, 2).map(point);
      pose(name, 0.2);
      for (let i = 0; i < 2; i++) expect(point(FEET[i]).distanceTo(anchors[i])).toBeLessThan(0.005);
      pose(name, 0.53);
      expect(point('Bone_041').z - start.z).toBeGreaterThan(0.14);
    }
  });

  it.each(ATTACKS)('%s opens the actual lower jaw while keeping the nose rigid', (name) => {
    rig.apply(new Map());
    // The complete black nose cap starts here after normalization. The strip
    // behind z=1.32 is the deliberately feathered upper-lip transition.
    const nose = rest.map((p, i) => ({ p, i })).filter(({ p }) => p.z > 1.32 && p.y > 1.07);
    // Include the full underside of the upper lip. A cap-only check misses
    // the hanging muzzle demonstrated by the owner's attack screenshot.
    const upperLip = rest
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.z > 1.2 && p.z < 1.32 && p.y > 1.045 && p.y < 1.13);
    const lip = rest
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.z > 1.11 && p.z < 1.23 && p.y > 0.94 && p.y < 1.02);
    expect(nose.length).toBeGreaterThan(30);
    expect(upperLip.length).toBeGreaterThan(100);
    expect(lip.length).toBeGreaterThan(10);
    const head = required(rig.named.get('Bone_025')),
      inverse = head.matrixWorld.clone().invert();
    let maxNoseError = 0;
    for (let i = 0; i <= 40; i++) {
      pose(name, i / 40);
      const upper = [...nose, ...upperLip];
      const current = vertices(upper.map((v) => v.i));
      for (let j = 0; j < upper.length; j++)
        maxNoseError = Math.max(
          maxNoseError,
          current[j].distanceTo(
            upper[j].p.clone().applyMatrix4(inverse).applyMatrix4(head.matrixWorld),
          ),
        );
    }
    expect(maxNoseError).toBeLessThan(0.006);
    pose(name, 0.32);
    const jaw = required(rig.named.get('Bone_042'));
    expect(
      jaw.quaternion.angleTo(
        new Quaternion().fromArray(required(rig.rest.get('Bone_042|rotation'))),
      ),
    ).toBeGreaterThan(0.17);
    const moved = vertices(lip.map((v) => v.i));
    const travel =
      moved.reduce(
        (s, p, i) =>
          s + p.distanceTo(lip[i].p.clone().applyMatrix4(inverse).applyMatrix4(head.matrixWorld)),
        0,
      ) / lip.length;
    expect(travel).toBeGreaterThan(0.025);
  });

  it('rests the actual distal tail fur on the floor after death', () => {
    const skin = root.listSkins()[0];
    const tail = new Set(
      skin
        .listJoints()
        .flatMap((joint, i) =>
          ['Bone_006', 'Bone_005', 'Bone_004'].includes(joint.getName()) ? [i] : [],
        ),
    );
    const primitive = root.listMeshes()[0].listPrimitives()[0];
    const weights = required(primitive.getAttribute('WEIGHTS_0'));
    const joints = required(primitive.getAttribute('JOINTS_0'));
    const ids: number[] = [],
      w: number[] = [],
      j: number[] = [];
    for (let i = 0; i < weights.getCount(); i++) {
      weights.getElement(i, w);
      joints.getElement(i, j);
      if (j.reduce((sum, bone, k) => sum + (tail.has(bone) ? w[k] : 0), 0) > 0.95) ids.push(i);
    }
    expect(ids.length).toBeGreaterThan(1000);
    pose('Wolf_Death', 1);
    const heights = vertices(ids).map((p) => p.y);
    expect(Math.min(...heights)).toBeGreaterThan(-0.012);
    expect(Math.min(...heights), 'tail fur hovers above floor').toBeLessThan(0.025);
    expect(Math.max(...heights), 'distal tail remains raised').toBeLessThan(0.45);
  });

  it('keeps skin above the floor through attacks, locomotion and collapse', () => {
    let floor = Infinity;
    let lowest = '';
    for (const name of clips.keys())
      for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
        pose(name, phase);
        for (const p of vertices())
          if (p.y < floor) {
            floor = p.y;
            lowest = `${name} at ${phase}`;
          }
      }
    expect(floor, lowest).toBeGreaterThan(-0.012);
  });

  it.each([...ATTACKS, 'Wolf_Howl'])(
    '%s keeps whole upper canines rigid and separates the lower teeth',
    (name) => {
      rig.apply(new Map());
      const head = required(rig.named.get('Bone_025'));
      const bindInverse = head.matrixWorld.clone().invert();
      // Source dental roots, tips and posterior teeth in native skull space.
      // These landmarks include dark enamel missed by a bright-pixel-only mask.
      const upper = [
        [-0.0843858, 0.2867669, -0.2629228],
        [-0.1054832, 0.2854814, -0.262404],
        [-0.151772, 0.2737476, -0.2455432],
        [-0.1069376, 0.3411946, -0.1954579],
        [-0.1343542, 0.3269325, -0.1843506],
        [-0.1216083, 0.3301795, -0.1858756],
        [-0.1196828, 0.2071506, -0.2110687],
        [-0.0984135, 0.2821764, -0.168344],
      ];
      const landmarks = [...upper, [-0.19318, 0.3081809, -0.2108149]].map((local) => {
        const target = new Vector3().fromArray(local).applyMatrix4(head.matrixWorld);
        let id = 0,
          distance = Infinity;
        for (let i = 0; i < rest.length; i++) {
          const d = rest[i].distanceTo(target);
          if (d < distance) {
            id = i;
            distance = d;
          }
        }
        expect(distance, 'dental landmark must lie on actual skin').toBeLessThan(0.002);
        return { id, local: rest[id].clone().applyMatrix4(bindInverse) };
      });
      let lowerTravel = 0;
      for (let i = 0; i <= 40; i++) {
        pose(name, i / 40);
        const points = vertices(landmarks.map((p) => p.id));
        for (let j = 0; j < upper.length; j++)
          expect(
            points[j].distanceTo(landmarks[j].local.clone().applyMatrix4(head.matrixWorld)),
            'upper canine stretches',
          ).toBeLessThan(0.004);
        lowerTravel = Math.max(
          lowerTravel,
          points[upper.length].distanceTo(
            landmarks[upper.length].local.clone().applyMatrix4(head.matrixWorld),
          ),
        );
      }
      expect(lowerTravel, 'lower dental arch must follow the moving jaw').toBeGreaterThan(0.025);
    },
  );

  it('settles both upper paws and the additional lower hind fetlock after death', () => {
    pose('Wolf_Death', 1);
    for (const name of FEET) expect(point(name).y, name).toBeLessThan(0.25);
    const last = FEET.map(point);
    pose('Wolf_Death', 0.9);
    for (let i = 0; i < FEET.length; i++)
      expect(point(FEET[i]).distanceTo(last[i])).toBeLessThan(0.002);
  });

  it.each(['Wolf_Walk', 'Wolf_Run'])(
    '%s matches runtime speed to actual planted-paw travel',
    (name) => {
      pose('Wolf_Idle', 0);
      const idle = vertices(),
        height = Math.max(...idle.map((p) => p.y)) - Math.min(...idle.map((p) => p.y));
      pose(name, 0.1);
      const start = point(FEET[0]);
      pose(name, 0.3);
      const end = point(FEET[0]);
      const def = VISUALS.npc_dev_smart_wolf_v2;
      const measured =
        (((start.z - end.z) / (seconds(required(clips.get(name))) * 0.2)) * def.height) / height;
      expect(measured).toBeCloseTo(required(name === 'Wolf_Run' ? def.runRef : def.walkRef), 2);
    },
  );

  it('uses its own isolated island subject while retaining the original wolf', () => {
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_smart_wolf_v2' } as never)).toBe(
      'npc_dev_smart_wolf_v2',
    );
    expect(VISUALS.npc_dev_smart_wolf_v2.url).toBe('models/creatures/smart_wolf_v2.glb');
    expect(VISUALS.npc_dev_smart_wolf.url).toBe('models/creatures/smart_wolf.glb');
    expect(DEV_MODEL_LAB_MOBS.dev_smart_wolf_v2).toMatchObject({
      aggroOnDamageOnly: true,
      idleStationary: true,
      loot: [],
    });
    expect(
      DEV_MODEL_LAB_MOB_LINEUP.find((x) => x.templateId === 'dev_smart_wolf_v2'),
    ).toMatchObject({ x: 788, z: 72 });
  });
});
