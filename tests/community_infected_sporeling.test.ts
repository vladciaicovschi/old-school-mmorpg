import { readFileSync } from 'node:fs';
import type { Root } from '@gltf-transform/core';
import { Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { type AnimState, locomotionTimeScale } from '../src/render/characters/anim_state';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { desiredModelBaseState } from '../src/render/characters/model_gait_core';
import { MOBS } from '../src/sim/data';
import { createSkinnedPoseFloor } from './helpers/skinned_pose_floor';

const FILE = 'public/models/creatures/community_sporeling_infected.glb';
const CLIPS = [
  'Idle',
  'CombatIdle',
  'Walk',
  'Run',
  'Attack',
  'Death',
  'Axe_Spin_Attack',
  'Basic_Jump',
  'Charged_Slash',
  'Proud_Strut',
  'Right_Hand_Sword_Slash',
  'Simple_Kick',
  'Spartan_Kick',
  'Triple_Combo_Attack',
  'Left_Hook_from_Guard',
  'Hit',
];
const duration = (clip: ClipIndex) =>
  Math.max(...[...clip.values()].map((channel) => channel.times.at(-1) ?? 0));

// Independent evaluated source-FBX joint samples. Coordinates are relative to
// Hips and converted from Blender world axes to glTF, before import grounding.
// These preserve native phrasing and catch a foreign animation relabeled as native.
const NATIVE_POSES = [
  {
    clip: 'Hit',
    phase: 0.40816326530612246,
    points: {
      LeftHand: [0.40729016065597534, 0.1698504090309143, 0.3495810031890869],
      RightHand: [-0.4249389171600342, 0.4420511722564697, -0.018321499228477478],
      Head: [-0.08374418318271637, 0.37158745527267456, 0.021395638585090637],
    },
  },
  {
    clip: 'Idle',
    phase: 0.4,
    points: {
      LeftHand: [-0.01636403, 0.18024182, 0.51513994],
      RightHand: [-0.23793925, 0.10201433, -0.33220375],
      Head: [-0.05770338, 0.34408998, 0.1053645],
    },
  },
  {
    clip: 'Triple_Combo_Attack',
    phase: 0.3,
    points: {
      LeftHand: [0.41260552, 0.43135941, 0.41632426],
      RightHand: [-0.26911318, 0.43875873, -0.48109227],
      Head: [0.05983821, 0.38189536, -0.04622626],
    },
  },
  {
    clip: 'Death',
    phase: 1,
    points: {
      LeftHand: [0.57906342, -0.08714327, -0.39653146],
      RightHand: [-0.5875138, -0.06480628, -0.14024174],
      Head: [-0.03228994, -0.02751401, -0.39590931],
    },
  },
];

describe('infected mushroom supplied complete native animation pack', () => {
  let root: Root, rig: PoseRig, clips: Map<string, ClipIndex>, floor: () => number;
  const point = (name: string) =>
    rig.named.get(`mixamorig:${name}`)!.getWorldPosition(new Vector3());
  beforeAll(async () => {
    root = (await createGlbIO().read(FILE)).getRoot();
    rig = createPoseRig(root);
    clips = new Map(CLIPS.map((name) => [name, indexClip(root, `Infected_${name}`)]));
    floor = createSkinnedPoseFloor(root, rig);
  });

  it('preserves the merged native body, skin and original compressed PBR maps', () => {
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(66);
    expect(root.listMeshes()).toHaveLength(1);
    const primitive = root.listMeshes()[0].listPrimitives()[0];
    expect(primitive.getIndices()!.getCount()).toBe(104386 * 3);
    const extras = root
      .listNodes()
      .find((node) => node.getMesh())!
      .getExtras();
    expect(extras.source_sha256).toBe(
      '18559f9d58a1c88e9ac8d904e7e200931cc2e26b866b6eefc9138625cac2689b',
    );
    expect(extras.native_animation_source).toBe(
      'Meshy_AI_Mushroom_Menace_biped_Meshy_Merged_Animations.fbx',
    );
    expect(extras.reaction_sha256).toBe(
      'be163d6475363392f26bb9e61dffaed2dccd734277072435a063738c00c679d0',
    );
    expect(extras.original_triangles).toBe(104386);
    expect(extras.original_joint_count).toBe(66);
    const weights = primitive.getAttribute('WEIGHTS_0')!,
      values: number[] = [];
    for (let i = 0; i < weights.getCount(); i++) {
      weights.getElement(i, values);
      if (!values.every(Number.isFinite) || Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 0.001)
        throw new Error(`Invalid native skin weights at vertex ${i}`);
    }
    const bytes = readFileSync(FILE);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    expect(json.extensionsUsed).not.toContain('KHR_draco_mesh_compression');
    expect(json.images).toHaveLength(3);
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
    for (const texture of root.listTextures())
      expect(Math.max(...texture.getSize()!)).toBeLessThanOrEqual(2048);
    expect(root.listMaterials()[0].getAlphaMode()).toBe('OPAQUE');
  });

  it('retains all fourteen primary actions, the supplied reaction and one native attack slice', () => {
    expect(
      root
        .listAnimations()
        .map((animation) => animation.getName())
        .sort(),
    ).toEqual(CLIPS.map((name) => `Infected_${name}`).sort());
    for (const [name, clip] of clips)
      for (const [key, channel] of clip) {
        expect(rig.rest.has(key), name + ':' + key).toBe(true);
        expect([...channel.values].every(Number.isFinite), name + ':' + key).toBe(true);
      }
    expect(root.listAnimations().some((animation) => animation.getName() === 'Infected_Hit')).toBe(
      true,
    );
    expect(VISUALS.mob_corrupted_sporeling.clips.hit).toEqual(['Infected_Hit']);
  });

  it('closes both standing poses and both locomotion loops', () => {
    for (const name of ['Idle', 'CombatIdle', 'Walk', 'Run']) {
      const clip = clips.get(name)!,
        first = samplePose(clip, 0),
        last = samplePose(clip, duration(clip));
      for (const [key, values] of first) {
        if (key.endsWith('|rotation')) {
          const dot = values.reduce((sum, v, i) => sum + v * last.get(key)![i], 0);
          expect(Math.abs(dot), name + ':' + key).toBeCloseTo(1, 4);
        } else
          for (let i = 0; i < values.length; i++)
            expect(last.get(key)![i], name + ':' + key).toBeCloseTo(values[i], 3);
      }
    }
  });

  it.each(NATIVE_POSES)(
    'preserves independently sampled native $clip phrasing',
    ({ clip, phase, points }) => {
      const action = clips.get(clip)!;
      rig.apply(samplePose(action, duration(action) * phase));
      const hips = point('Hips');
      for (const [bone, expected] of Object.entries(points)) {
        expect(
          point(bone).sub(hips).distanceTo(new Vector3().fromArray(expected)),
          bone,
        ).toBeLessThan(0.018);
      }
    },
  );

  it.each(['Walk', 'Run'])('%s articulates both feet', (name) => {
    const clip = clips.get(name)!,
      trajectories = [[], []] as Vector3[][];
    for (let i = 0; i <= 40; i++) {
      rig.apply(samplePose(clip, (duration(clip) * i) / 40));
      trajectories[0].push(point('LeftFoot'));
      trajectories[1].push(point('RightFoot'));
    }
    for (const foot of trajectories)
      for (const axis of ['y', 'z'] as const) {
        const values = foot.map((p) => p[axis]);
        expect(Math.max(...values) - Math.min(...values), axis).toBeGreaterThan(0.035);
      }
  });

  it.each([
    { movement: 'wander', factor: 0.35, expected: 'walk' },
    { movement: 'chase', factor: 1, expected: 'run' },
  ] as const)(
    'matches both feet at actual $movement speed through the model gait and playback caps',
    ({ factor, expected }) => {
      const def = VISUALS.mob_corrupted_sporeling,
        mob = MOBS.corrupted_sporeling,
        speed = mob.moveSpeed * factor;
      const state: AnimState = {
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
      };
      const base = desiredModelBaseState(state, false, false, true, def.gait, 'idle');
      expect(base).toBe(expected);
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
      const rate = locomotionTimeScale(base, state, def.walkRef, def.runRef)!;
      const scale = (def.height / 1.7) * mob.scale;
      const clip = clips.get(expected === 'walk' ? 'Walk' : 'Run')!;
      for (const side of ['LeftFoot', 'RightFoot']) {
        const samples: Vector3[] = [];
        for (let i = 0; i <= 200; i++) {
          rig.apply(samplePose(clip, (duration(clip) * i) / 200));
          samples.push(point(side));
        }
        const ys = samples.map((p) => p.y),
          lo = Math.min(...ys),
          hi = Math.max(...ys),
          stance = lo + (hi - lo) * 0.25;
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

  it('uses a short native first strike without the hook back-turn', () => {
    const attack = clips.get('Attack')!;
    expect(duration(attack)).toBeCloseTo(28 / 30, 3);
    expect(duration(clips.get('Triple_Combo_Attack')!)).toBeCloseTo(130 / 30, 3);
    expect(duration(clips.get('Hit')!)).toBeCloseTo(49 / 30, 3);
    for (let i = 0; i <= 30; i++) {
      rig.apply(samplePose(attack, (duration(attack) * i) / 30));
      const across = point('LeftArm').sub(point('RightArm'));
      const yaw = Math.abs(Math.atan2(-across.z, across.x));
      expect(yaw).toBeLessThan(Math.PI * 0.6);
    }
  });

  it('keeps the complete native jump, including real airtime and landing', () => {
    const clip = clips.get('Basic_Jump')!;
    expect(duration(clip)).toBeCloseTo(176 / 30, 3);
    const floors: number[] = [];
    for (let i = 0; i <= 18; i++) {
      rig.apply(samplePose(clip, (duration(clip) * i) / 18));
      floors.push(floor());
    }
    expect(Math.max(...floors)).toBeGreaterThan(0.6);
    expect(Math.min(...floors)).toBeGreaterThan(-0.04);
    expect(Math.abs(floors.at(-1)!)).toBeLessThan(0.06);
  });

  it('plays the whole native fall, keeps the corpse grounded and holds the final landing', () => {
    const clip = clips.get('Death')!;
    expect(duration(clip)).toBeCloseTo(2.45, 3);
    rig.apply(samplePose(clips.get('Idle')!, 0));
    const upright = point('Head').sub(point('Hips')).y;
    for (const phase of [0.3, 0.6, 0.9, 1]) {
      rig.apply(samplePose(clip, duration(clip) * phase));
      expect(Math.abs(floor()), String(phase)).toBeLessThan(0.04);
    }
    expect(Math.abs(point('Head').sub(point('Hips')).y)).toBeLessThan(upright * 0.4);
    // Meshopt resampling perturbs very small finger rotations. Measure the
    // actual world-space pose instead of comparing quaternion components:
    // every joint must remain within 2 mm and 1.15 degrees during the hold.
    rig.apply(samplePose(clip, duration(clip) - 0.1));
    const held = root
      .listSkins()[0]
      .listJoints()
      .map((joint) => {
        const bone = rig.named.get(joint.getName())!;
        return {
          position: bone.getWorldPosition(new Vector3()),
          rotation: bone.getWorldQuaternion(new Quaternion()),
        };
      });
    rig.apply(samplePose(clip, duration(clip)));
    for (const [i, joint] of root.listSkins()[0].listJoints().entries()) {
      const bone = rig.named.get(joint.getName())!;
      expect(
        bone.getWorldPosition(new Vector3()).distanceTo(held[i].position),
        joint.getName(),
      ).toBeLessThan(0.002);
      expect(
        bone.getWorldQuaternion(new Quaternion()).angleTo(held[i].rotation),
        joint.getName(),
      ).toBeLessThan(0.02);
    }
  });

  it('keeps the separate infected identity and existing Pack Frenzy mechanics', () => {
    expect(visualKeyFor({ kind: 'mob', templateId: 'corrupted_sporeling' } as never)).toBe(
      'mob_corrupted_sporeling',
    );
    expect(VISUALS.mob_corrupted_sporeling.url).toBe(
      'models/creatures/community_sporeling_infected.glb',
    );
    expect(VISUALS.mob_corrupted_sporeling.url).not.toBe(VISUALS.mob_glub.url);
    expect(MOBS.corrupted_sporeling.scale).toBe(0.85);
    expect(MOBS.corrupted_sporeling.moveSpeed).toBe(7.5);
    expect(MOBS.corrupted_sporeling.packFrenzy).toEqual({
      radius: 12,
      hasteMult: 1.3,
      duration: 8,
    });
  });
});
