import assert from 'node:assert/strict';
import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';
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
  combat: true,
  ...patch,
});
const peek = (v: Visual) =>
  v as unknown as { current: THREE.AnimationAction; model: THREE.Object3D };
const current = (v: Visual) => peek(v).current.getClip().name;
function visual(item = 'rusty_hatchet') {
  const v = new CharacterVisual('player_hunter', 0xffffff, 0, item);
  live.push(v);
  v.update(0.05, state(), true);
  return v;
}
function weapon(v: Visual) {
  let found: THREE.Object3D | undefined;
  peek(v).model.traverse((node) => {
    if (node.userData.heldSlot === 0) found = node;
  });
  assert(found);
  return found;
}
beforeAll(async () => {
  const io = createGlbIO();
  const base = (await io.read('public/models/chars/players/t1_hunter.glb')).getRoot();
  const donor = (await io.read('public/models/chars/players/hunter_t1_motion_anims.glb')).getRoot();
  const rig = createPoseRig(base);
  let scene = rig.named.values().next().value;
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
  const animations = [base, donor].flatMap((root) =>
    root.listAnimations().map((animation) => {
      const tracks = [...indexClip(root, animation.getName())].map(([key, channel]) => {
        const [name, path] = key.split('|');
        const property =
          path === 'rotation' ? 'quaternion' : path === 'translation' ? 'position' : 'scale';
        const Track =
          path === 'rotation' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
        return new Track(
          `${THREE.PropertyBinding.sanitizeNodeName(name)}.${property}`,
          Array.from(channel.times),
          Array.from(channel.values),
        );
      });
      return new THREE.AnimationClip(animation.getName(), -1, tracks);
    }),
  );
  vi.resetModules();
  vi.doMock('../src/render/weapon_vfx', async () => ({
    ...(await vi.importActual('../src/render/weapon_vfx')),
    WEAPON_VFX: {},
  }));
  // Real hierarchy, tracks, mixer and attach code; only transport/mesh geometry is replaced.
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn((url: string) =>
      Promise.resolve(
        url.includes('/weapons/')
          ? {
              scene: new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 1, 0.1),
                new THREE.MeshStandardMaterial(),
              ),
              animations: [],
            }
          : { scene: scene.clone(true), animations },
      ),
    ),
    loadTexture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    loadKtx2Texture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    releaseGltf: vi.fn(),
  }));
  const assets = await import('../src/render/characters/assets');
  await assets.preloadCharacterVisualAssets('player_hunter');
  ({ CharacterVisual } = await import('../src/render/characters/visual'));
}, 60000);
afterEach(() => {
  for (const v of live.splice(0)) v.dispose();
});
afterAll(() => {
  vi.doUnmock('../src/render/assets/loader');
  vi.doUnmock('../src/render/weapon_vfx');
  vi.resetModules();
});

