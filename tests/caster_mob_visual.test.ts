import assert from 'node:assert/strict';
import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CASTER_MOB_TARGETS, casterMobAnimationUrl } from '../scripts/anim/caster_mob_targets.mjs';
import { createGlbIO, indexClip } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';
import type { AnimState } from '../src/render/characters/anim_state';
import type { CharacterVisual as VisualType } from '../src/render/characters/visual';

let CharacterVisual: typeof VisualType;
const live: VisualType[] = [];
const state = (patch: Partial<AnimState> = {}): AnimState => ({
  speed: 0,
  moving: false,
  running: false,
  airborne: false,
  backwards: false,
  dead: false,
  casting: false,
  swimming: false,
  submerged: false,
  swimPitch: 0,
  wading: false,
  sitting: false,
  ...patch,
});
const peek = (visual: VisualType) =>
  visual as unknown as {
    current: THREE.AnimationAction;
    currentIsOneShot: boolean;
    model: THREE.Object3D;
  };
beforeAll(async () => {
  const io = createGlbIO();
  const assets = new Map<string, { scene: THREE.Object3D; animations: THREE.AnimationClip[] }>();
  for (const target of CASTER_MOB_TARGETS) {
    const body = (await io.read(`public/${target.bodyUrl}`)).getRoot();
    const donor = (await io.read(`public/${casterMobAnimationUrl(target)}`)).getRoot();
    const rig = createPoseRig(body);
    let scene = [...rig.named.values()][0];
    assert(scene);
    while (scene.parent) scene = scene.parent;
    scene.traverse((node) => {
      node.name = THREE.PropertyBinding.sanitizeNodeName(node.name);
    });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.8, 0.3),
      new THREE.MeshStandardMaterial(),
    );
    mesh.position.y = 0.9;
    scene.add(mesh);
    for (const [url, source] of [
      [target.bodyUrl, body],
      [casterMobAnimationUrl(target), donor],
    ] as const) {
      const animations = source.listAnimations().map(
        (animation) =>
          new THREE.AnimationClip(
            animation.getName(),
            -1,
            [...indexClip(source, animation.getName())].map(([key, channel]) => {
              const [name, path] = key.split('|');
              const track = `${THREE.PropertyBinding.sanitizeNodeName(name)}.${path === 'rotation' ? 'quaternion' : path === 'translation' ? 'position' : 'scale'}`;
              const Track =
                path === 'rotation' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
              return new Track(track, Array.from(channel.times), Array.from(channel.values));
            }),
          ),
      );
      assets.set(url, { scene, animations });
    }
  }
  vi.resetModules();
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn((url: string) => {
      const entry = [...assets].find(([path]) => url.includes(path.replace(/\.glb$/, '')))?.[1];
      return Promise.resolve(
        entry
          ? { scene: entry.scene.clone(true), animations: entry.animations }
          : { scene: new THREE.Group(), animations: [] },
      );
    }),
    loadTexture: () => Promise.resolve(new THREE.Texture()),
    loadKtx2Texture: () => Promise.resolve(new THREE.Texture()),
    releaseGltf: vi.fn(),
  }));
  const loader = await import('../src/render/characters/assets');
  for (const target of CASTER_MOB_TARGETS)
    await loader.preloadCharacterVisualAssets(target.visualKey);
  ({ CharacterVisual } = await import('../src/render/characters/visual'));
}, 30000);
afterEach(() => {
  for (const visual of live.splice(0)) visual.dispose();
});
afterAll(() => {
  vi.doUnmock('../src/render/assets/loader');
  vi.resetModules();
});

