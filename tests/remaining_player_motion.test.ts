import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { clipNamesOf } from '../src/render/characters/clip_names_core';
import { VISUALS } from '../src/render/characters/manifest';

const classes = ['mage', 'priest', 'druid', 'shaman', 'rogue'] as const;
const waterNames = new Set(['Swim_Breaststroke', 'Swim_Freestyle', 'Swim_Tread', 'Water_Wade']);
interface AnimationJson {
  name: string;
  channels: { target: { node: number } }[];
}
interface GlbJson {
  nodes: { name: string }[];
  animations: AnimationJson[];
}
const json = (url: string): GlbJson => {
  const bytes = fs.readFileSync(`public/${url}`);
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
};

describe('remaining T1 player native motion', () => {
  it('never carries native moving-shot masks onto the separate composed skeleton', () => {
    for (const cls of ['mage', 'priest', 'druid', 'warlock', 'hunter']) {
      expect(VISUALS[`player_${cls}`].clips.locomotionShotClips?.length).toBeGreaterThan(0);
      expect(VISUALS[`player_${cls}_modular`].clips.locomotionShotClips).toBeUndefined();
    }
  });
  it.each(classes)('%s maps actual target-rig ground and combat clips', async (cls) => {
    const def = VISUALS[`player_${cls}`];
    expect(def.clips.jump).toBeTruthy();
    expect(def.clips.fall).toBe(def.clips.jump);
    expect(def.clips.jumpClampAtEnd).toBe(true);
    expect(def.clips.hit?.length).toBeGreaterThan(0);
    const body = json(def.url);
    const targetNodes = new Set(body.nodes.map((node: { name: string }) => node.name));
    const donors = (def.animUrls ?? []).filter((url) => !url.endsWith('/swim_anims.glb'));
    const clips = new Map<string, { doc: GlbJson; clip: AnimationJson }>();
    for (const doc of [body, ...donors.map(json)]) {
      for (const clip of doc.animations ?? []) clips.set(clip.name, { doc, clip });
    }
    for (const name of new Set(clipNamesOf(def))) {
      if (waterNames.has(name)) continue; // User explicitly deferred swimming.
      const found = clips.get(name);
      expect(found, `${cls}: missing ${name}`).toBeDefined();
      if (!found) continue;
      for (const channel of found.clip.channels)
        expect(targetNodes.has(found.doc.nodes[channel.target.node].name), `${cls}: ${name}`).toBe(
          true,
        );
    }
    const io = createGlbIO();
    const donor = (
      await io.read(`public/models/chars/players/${cls}_t1_motion_anims.glb`)
    ).getRoot();
    expect(donor.listMeshes()).toHaveLength(0);
    expect(donor.listSkins()).toHaveLength(0);
    assert(def.clips.jump);
    const jump = indexClip(donor, def.clips.jump);
    const end = Math.max(...[...jump.values()].map((ch) => ch.times.at(-1) ?? 0));
    expect(end).toBeCloseTo(0.833333, 5);
    for (const animation of donor.listAnimations()) {
      const clip = indexClip(donor, animation.getName());
      for (const channel of clip.values())
        expect([...channel.values].every(Number.isFinite)).toBe(true);
      if (/(Idle|Walk|Run)$/.test(animation.getName())) {
        const duration = Math.max(...[...clip.values()].map((ch) => ch.times.at(-1) ?? 0));
        const first = samplePose(clip, 0);
        for (const [key, value] of samplePose(clip, duration)) {
          const start = first.get(key);
          assert(start);
          if (key.endsWith('|rotation'))
            expect(
              new Quaternion()
                .fromArray(value)
                .normalize()
                .angleTo(new Quaternion().fromArray(start).normalize()),
            ).toBeLessThan(0.00001);
          else
            for (const [index, component] of value.entries())
              expect(start[index]).toBeCloseTo(component, 5);
        }
      }
    }
    if (cls !== 'rogue') {
      expect(def.stowHeldPropsWhileCasting).toBe(true);
      expect(def.clips.castDurationFit).toEqual({
        tailSeconds: 0.76,
        tailPlaybackSeconds: 0.3,
        maxPreparationSpeed: 1.35,
      });
      const p = `T1${cls[0].toUpperCase()}${cls.slice(1)}Motion_`;
      const pairs = [
        ...(['hostile', 'self', 'ally'] as const).map((mode) => [
          def.clips.castByTarget?.[mode],
          def.clips.castReleaseByTarget?.[mode],
        ]),
        [`${p}CastFire_Loop`, `${p}CastFire_Release`],
        [`${p}CastDrain_Loop`, `${p}CastDrain_Release`],
      ];
      for (const [prepareName, releaseName] of pairs) {
        assert(prepareName && releaseName);
        const preparation = indexClip(donor, prepareName);
        const release = indexClip(donor, releaseName);
        const seconds = Math.max(...[...preparation.values()].map((ch) => ch.times.at(-1) ?? 0));
        const last = samplePose(preparation, seconds);
        const first = samplePose(release, 0);
        for (const [key, value] of last) {
          const got = first.get(key);
          assert(got);
          if (key.endsWith('|rotation'))
            expect(
              new Quaternion()
                .fromArray(value)
                .normalize()
                .angleTo(new Quaternion().fromArray(got).normalize()),
            ).toBeLessThan(0.00001);
          else
            for (const [index, component] of value.entries())
              expect(got[index]).toBeCloseTo(component, 4);
        }
      }
    }
  });
  it('keeps new Mixamo donors and profiles out of the legacy composed branch', () => {
    for (const cls of classes) {
      const legacy = VISUALS[`player_${cls}_modular`];
      expect(legacy.clips.weaponMotions).toBeUndefined();
      expect(legacy.clips.castDurationFit).toBeUndefined();
      expect(legacy.animUrls?.some((url) => url.endsWith(`/${cls}_t1_motion_anims.glb`))).toBe(
        false,
      );
    }
  });
});
