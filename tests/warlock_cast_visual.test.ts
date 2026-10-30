import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGlbIO, indexClip } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';
import { createWarlockHandGlow } from '../src/render/ability_vfx/hand_glow';
import type { AnimState } from '../src/render/characters/anim_state';

type Visual = InstanceType<typeof import('../src/render/characters/visual').CharacterVisual>;
let CharacterVisual: typeof import('../src/render/characters/visual').CharacterVisual;
const live: Visual[] = [];
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
const cast = state({
  casting: true,
  castingAbility: 'shadow_bolt',
  castTargetMode: 'hostile',
  castTotal: 3,
  castRemaining: 3,
});
const peek = (visual: Visual) =>
  visual as unknown as {
    current: THREE.AnimationAction;
    currentIsOneShot: boolean;
    model: THREE.Object3D;
  };
function visual(stowed = true) {
  const result = new CharacterVisual('player_warlock', 0xffffff, 0);
  live.push(result);
  result.setWeaponStowed(stowed, true);
  result.update(0, state(), true);
  return result;
}
const startAt = (total: number, duration: number) =>
  Math.max(0, duration - 0.76 - (total - Math.min(0.3, total * 0.25)) * 1.35);

beforeAll(async () => {
  const io = createGlbIO();
  const root = (await io.read('public/models/chars/players/warlock_t1.glb')).getRoot();
  const donor = (await io.read('public/models/chars/players/warlock_ability_anims.glb')).getRoot();
  // Use the actual exported bone hierarchy and motion keys. Only geometry,
  // materials and network loading are replaced; no browser/WebGL is started.
  const rig = createPoseRig(root);
  let scene = rig.named.values().next().value!;
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
  const animations = [root, donor].flatMap((source) =>
    source.listAnimations().map((animation) => {
      const tracks = [...indexClip(source, animation.getName())].map(([key, channel]) => {
        const [name, path] = key.split('|');
        const trackName = `${THREE.PropertyBinding.sanitizeNodeName(name)}.${path === 'rotation' ? 'quaternion' : path === 'translation' ? 'position' : 'scale'}`;
        const Track =
          path === 'rotation' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
        return new Track(trackName, Array.from(channel.times), Array.from(channel.values));
      });
      return new THREE.AnimationClip(animation.getName(), -1, tracks);
    }),
  );
  vi.resetModules();
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn((url: string) =>
      Promise.resolve(
        url.includes('/weapons/')
          ? { scene: new THREE.Group(), animations: [] }
          : { scene: scene.clone(true), animations },
      ),
    ),
    loadTexture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    loadKtx2Texture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    releaseGltf: vi.fn(),
  }));
  const assets = await import('../src/render/characters/assets');
  await assets.preloadCharacterVisualAssets('player_warlock');
  ({ CharacterVisual } = await import('../src/render/characters/visual'));
}, 30000);

afterEach(() => {
  for (const v of live.splice(0)) v.dispose();
});
afterAll(() => {
  vi.doUnmock('../src/render/assets/loader');
  vi.resetModules();
});

