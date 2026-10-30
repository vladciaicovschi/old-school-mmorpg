import assert from 'node:assert/strict';
import fs from 'node:fs';
import { type Object3D, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CASTER_MOB_TARGETS, casterMobAnimationUrl } from '../scripts/anim/caster_mob_targets.mjs';
import { createHumanoidWorldRetargeter } from '../scripts/anim/humanoid_world_retarget.mjs';
import { type ClipIndex, createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, type PoseRig } from '../scripts/anim/rig_pose.mjs';
import { createWarlockHandGlow } from '../src/render/ability_vfx/hand_glow';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { clipNamesOf } from '../src/render/characters/clip_names_core';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const duration = (clip: ClipIndex) =>
  Math.max(...[...clip.values()].map((channel) => channel.times[channel.times.length - 1]));
const fixtures: Array<{
  target: (typeof CASTER_MOB_TARGETS)[number];
  rig: PoseRig;
  clips: Map<string, ClipIndex>;
}> = [];
beforeAll(async () => {
  const io = createGlbIO();
  for (const target of CASTER_MOB_TARGETS) {
    const base = (await io.read(`public/${target.bodyUrl}`)).getRoot();
    const donor = (await io.read(`public/${casterMobAnimationUrl(target)}`)).getRoot();
    expect(donor.listMeshes()).toHaveLength(0);
    expect(donor.listSkins()).toHaveLength(0);
    expect(donor.listTextures()).toHaveLength(0);
    expect(donor.listAnimations()).toHaveLength(6);
    const rig = createPoseRig(base);
    fixtures.push({
      target,
      rig,
      clips: new Map(
        donor
          .listAnimations()
          .map((animation) => [animation.getName(), indexClip(donor, animation.getName())]),
      ),
    });
  }
});
function clip(f: (typeof fixtures)[number], suffix: string): ClipIndex {
  const result = f.clips.get(`${f.target.prefix}_${suffix}`);
  assert(result);
  return result;
}
function equalPose(a: Map<string, number[]>, b: Map<string, number[]>) {
  for (const [key, value] of a) {
    const other = b.get(key);
    assert(other, key);
    if (key.endsWith('|rotation'))
      expect(
        new Quaternion().fromArray(value).angleTo(new Quaternion().fromArray(other)),
        key,
      ).toBeLessThan(0.001);
    else
      for (const [index, component] of value.entries())
        expect(other[index], key).toBeCloseTo(component, 5);
  }
}
describe('lab caster target-specific animation assets', () => {
  it('keeps the preparation glow on the palms of every shipped caster rig', () => {
    for (const f of fixtures) {
      const left = f.rig.named.get('mixamorig:LeftHand');
      const right = f.rig.named.get('mixamorig:RightHand');
      assert(left && right);
      let root: Object3D = left;
      while (root.parent) root = root.parent;
      const draw = createWarlockHandGlow(
        new Map([[7, { visualKey: f.target.visualKey, visual: { root } }]]),
      );
      const overlay = { push: vi.fn() };
      for (const family of ['Hostile', 'Friendly']) {
        const prepare = clip(f, `Prepare${family}`);
        for (const phase of [0, 0.4, 0.8, 1]) {
          f.rig.apply(samplePose(prepare, duration(prepare) * phase));
          overlay.push.mockClear();
          expect(draw(7, 0x6622cc, 0xffffff, phase, 1, overlay)).toBe(true);
          expect(overlay.push).toHaveBeenCalledTimes(4);
          const palms: Object3D[] = [left, right];
          for (const [i, hand] of palms.entries()) {
            const middle: Object3D | undefined = hand.getObjectByName(`${hand.name}Middle1`);
            assert(middle);
            const palm = hand
              .getWorldPosition(new Vector3())
              .lerp(middle.getWorldPosition(new Vector3()), 0.6);
            expect(overlay.push.mock.calls[i * 2].slice(0, 3)).toEqual(palm.toArray());
          }
        }
      }
    }
  });
  it('binds every runtime clip and a capped cast clock on exactly the opted-in lab models', () => {
    for (const f of fixtures) {
      const def = VISUALS[f.target.visualKey];
      for (const name of clipNamesOf(def).filter((name) => name.startsWith(f.target.prefix)))
        expect(f.clips.has(name), name).toBe(true);
      expect(def.animUrls).toContain(casterMobAnimationUrl(f.target));
      expect(def.clips.castDurationFit).toEqual({
        tailSeconds: 0.76,
        tailPlaybackSeconds: 0.3,
        maxPreparationSpeed: 1.35,
      });
      expect(MEDIA_ASSETS).toHaveProperty(casterMobAnimationUrl(f.target));
      for (const animation of f.clips.values())
        for (const [key, channel] of animation) {
          const [name, path] = key.split('|');
          expect(f.rig.named.has(name), `${f.target.visualKey}: ${name}`).toBe(true);
          expect([...channel.values].every(Number.isFinite), key).toBe(true);
          if ((path === 'translation' && name !== 'mixamorig:Hips') || path === 'scale') {
            const rest = f.rig.rest.get(key);
            assert(rest, key);
            // Preserve the five-decimal tolerance for every sample without
            // allocating a matcher for each of the dense baked components.
            expect(
              channel.values.every(
                (value, i) => Math.abs(value - rest[i % rest.length]) < 0.000005,
              ),
              key,
            ).toBe(true);
          }
        }
    }
    expect(VISUALS.player_warlock.clips.cast).toBe('WarlockT1_CastShadow_Loop');
    expect(VISUALS.npc_dev_skeleton_rogue_v3.clips.castDurationFit).toBeUndefined();
    expect(VISUALS.mob_dark_caster.clips.castDurationFit).toBeUndefined();
  });
  it('joins both cast families exactly and returns the native follow-through into calm idle', () => {
    for (const f of fixtures)
      for (const family of ['Hostile', 'Friendly']) {
        const prepare = clip(f, `Prepare${family}`);
        const release = clip(f, `Release${family}`);
        expect(duration(prepare)).toBeCloseTo(11.266666 + 0.76, 4);
        equalPose(samplePose(prepare, duration(prepare)), samplePose(release, 0));
        equalPose(samplePose(release, duration(release)), samplePose(clip(f, 'Idle'), 0));
        equalPose(
          samplePose(clip(f, 'Idle'), 0),
          samplePose(clip(f, 'Idle'), duration(clip(f, 'Idle'))),
        );
      }
  });
  it('moves both hands in the authored direction, including native Caster V3 bind axes', () => {
    for (const f of fixtures) {
      const node = (part: string) => {
        const n = f.rig.named.get(`mixamorig:${part}`);
        assert(n);
        return n;
      };
      f.rig.apply(samplePose(clip(f, 'ReleaseHostile'), 0));
      const hips = node('Hips').getWorldPosition(new Vector3());
      for (const side of ['Left', 'Right'])
        expect(
          node(`${side}Hand`).getWorldPosition(new Vector3()).z - hips.z,
          f.target.visualKey,
        ).toBeGreaterThan(0.25);
      f.rig.apply(samplePose(clip(f, 'ReleaseFriendly'), 0));
      const headY = node('Head').getWorldPosition(new Vector3()).y;
      for (const side of ['Left', 'Right'])
        expect(
          node(`${side}Hand`).getWorldPosition(new Vector3()).y - headY,
          f.target.visualKey,
        ).toBeGreaterThan(-0.05);
      const prep = clip(f, 'PrepareHostile');
      const first = samplePose(prep, 0);
      const later = samplePose(prep, 4);
      const hand = 'mixamorig:RightHand|rotation';
      const a = first.get(hand);
      const b = later.get(hand);
      assert(a && b);
      expect(new Quaternion().fromArray(a).angleTo(new Quaternion().fromArray(b))).toBeGreaterThan(
        0.05,
      );
    }
  });
  it('imports the acolyte with original compressed PBR and an isolated combat pad', () => {
    const bytes = fs.readFileSync('public/models/chars/npcs/dev_skeleton_acolyte.glb');
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.skins).toHaveLength(1);
    expect(json.materials).toHaveLength(1);
    expect(json.images).toHaveLength(3);
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
    expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_skeleton_acolyte' } as never)).toBe(
      'npc_dev_skeleton_acolyte',
    );
    expect(DEV_MODEL_LAB_MOBS.dev_skeleton_acolyte.aggroOnDamageOnly).toBe(true);
    expect(
      DEV_MODEL_LAB_MOB_LINEUP.filter((entry) => entry.templateId === 'dev_skeleton_acolyte'),
    ).toHaveLength(1);
  });
  it('transfers the native Caster V3 rest pose without importing foreign local bind axes or garment motion', async () => {
    const io = createGlbIO();
    const source = createPoseRig(
      (await io.read('public/models/chars/players/warlock_t1.glb')).getRoot(),
    );
    const f = fixtures.find((entry) => entry.target.prefix === 'CasterV3Magic');
    assert(f);
    const retarget = createHumanoidWorldRetargeter(source, f.rig, [...f.rig.rest.keys()]);
    equalPose(retarget(source.rest), f.rig.rest);
    for (const [name] of f.rig.named)
      if (name.startsWith('Bone_')) {
        const key = `${name}|rotation`;
        const actual = samplePose(clip(f, 'PrepareHostile'), 5).get(key);
        const expected = f.rig.rest.get(key);
        assert(actual && expected);
        for (const [index, value] of expected.entries())
          expect(actual[index], key).toBeCloseTo(value, 5);
      }
  });
});
