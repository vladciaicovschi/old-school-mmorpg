import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import type { Entity } from '../src/sim/types';

function mob(templateId: string, x = -281, z = -18): Entity {
  return { kind: 'mob', templateId, pos: { x, y: 0, z } } as Entity;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function animationNames(path: string): string[] {
  const glb = readFileSync(path);
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8')) as {
    animations?: { name?: string }[];
  };
  return (json.animations ?? []).map((animation) => animation.name ?? '');
}

describe('Emberclaw crab rollout', () => {
  it('routes island and regional crab templates through their existing visual keys', () => {
    expect(visualKeyFor(mob('shore_scuttler'))).toBe('mob_proving_shore_scuttler');
    expect(visualKeyFor(mob('mister_crabs'))).toBe('mob_proving_shore_tidepool_boss');
    expect(visualKeyFor({ kind: 'mob', templateId: 'shore_scuttler' } as Entity)).toBe(
      'mob_proving_shore_scuttler',
    );
    expect(visualKeyFor(mob('shore_scuttler', 0, 0))).toBe('mob_crab');
    expect(visualKeyFor(mob('mister_crabs', 0, 0))).toBe('mob_crab');
    expect(visualKeyFor(mob('tide_scuttler'))).toBe('mob_crab');
    expect(visualKeyFor(mob('shoal_scuttler'))).toBe('mob_crab');
    expect(visualKeyFor(mob('old_marrowshell'))).toBe('mob_crab');
  });

  it('resolves the new body for every crab template inside and outside the island', () => {
    for (const id of [
      'shore_scuttler',
      'mister_crabs',
      'tide_scuttler',
      'shoal_scuttler',
      'old_marrowshell',
    ]) {
      for (const [x, z] of [
        [-281, -18],
        [0, 0],
      ]) {
        const def = VISUALS[visualKeyFor(mob(id, x, z))];
        expect(def.url, id).toBe('models/creatures/proving_shore_scuttler.glb');
        expect(def.clips.attack, id).toEqual(['Attack']);
        expect(def.animUrls, id).toBeUndefined();
      }
    }
  });

  it('contains bound, finite, moving clips with closed idle and locomotion loops', async () => {
    const root = (
      await createGlbIO().read('public/models/creatures/proving_shore_scuttler.glb')
    ).getRoot();
    const joints = new Set(
      root
        .listSkins()[0]
        .listJoints()
        .map((node) => node.getName()),
    );
    expect(joints.size).toBe(60);
    for (const name of ['Idle', 'Locomotion', 'Attack', 'Hit', 'Death']) {
      const clip = indexClip(root, name);
      expect(clip.size, name).toBeGreaterThan(0);
      const duration = Math.max(...[...clip.values()].map((channel) => channel.times.at(-1) ?? 0));
      expect(duration, name).toBeGreaterThan(0.5);
      let moving = false;
      for (const [key, channel] of clip) {
        expect(joints.has(key.split('|')[0]), key).toBe(true);
        expect([...channel.values].every(Number.isFinite), key).toBe(true);
        const size = channel.path === 'rotation' ? 4 : 3;
        for (let i = size; i < channel.values.length; i++) {
          if (Math.abs(channel.values[i] - channel.values[i % size]) > 0.001) moving = true;
        }
        if (channel.path === 'rotation') {
          for (let i = 0; i < channel.values.length; i += 4) {
            expect(Math.hypot(...channel.values.slice(i, i + 4)), key).toBeCloseTo(1, 3);
          }
        }
      }
      expect(moving, name).toBe(true);
      if (name === 'Idle' || name === 'Locomotion') {
        const first = samplePose(clip, 0);
        const last = samplePose(clip, duration);
        for (const [key, value] of first) {
          const end = last.get(key);
          if (!end) throw new Error(`Missing end pose: ${key}`);
          const sign =
            value.length === 4 && value.reduce((sum, v, i) => sum + v * end[i], 0) < 0 ? -1 : 1;
          value.forEach((v, i) => {
            expect(v, `${name}: ${key}`).toBeCloseTo(end[i] * sign, 3);
          });
        }
      }
    }
  });

  it('ships the complete Emberclaw vocabulary for every crab variant', () => {
    const ordinary = VISUALS.mob_proving_shore_scuttler;
    const boss = VISUALS.mob_proving_shore_tidepool_boss;
    expect(ordinary.url).toBe('models/creatures/proving_shore_scuttler.glb');
    expect(boss.url).toBe(ordinary.url);
    expect(VISUALS.mob_crab.url).toBe(ordinary.url);
    expect(ordinary.authoredAtlas).toBe(true);
    expect(ordinary.clips).toMatchObject({
      idle: 'Idle',
      walk: 'Locomotion',
      run: 'Locomotion',
      attack: ['Attack'],
      hit: ['Hit'],
      death: 'Death',
    });
    expect(ordinary.animUrls).toBeUndefined();
    for (const def of [ordinary, boss, VISUALS.mob_crab]) {
      expect(def.clips).toEqual(ordinary.clips);
      expect(def.animUrls).toBeUndefined();
      expect(def.authoredAtlas).toBe(true);
    }
    expect(animationNames(`public/${ordinary.url}`)).toEqual([
      'Idle',
      'Locomotion',
      'Attack',
      'Hit',
      'Death',
    ]);
    expect(sha256(`public/${ordinary.url}`)).toBe(sha256(`public/${boss.url}`));
    expect(sha256(`public/${ordinary.url}`)).not.toBe(
      sha256('public/models/creatures/crabenemy.glb'),
    );
  });
});