describe('Warlock cast phases through the actual CharacterVisual', () => {
  it('uses a free-hand release for a wand auto, but keeps physical staff attacks unchanged', () => {
    const v = visual(false);
    expect(v.playMagicAutoAttack()).toBe(true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_CastShadow_Release');
    v.update(0.05, state(), true);
    const before = peek(v).current.time;
    expect(v.playMagicAutoAttack()).toBe(false);
    expect(peek(v).current.time).toBe(before);
    v.playAttack();
    expect(peek(v).current.getClip().name).toContain('WarlockT1_StaffStrike');
    expect((v as unknown as { currentOneShotIsMagicAuto: boolean }).currentOneShotIsMagicAuto).toBe(
      false,
    );
  });
  it('uses axe-pack staff idle only while drawn, preserving stowed idles and locomotion', () => {
    const v = visual(false);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_StaffIdle');
    v.setWeaponStowed(true, true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_TravelIdle');
    v.update(0.3, state({ combat: true }), true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_ReadyIdle');
    v.setWeaponStowed(false, true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_StaffIdle');
    v.update(0.3, state({ moving: true, speed: 2 }), true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_TravelWalk');
    v.update(0.3, cast, true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_CastShadow_Loop');
  });
  it('moves the staff hand/back for Z and keeps release free-handed until a physical swing', () => {
    const v = visual(false);
    const staffParent = () => {
      let holder: THREE.Object3D | undefined;
      peek(v).model.traverse((node) => {
        if (node.userData.heldPropHolder) holder = node;
      });
      if (!holder) throw new Error('Warlock staff holder missing');
      return holder.parent?.name;
    };
    expect(staffParent()).toBe('mixamorigRightHand');
    v.setWeaponStowed(true, true);
    expect(staffParent()).toBe('mixamorigSpine2');
    v.setWeaponStowed(false, true);
    expect(staffParent()).toBe('mixamorigRightHand');
    // Authoritative accepted spell stows first; release overlay survives snapshots.
    v.setWeaponStowed(true, true);
    v.update(0.1, cast, true);
    expect(staffParent()).toBe('mixamorigSpine2');
    v.playCastRelease('shadow_bolt', 'hostile');
    expect(staffParent()).toBe('mixamorigSpine2');
    for (let i = 0; i < 60; i++) v.update(0.05, state(), true);
    expect(staffParent()).toBe('mixamorigSpine2');
    // A physical attack can interrupt a subsequent release immediately.
    v.playCastRelease('shadow_bolt', 'hostile');
    v.setWeaponStowed(false, true);
    v.playAttack();
    expect(peek(v).current.getClip().name).toContain('WarlockT1_StaffStrike');
    expect(staffParent()).toBe('mixamorigRightHand');
  });
  it('can draw into staff idle after movement interrupts a cast release', () => {
    const v = visual();
    v.update(0.1, cast, true);
    v.playCastRelease('shadow_bolt', 'hostile');
    v.update(0.1, state({ moving: true, speed: 2 }), true);
    v.update(0.1, state(), true);
    v.setWeaponStowed(false, true);
    v.update(0.1, state(), true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_StaffIdle');
    let parent: string | undefined;
    peek(v).model.traverse((node) => {
      if (node.userData.heldPropHolder) parent = node.parent?.name;
    });
    expect(parent).toBe('mixamorigRightHand');
  });
  it('binds preparation glow to both actual animated hands, not a fixed chest anchor', () => {
    const v = visual();
    const draw = createWarlockHandGlow(new Map([[7, { visualKey: 'player_warlock', visual: v }]]));
    const overlay = { push: vi.fn() };
    const first = new THREE.Vector3();
    for (let frame = 0; frame < 30; frame++) {
      v.update(0.05, state({ ...cast, castRemaining: 3 - frame * 0.05 }), true);
      overlay.push.mockClear();
      expect(draw(7, 0x6622cc, 0xddbbff, frame / 60, 1, overlay)).toBe(true);
      expect(overlay.push).toHaveBeenCalledTimes(4);
      for (const [index, side] of ['Left', 'Right'].entries()) {
        const hand = peek(v).model.getObjectByName(`mixamorig${side}Hand`)!;
        const world = hand.getWorldPosition(new THREE.Vector3());
        const wrist = world.clone();
        const knuckle = peek(v).model.getObjectByName(`mixamorig${side}HandMiddle1`)!;
        world.lerp(knuckle.getWorldPosition(new THREE.Vector3()), 0.6);
        expect(world.distanceTo(wrist)).toBeGreaterThan(0.02);
        expect(overlay.push.mock.calls[index * 2].slice(0, 3)).toEqual(world.toArray());
        if (index === 0 && frame === 0) first.copy(world);
        if (index === 0 && frame === 29) expect(first.distanceTo(world)).toBeGreaterThan(0.05);
      }
    }
  });

  it.each([
    ['self', 1.5],
    ['self', 6],
    ['ally', 1.5],
    ['ally', 6],
  ] as const)(
    'joins the same preparation to the upward release for %s over %s seconds',
    (mode, total) => {
      const v = visual();
      const kind = mode === 'self' ? 'Self' : 'Ally';
      for (let i = 0; i <= total * 20; i++) {
        v.update(
          0.05,
          state({
            ...cast,
            castTargetMode: mode,
            castTotal: total,
            castRemaining: Math.max(0, total - i / 20),
          }),
          true,
        );
        expect(peek(v).current.getClip().name).toBe(`WarlockT1_Cast${kind}_Loop`);
      }
      v.playCastRelease('shadow_bolt', mode);
      v.update(0.05, state(), true);
      expect(peek(v).current.getClip().name).toBe(`WarlockT1_Cast${kind}_Release`);
      peek(v).model.updateMatrixWorld(true);
      const hand = peek(v)
        .model.getObjectByName('mixamorigRightHand')!
        .getWorldPosition(new THREE.Vector3());
      const head = peek(v)
        .model.getObjectByName('mixamorigHead')!
        .getWorldPosition(new THREE.Vector3());
      expect(hand.y).toBeGreaterThan(head.y + 0.2);
      v.update(0.1, state({ moving: true, speed: 2 }), true);
      expect(peek(v).current.getClip().name).toBe('WarlockT1_TravelWalk');
    },
  );
  it.each([0.5, 1.5, 3, 6, 12])(
    'plays an end-aligned preparation at capped speed over a %s-second cast',
    (total) => {
      const v = visual();
      v.update(1 / 60, state({ ...cast, castTotal: total, castRemaining: total }), true);
      const charge = peek(v).current;
      const start = startAt(total, charge.getClip().duration);
      expect(charge.time).toBeCloseTo(start);
      let previous = start;
      for (let i = 1; i <= total * 60; i++) {
        v.update(
          1 / 60,
          state({ ...cast, castTotal: total, castRemaining: Math.max(0, total - i / 60) }),
          true,
        );
        expect(peek(v).current.time).toBeGreaterThanOrEqual(previous);
        if (total - i / 60 > Math.min(0.3, total * 0.25) + 0.0000001) {
          expect(peek(v).current.timeScale).toBeLessThanOrEqual(1.35);
          expect(peek(v).current.time - previous).toBeLessThanOrEqual(1.35 / 60 + 0.00001);
        }
        previous = peek(v).current.time;
        expect(peek(v).current).toBe(charge);
        expect(peek(v).current.paused).toBe(false);
      }
      expect(charge.time).toBeCloseTo(charge.getClip().duration);
      v.playCastRelease('shadow_bolt', 'hostile');
      expect(peek(v).current.getClip().name).toBe('WarlockT1_CastShadow_Release');
      expect(peek(v).currentIsOneShot).toBe(true);
      for (let i = 0; i < 12; i++)
        v.update(0.1, state({ moving: true, running: true, speed: 5 }), true);
      expect(peek(v).current.getClip().name).toBe('WarlockT1_TravelRun');
      expect(peek(v).currentIsOneShot).toBe(false);
    },
  );

  it('cancels preparation without throwing, and restarts the native motion on the next cast', () => {
    const v = visual();
    for (let i = 0; i < 20; i++) v.update(0.1, cast, true);
    v.update(0.1, state({ moving: true, speed: 2 }), true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_TravelWalk');
    v.update(0.1, cast, true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_CastShadow_Loop');
    expect(peek(v).current.time).toBeCloseTo(startAt(3, peek(v).current.getClip().duration));
  });

  it('keeps friendly releases, death and sparse animation ticks on the correct clock', () => {
    const v = visual();
    v.update(0.1, state({ ...cast, castTargetMode: 'self' }), true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_CastSelf_Loop');
    v.playCastRelease('life_tap', 'self');
    expect(peek(v).current.getClip().name).toBe('WarlockT1_CastSelf_Release');
    v.update(0.1, state({ dead: true }), true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_Death');
    const other = visual();
    other.update(0.1, cast, true);
    const previous = peek(other).current.time;
    for (let i = 0; i < 20; i++) other.update(0.1, cast, false);
    expect(peek(other).current.time).toBe(previous);
    other.update(0.1, cast, true);
    expect(peek(other).current.time).toBeCloseTo(previous + 0.3 * 1.35);
  });

  it('lets a fresh cast interrupt release, but ignores a lingering old casting snapshot', () => {
    const v = visual();
    v.update(0.1, state({ ...cast, castRemaining: 0.05 }), true);
    v.playCastRelease('shadow_bolt', 'hostile');
    v.update(0.1, state({ ...cast, castRemaining: 0.05 }), true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_CastShadow_Release');
    v.update(0.1, cast, true);
    expect(peek(v).current.getClip().name).toBe('WarlockT1_CastShadow_Loop');
    expect(peek(v).current.time).toBeCloseTo(startAt(3, peek(v).current.getClip().duration));
  });
});