function visual(key: string) {
  const result = new CharacterVisual(key, 0xffffff, 0);
  live.push(result);
  result.update(0, state(), true);
  return result;
}
describe('caster mobs through the real CharacterVisual mixer', () => {
  it.each(CASTER_MOB_TARGETS)('$visualKey: joins all assigned bolt identities', (target) => {
    for (const ability of ['shadow_bolt', 'wrath', 'fireball']) {
      const v = visual(target.visualKey);
      v.update(
        0.1,
        state({
          casting: true,
          castingAbility: ability,
          castTargetMode: 'hostile',
          castTotal: 1.7,
          castRemaining: 1.6,
        }),
        true,
      );
      expect(peek(v).current.getClip().name).toBe(`${target.prefix}_PrepareHostile`);
      v.playCastRelease(ability, 'hostile');
      expect(peek(v).current.getClip().name).toBe(`${target.prefix}_ReleaseHostile`);
      expect(peek(v).currentIsOneShot).toBe(true);
    }
  });
  it.each(CASTER_MOB_TARGETS)(
    '$visualKey: joins short/normal/long hostile and friendly casts without restarting',
    (target) => {
      for (const mode of ['hostile', 'self', 'ally'] as const)
        for (const total of [0.5, 1.7, 3, 12]) {
          const v = visual(target.visualKey);
          expect(v.supportsJoinedCastRelease).toBe(true);
          const snapshot = {
            casting: true,
            castingAbility: 'shadow_bolt',
            castTargetMode: mode,
            castTotal: total,
            castRemaining: total,
          };
          v.update(0, state(snapshot), true);
          const prepare = peek(v).current;
          expect(v.isPreparingFittedCast).toBe(true);
          expect(prepare.getClip().name).toBe(
            `${target.prefix}_Prepare${mode === 'hostile' ? 'Hostile' : 'Friendly'}`,
          );
          const first = prepare.time;
          for (let frame = 1; frame <= total * 30; frame++) {
            const remaining = Math.max(0, total - frame / 30);
            v.update(1 / 30, state({ ...snapshot, castRemaining: remaining }), true);
            expect(peek(v).current).toBe(prepare);
            if (remaining > Math.min(0.3, total * 0.25) + 0.0001)
              expect(prepare.timeScale).toBeLessThanOrEqual(1.35);
          }
          expect(prepare.time).toBeCloseTo(prepare.getClip().duration, 4);
          if (total < 3) expect(first).toBeGreaterThan(8);
          v.playCastRelease('unregistered_test_spell', mode);
          expect(v.isPreparingFittedCast).toBe(false);
          expect(peek(v).current.getClip().name).toBe(
            `${target.prefix}_Release${mode === 'hostile' ? 'Hostile' : 'Friendly'}`,
          );
          expect(peek(v).current.time).toBe(0);
          expect(peek(v).currentIsOneShot).toBe(true);
          // A stale pre-release snapshot must not reopen the old preparation.
          v.update(0.05, state({ ...snapshot, castRemaining: 0 }), true);
          expect(peek(v).current.getClip().name).toContain('_Release');
          for (let frame = 0; frame < 90; frame++) v.update(1 / 30, state(), true);
          expect(peek(v).current.getClip().name).toBe(`${target.prefix}_Idle`);
        }
    },
  );
  it.each(CASTER_MOB_TARGETS)(
    '$visualKey: cancellation, native movement/death and id-less attacks retain their routes',
    (target) => {
      const v = visual(target.visualKey);
      const cast = state({
        casting: true,
        castingAbility: 'shadow_bolt',
        castTargetMode: 'hostile',
        castTotal: 3,
        castRemaining: 2,
      });
      v.update(0.1, cast, true);
      v.update(0.1, state({ moving: true, speed: 2 }), true);
      expect(peek(v).current.getClip().name).not.toContain('_Release');
      expect(peek(v).current.getClip().name).not.toContain('_Prepare');
      v.update(0.1, state(), true);
      v.playAttack();
      expect(peek(v).current.getClip().name).toBe(`${target.prefix}_Attack`);
      v.update(0.1, state({ dead: true }), true);
      expect(peek(v).current.getClip().name).not.toContain(target.prefix);
    },
  );
});