describe('actual T1 Hunter equipment controller', () => {
  it.each(['dev_hunter_practice_bow', 'dev_hunter_practice_crossbow'])(
    'has a genuinely bound calm roster pose with %s carried off the hands',
    (item) => {
      const v = visual(item);
      v.setWeaponStowed(true, true);
      expect(v.poseFreeze(['T1Hunter_Idle'], 0.1)).toBe('T1Hunter_Idle');
      expect(peek(v).current.paused).toBe(true);
      let parent = weapon(v).parent;
      let carried = false;
      while (parent) {
        if (parent.name === 'mixamorigSpine2') carried = true;
        expect(parent.name).not.toBe('mixamorigRightHand');
        expect(parent.name).not.toBe('mixamorigLeftHand');
        parent = parent.parent;
      }
      expect(carried).toBe(true);
      v.setWeaponStowed(false, true);
      v.clearPose();
      v.update(0.1, state(), true);
      expect(current(v)).toBe(
        item.endsWith('_bow') ? 'HunterT1_Bow_Idle' : 'HunterT1_Crossbow_Idle',
      );
    },
  );
  it.each(['Bow', 'Crossbow'])(
    'keeps %s gait phase through speed changes and repeated shots',
    (family) => {
      const item = family === 'Bow' ? 'dev_hunter_practice_bow' : 'dev_hunter_practice_crossbow';
      const v = visual(item);
      const control = visual(item);
      for (let frame = 0; frame < 65; frame++) {
        const moving = state({ moving: true, speed: frame < 25 ? 2 : 3 });
        if (frame === 8 || frame === 15 || frame === 29) v.playAttack();
        v.update(0.03, moving, true);
        control.update(0.03, moving, true);
        for (const name of ['Hips', 'LeftUpLeg', 'RightUpLeg']) {
          const actual = peek(v).model.getObjectByName(`mixamorig${name}`);
          const expected = peek(control).model.getObjectByName(`mixamorig${name}`);
          assert(actual && expected);
          expect(
            actual.quaternion.angleTo(expected.quaternion),
            `${family} ${name} ${frame}`,
          ).toBeLessThan(0.01);
          expect(actual.position.distanceTo(expected.position)).toBeLessThan(0.001);
        }
      }
      expect(current(v)).toBe(`HunterT1_${family}_Walk`);
    },
  );
  it('releases the old weapon shot layer when switching bow and crossbow', () => {
    const v = visual('dev_hunter_practice_bow');
    const control = visual('dev_hunter_practice_bow');
    const moving = state({ moving: true, running: true, speed: 5 });
    for (let frame = 0; frame < 8; frame++) {
      v.update(0.05, moving, true);
      control.update(0.05, moving, true);
    }
    for (const family of ['Bow', 'Crossbow', 'Bow'] as const) {
      v.setWeapon(family === 'Bow' ? 'dev_hunter_practice_bow' : 'dev_hunter_practice_crossbow');
      control.setWeapon(
        family === 'Bow' ? 'dev_hunter_practice_bow' : 'dev_hunter_practice_crossbow',
      );
      v.playAttack();
      for (let frame = 0; frame < 5; frame++) {
        v.update(0.03, moving, true);
        control.update(0.03, moving, true);
      }
      expect(current(v)).toBe(`HunterT1_${family}_Shot`);
    }
    for (let frame = 0; frame < 35; frame++) {
      v.update(0.03, moving, true);
      control.update(0.03, moving, true);
    }
    expect(current(v)).toBe('HunterT1_Bow_Run');
    for (let frame = 0; frame < 9; frame++) {
      v.update(0.05, state(), true);
      control.update(0.05, state(), true);
    }
    for (const name of ['Hips', 'RightArm', 'LeftArm', 'RightUpLeg']) {
      const actual = peek(v).model.getObjectByName(`mixamorig${name}`);
      const expected = peek(control).model.getObjectByName(`mixamorig${name}`);
      assert(actual && expected);
      expect(actual.quaternion.angleTo(expected.quaternion)).toBeLessThan(0.01);
    }
  });
  it('does not trigger pose repair during a slow moving-shot blend', () => {
    const v = visual('dev_hunter_practice_bow');
    const moving = state({ moving: true, running: true, speed: 5 });
    for (let frame = 0; frame < 8; frame++) v.update(0.05, moving, true);
    v.playAttack();
    for (let frame = 0; frame < 12; frame++) v.update(0.0001, moving, true);
    expect(current(v)).toBe('HunterT1_Bow_Shot');
    expect(peek(v).current.time).toBeCloseTo(0.0012, 5);
  });
  it.each([
    ['Bow', undefined],
    ['Crossbow', undefined],
    ['Bow', 'arcane_shot'],
    ['Crossbow', 'arcane_shot'],
    ['Bow', 'aimed_shot'],
    ['Crossbow', 'aimed_shot'],
  ] as const)(
    'keeps %s legs moving during %s and preserves gait phase afterward',
    (family, ability) => {
      const item = family === 'Bow' ? 'dev_hunter_practice_bow' : 'dev_hunter_practice_crossbow';
      for (const gait of ['Walk', 'WalkBack', 'Run'] as const) {
        const shot = visual(item);
        const control = visual(item);
        const run = state({
          moving: true,
          running: gait === 'Run',
          backwards: gait === 'WalkBack',
          speed: gait === 'Run' ? 5 : 2,
        });
        for (let frame = 0; frame < 8; frame++) {
          shot.update(0.05, run, true);
          control.update(0.05, run, true);
        }
        shot.playAttack(ability);
        for (let frame = 0; frame < 30; frame++) {
          shot.update(0.03, run, true);
          control.update(0.03, run, true);
          for (const name of ['Hips', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg']) {
            const moving = peek(shot).model.getObjectByName(`mixamorig${name}`);
            const expected = peek(control).model.getObjectByName(`mixamorig${name}`);
            assert(moving && expected);
            expect(
              moving.quaternion.angleTo(expected.quaternion),
              `${family} ${name} frame ${frame}`,
            ).toBeLessThan(0.01);
            expect(
              moving.position.distanceTo(expected.position),
              `${family} ${gait} ${name} frame ${frame} shot ${peek(shot).current.time} control ${peek(control).current.time}`,
            ).toBeLessThan(0.001);
          }
        }
        expect(current(shot)).toBe(`HunterT1_${family}_${gait}`);
      }
    },
  );
  it.each(['Bow', 'Crossbow'])(
    'keeps the %s shot clock when starting/stopping movement and changing gait mid-shot',
    (family) => {
      const v = visual(
        family === 'Bow' ? 'dev_hunter_practice_bow' : 'dev_hunter_practice_crossbow',
      );
      v.playAttack();
      v.update(0.04, state(), true);
      for (const patch of [
        { moving: true, speed: 2 },
        { moving: true, running: true, speed: 5 },
        {},
        { moving: true, backwards: true, speed: 2 },
      ]) {
        const before = peek(v).current.time;
        v.update(0.02, state(patch), true);
        expect(current(v)).toBe(`HunterT1_${family}_Shot`);
        expect(peek(v).current.timeScale).toBe(1);
        expect(peek(v).current.time).toBeCloseTo(before + 0.02, 5);
      }
    },
  );
  it.each(['Bow', 'Crossbow'])(
    'preserves %s jumping legs and airborne clamp while shooting',
    (family) => {
      const item = family === 'Bow' ? 'dev_hunter_practice_bow' : 'dev_hunter_practice_crossbow';
      const v = visual(item);
      const control = visual(item);
      v.playAttack();
      for (let frame = 0; frame < 30; frame++) {
        v.update(0.05, state({ airborne: true }), true);
        control.update(0.05, state({ airborne: true }), true);
        for (const name of ['LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg']) {
          const actual = peek(v).model.getObjectByName(`mixamorig${name}`);
          const expected = peek(control).model.getObjectByName(`mixamorig${name}`);
          assert(actual && expected);
          // The unlayered control crossfades its entire idle into takeoff;
          // after that existing transition, native legs must match exactly.
          if (frame >= 4) expect(actual.quaternion.angleTo(expected.quaternion)).toBeLessThan(0.01);
        }
      }
      expect(current(v)).toBe(`HunterT1_${family}_Jump`);
      expect(peek(v).current.paused).toBe(true);
    },
  );
  it('removes moving-shot layers for death and the equipment preview', () => {
    for (const mode of ['death', 'freeze', 'studio'] as const) {
      const v = visual('dev_hunter_practice_crossbow');
      const control = visual('dev_hunter_practice_crossbow');
      v.update(0.1, state({ moving: true, running: true, speed: 5 }), true);
      v.playAttack();
      v.update(0.05, state({ moving: true, running: true, speed: 5 }), true);
      if (mode === 'death') {
        for (let frame = 0; frame < 8; frame++) {
          v.update(0.05, state({ dead: true }), true);
          control.update(0.05, state({ dead: true }), true);
        }
      } else if (mode === 'freeze') {
        v.poseFreeze(['HunterT1_Crossbow_Idle'], 0.2);
        control.poseFreeze(['HunterT1_Crossbow_Idle'], 0.2);
      } else {
        v.playStudioPreviewClip('HunterT1_Crossbow_Idle');
        control.playStudioPreviewClip('HunterT1_Crossbow_Idle');
        v.update(0.1, state(), true);
        control.update(0.1, state(), true);
      }
      const leg = peek(v).model.getObjectByName('mixamorigRightUpLeg');
      const expected = peek(control).model.getObjectByName('mixamorigRightUpLeg');
      assert(leg && expected);
      expect(leg.quaternion.angleTo(expected.quaternion)).toBeLessThan(0.01);
    }
  });
  it.each(['Bow', 'Crossbow'])(
    'uses and clamps the approved short %s jump in the real mixer',
    (family) => {
      const v = visual(
        family === 'Bow' ? 'dev_hunter_practice_bow' : 'dev_hunter_practice_crossbow',
      );
      v.update(0.05, state({ airborne: true }), true);
      expect(current(v)).toBe(`HunterT1_${family}_Jump`);
      expect(peek(v).current.getClip().duration).toBeCloseTo(0.8333333, 5);
      expect(peek(v).current.loop).toBe(THREE.LoopOnce);
      expect(peek(v).current.clampWhenFinished).toBe(true);
      for (let f = 0; f < 25; f++) v.update(0.05, state({ airborne: true, falling: true }), true);
      expect(peek(v).current.paused).toBe(true);
      expect(peek(v).current.time).toBeCloseTo(0.8333333, 5);
      v.update(0.1, state(), true);
      expect(current(v)).toBe(`HunterT1_${family}_Idle`);
    },
  );
  it('raises the crossbow in the first blend frames without moving into shoulder aim', () => {
    const v = visual('dev_hunter_practice_crossbow');
    const hand = peek(v).model.getObjectByName('mixamorigRightHand');
    const shoulder = peek(v).model.getObjectByName('mixamorigRightArm');
    assert(hand && shoulder);
    const restingY = hand.getWorldPosition(new THREE.Vector3()).y;
    v.playAttack();
    v.update(0.033, state(), true);
    expect(hand.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(restingY + 0.01);
    v.update(0.037, state(), true);
    expect(hand.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(restingY + 0.03);
    v.update(0.05, state(), true);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(
      weapon(v).getWorldQuaternion(new THREE.Quaternion()),
    );
    expect(axis.z).toBeGreaterThan(0.98);
    expect(Math.abs(axis.y)).toBeLessThan(0.08);
    expect(hand.getWorldPosition(new THREE.Vector3()).y).toBeLessThan(
      shoulder.getWorldPosition(new THREE.Vector3()).y - 0.15,
    );
  });
  it('blends the moving bow arm into release rather than snapping it directly to the shot pose', async () => {
    const v = visual('dev_hunter_practice_bow');
    const run = state({ moving: true, running: true, speed: 5 });
    for (let frame = 0; frame < 8; frame++) v.update(0.05, run, true);
    const arm = peek(v).model.getObjectByName('mixamorigRightArm');
    assert(arm);
    const before = arm.quaternion.clone();
    const source = (
      await createGlbIO().read('public/models/chars/players/hunter_t1_motion_anims.glb')
    ).getRoot();
    const native = samplePose(indexClip(source, 'HunterT1_Bow_Shot'), 0.033).get(
      'mixamorig:RightArm|rotation',
    );
    assert(native);
    const fullDelta = before.angleTo(new THREE.Quaternion().fromArray(native).normalize());
    expect(fullDelta).toBeGreaterThan(1);
    v.playAttack();
    v.update(0.033, run, true);
    expect(before.angleTo(arm.quaternion)).toBeLessThan(fullDelta * 0.5);
  });
  it('blends the bow draw hand toward its native face anchor instead of bending it behind the elbow', () => {
    const v = visual('dev_hunter_practice_bow');
    const hand = peek(v).model.getObjectByName('mixamorigRightHand');
    const elbow = peek(v).model.getObjectByName('mixamorigRightForeArm');
    const head = peek(v).model.getObjectByName('mixamorigHead');
    assert(hand && elbow && head);
    const resting = hand.getWorldPosition(new THREE.Vector3());
    v.playAttack();
    v.update(0.033, state(), true);
    expect(hand.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(resting.y + 0.03);
    v.update(0.037, state(), true);
    expect(hand.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(resting.y + 0.15);
    v.update(0.05, state(), true);
    const palm = hand.getWorldPosition(new THREE.Vector3());
    expect(palm.distanceTo(head.getWorldPosition(new THREE.Vector3()))).toBeLessThan(0.35);
    expect(palm.z - elbow.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(0.12);
  });
  it.each([
    ['dev_hunter_practice_bow', 'Bow', 'mixamorigLeftHand', 'arcane_longbow_1'],
    ['dev_hunter_practice_crossbow', 'Crossbow', 'mixamorigRightHand', 'test_crossbow_1'],
    ['rusty_hatchet', 'Crossbow', 'mixamorigRightHand', 'test_crossbow_1'],
  ])('selects correct movement, jump, shot and hand for %s', (item, family, hand, model) => {
    const v = visual(item);
    expect(current(v)).toBe(`HunterT1_${family}_Idle`);
    expect(weapon(v).parent?.name).toBe(hand);
    expect(weapon(v).userData.heldModelUrl).toContain(model);
    const bone = peek(v).model.getObjectByName('mixamorigRightForeArm');
    assert(bone);
    const before = bone.getWorldQuaternion(new THREE.Quaternion());
    v.update(0.1, state({ moving: true, speed: 2 }), true);
    expect(current(v)).toBe(`HunterT1_${family}_Walk`);
    v.update(0.1, state({ moving: true, speed: 2, backwards: true }), true);
    expect(current(v)).toBe(`HunterT1_${family}_WalkBack`);
    v.update(0.1, state({ moving: true, running: true, speed: 5 }), true);
    expect(current(v)).toBe(`HunterT1_${family}_Run`);
    v.update(0.1, state({ airborne: true }), true);
    expect(current(v)).toBe(`HunterT1_${family}_Jump`);
    v.update(0.1, state(), true);
    v.playAttack('arcane_shot');
    v.update(0.2, state(), true);
    expect(current(v)).toBe(`HunterT1_${family}_Shot`);
    expect(bone.getWorldQuaternion(new THREE.Quaternion()).angleTo(before)).toBeGreaterThan(0.02);
  });
  it('switches live items and cosmetics without losing the correct hand, while preserving melee/utility gestures', () => {
    const v = visual();
    v.setWeapon('dev_hunter_practice_bow');
    v.update(0.1, state(), true);
    expect(current(v)).toBe('HunterT1_Bow_Idle');
    expect(weapon(v).parent?.name).toBe('mixamorigLeftHand');
    v.setWeaponSkin('cinderlatch_crossbow');
    v.update(0.1, state(), true);
    expect(current(v)).toBe('HunterT1_Crossbow_Idle');
    v.setWeaponSkin(null);
    v.update(0.1, state(), true);
    expect(current(v)).toBe('HunterT1_Bow_Idle');
    v.playAttack('raptor_strike');
    expect(current(v)).toBe('Hunter_Melee_Gut');
    v.playAttack('aspect_of_the_hawk');
    expect(current(v)).toBe('Spellcast_Raise');
    v.setWeapon('dev_hunter_practice_crossbow');
    expect(weapon(v).parent?.name).toBe('mixamorigRightHand');
  });
  it.each(['Bow', 'Crossbow'])(
    'holds %s aim for a shot then releases, but never aims during pet utility',
    (family) => {
      const item = family === 'Bow' ? 'dev_hunter_practice_bow' : 'dev_hunter_practice_crossbow';
      const v = visual(item);
      for (let i = 0; i < 25; i++)
        v.update(0.05, state({ casting: true, castingAbility: 'aimed_shot' }), true);
      expect(current(v)).toBe(`HunterT1_${family}_Aim`);
      expect(peek(v).current.paused).toBe(true);
      expect(peek(v).current.time).toBeCloseTo(0.6, 3);
      peek(v).model.updateMatrixWorld(true);
      const orientation = weapon(v).getWorldQuaternion(new THREE.Quaternion());
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation);
      expect(
        family === 'Bow' ? axis.y : axis.z,
        'upright bow / forward crossbow barrel',
      ).toBeGreaterThan(0.98);
      if (family === 'Crossbow')
        expect(
          Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(orientation).x),
          'horizontal prod',
        ).toBeGreaterThan(0.98);
      v.playCastRelease('aimed_shot');
      expect(current(v)).toBe(`HunterT1_${family}_Release`);
      const pet = visual(item);
      pet.update(0.1, state({ casting: true, castingAbility: 'tame_beast' }), true);
      expect(current(pet)).toBe('HunterT1_Utility');
    },
  );
});
