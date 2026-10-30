import assert from 'node:assert/strict';
import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGlbIO, indexClip } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';
import type { AnimState } from '../src/render/characters/anim_state';

type Visual = InstanceType<typeof import('../src/render/characters/visual').CharacterVisual>;
let CharacterVisual: typeof import('../src/render/characters/visual').CharacterVisual;
const classes = ['mage', 'priest', 'druid', 'shaman', 'rogue'] as const;
type Class = (typeof classes)[number];
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
const prefix = (cls: Class) => `T1${cls[0].toUpperCase()}${cls.slice(1)}Motion_`;
const peek = (v: Visual) =>
  v as unknown as {
    current: THREE.AnimationAction;
    currentIsOneShot: boolean;
    model: THREE.Object3D;
  };
const clip = (v: Visual) => peek(v).current.getClip().name;
function visual(cls: Class, main = 'gnarled_staff', off: string | null = null, stowed = true) {
  const v = new CharacterVisual(`player_${cls}`, 0xffffff, 0, main, null, off);
  live.push(v);
  v.setWeaponStowed(stowed, true);
  v.update(0.05, state(), true);
  return v;
}
function holders(v: Visual) {
  const result: THREE.Object3D[] = [];
  peek(v).model.traverse((node) => {
    if (node.userData.heldPropHolder) result.push(node);
  });
  return result;
}
function mainParent(v: Visual) {
  const main = holders(v).find((node) => node.userData.heldSlot === 0);
  assert(main);
  return main.parent?.name;
}

beforeAll(async () => {
  const io = createGlbIO();
  const fixtures = new Map<string, { scene: THREE.Object3D; animations: THREE.AnimationClip[] }>();
  for (const cls of classes) {
    const bodyUrl = `models/chars/players/t1_${cls}.glb`;
    const donorUrl = `models/chars/players/${cls}_t1_motion_anims.glb`;
    const body = (await io.read(`public/${bodyUrl}`)).getRoot();
    const donor = (await io.read(`public/${donorUrl}`)).getRoot();
    const rig = createPoseRig(body);
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
    const animations = [body, donor].flatMap((root) =>
      root.listAnimations().map(
        (anim) =>
          new THREE.AnimationClip(
            anim.getName(),
            -1,
            [...indexClip(root, anim.getName())].map(([key, channel]) => {
              const [bone, path] = key.split('|');
              const property =
                path === 'rotation' ? 'quaternion' : path === 'translation' ? 'position' : 'scale';
              const Track =
                path === 'rotation' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
              return new Track(
                `${THREE.PropertyBinding.sanitizeNodeName(bone)}.${property}`,
                Array.from(channel.times),
                Array.from(channel.values),
              );
            }),
          ),
      ),
    );
    fixtures.set(bodyUrl, { scene, animations });
    fixtures.set(donorUrl, { scene, animations });
  }
  vi.resetModules();
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn((url: string) => {
      const fixture = fixtures.get(url);
      return Promise.resolve(
        fixture
          ? { scene: fixture.scene.clone(true), animations: fixture.animations }
          : { scene: new THREE.Group(), animations: [] },
      );
    }),
    loadTexture: () => Promise.resolve(new THREE.Texture()),
    loadKtx2Texture: () => Promise.resolve(new THREE.Texture()),
    releaseGltf: vi.fn(),
  }));
  const assets = await import('../src/render/characters/assets');
  await Promise.all(classes.map((cls) => assets.preloadCharacterVisualAssets(`player_${cls}`)));
  ({ CharacterVisual } = await import('../src/render/characters/visual'));
}, 30000);
afterEach(() => {
  for (const v of live.splice(0)) v.dispose();
  vi.restoreAllMocks();
});
afterAll(() => {
  vi.doUnmock('../src/render/assets/loader');
  vi.resetModules();
});

describe('remaining native T1 motion through the real mixer', () => {
  it.each(classes)('%s supports a calm, weapon-stowed roster pose on its native mixer', (cls) => {
    const v = visual(cls);
    const idle =
      cls === 'rogue' || cls === 'shaman' ? 'Warrior_TravelIdle' : `${prefix(cls)}TravelIdle`;
    v.setWeaponStowed(true, true);
    expect(v.poseFreeze([idle], 0.1)).toBe(idle);
    expect(mainParent(v)).not.toBe('mixamorigRightHand');
    expect(mainParent(v)).not.toBe('mixamorigLeftHand');
    expect(peek(v).current.paused).toBe(true);
  });
  it.each(['mage', 'priest', 'druid'] as const)(
    '%s releases a magic auto from the hand without replaying preparation or an active spell',
    (cls) => {
      const v = visual(cls, 'gnarled_staff', null, false);
      const p = prefix(cls);
      expect(v.playMagicAutoAttack()).toBe(true);
      expect(clip(v)).toBe(`${p}CastShadow_Release`);
      expect(mainParent(v)).toBe('mixamorigSpine2');
      const palm = new THREE.Vector3();
      expect(v.castPalmWorldPosition(palm)).toBe(true);
      v.update(0.05, state(), true);
      const before = peek(v).current.time;
      expect(v.playMagicAutoAttack()).toBe(false);
      expect(peek(v).current.time).toBe(before);
      for (let frame = 0; frame < 40; frame++) v.update(0.05, state(), true);
      expect(mainParent(v)).toBe('mixamorigRightHand');
      v.update(
        0.05,
        state({ casting: true, castingAbility: 'audit_spell', castTotal: 3, castRemaining: 2 }),
        true,
      );
      const preparation = peek(v).current;
      expect(v.playMagicAutoAttack()).toBe(false);
      expect(peek(v).current).toBe(preparation);
    },
  );
  it.each(['mage', 'priest', 'druid'] as const)(
    '%s keeps moving legs during magic autos and yields immediately to the next queued cast',
    (cls) => {
      const v = visual(cls);
      const control = visual(cls);
      const moving = state({ moving: true, speed: 2 });
      for (let frame = 0; frame < 8; frame++) {
        v.update(0.05, moving, true);
        control.update(0.05, moving, true);
      }
      expect(v.playMagicAutoAttack()).toBe(true);
      for (let frame = 0; frame < 8; frame++) {
        v.update(0.03, moving, true);
        control.update(0.03, moving, true);
        expect(clip(v)).toBe(`${prefix(cls)}CastShadow_Release`);
        for (const name of ['Hips', 'RightUpLeg', 'LeftUpLeg']) {
          const actual = peek(v).model.getObjectByName(`mixamorig${name}`);
          const expected = peek(control).model.getObjectByName(`mixamorig${name}`);
          assert(actual && expected);
          expect(actual.quaternion.angleTo(expected.quaternion)).toBeLessThan(0.01);
          expect(actual.position.distanceTo(expected.position)).toBeLessThan(0.001);
        }
      }
      v.update(
        0.05,
        state({ casting: true, castingAbility: 'audit_spell', castTotal: 3, castRemaining: 3 }),
        true,
      );
      expect(clip(v)).toBe(`${prefix(cls)}CastShadow_Loop`);
      expect(peek(v).currentIsOneShot).toBe(false);
    },
  );
  it.each(classes)(
    '%s plays free-hand idle/gaits/classic jump/fall and native hit/death',
    (cls) => {
      const v = visual(cls);
      const p = prefix(cls);
      const travel = cls === 'rogue' || cls === 'shaman' ? 'Warrior_Travel' : `${p}Travel`;
      expect(clip(v)).toBe(`${travel}Idle`);
      for (const [patch, name] of [
        [{ moving: true, speed: 2 }, `${travel}Walk`],
        [{ moving: true, running: true, speed: 5 }, `${travel}Run`],
        [{ airborne: true }, `${p}Jump`],
        [{ airborne: true, falling: true }, `${p}Jump`],
      ] as const) {
        v.update(0.1, state(patch), true);
        expect(clip(v)).toBe(name);
        if (patch.airborne) {
          expect(peek(v).current.loop).toBe(THREE.LoopOnce);
          expect(peek(v).current.clampWhenFinished).toBe(true);
        }
      }
      v.update(0.2, state(), true);
      v.playHit();
      expect(clip(v)).toBe(`${p}${cls === 'shaman' ? 'OneHand_' : ''}Hit`);
      v.update(0.1, state({ dead: true }), true);
      expect(clip(v)).toBe(`T1${cls[0].toUpperCase()}${cls.slice(1)}_Death`);
    },
  );
  it.each(['mage', 'priest', 'druid'] as const)(
    '%s switches calm/staff idle on Z and actually animates native hands',
    (cls) => {
      const v = visual(cls);
      v.setWeaponStowed(false, true);
      v.update(0.1, state(), true);
      expect(clip(v)).toBe(`${prefix(cls)}StaffIdle`);
      expect(mainParent(v)).toBe('mixamorigRightHand');
      v.setWeaponStowed(true, true);
      v.update(0.1, state(), true);
      expect(clip(v)).toBe(`${prefix(cls)}TravelIdle`);
      expect(mainParent(v)).toBe('mixamorigSpine2');
      const hand = peek(v).model.getObjectByName('mixamorigRightHand');
      assert(hand);
      const initial = hand.getWorldPosition(new THREE.Vector3());
      const assertFinitePose = () => {
        v.root.traverse((node) => {
          expect(
            [
              ...node.position.toArray(),
              ...node.quaternion.toArray(),
              ...node.scale.toArray(),
            ].every(Number.isFinite),
            `${cls}: ${node.name} ${JSON.stringify({ p: node.position.toArray(), q: node.quaternion.toArray(), s: node.scale.toArray() })}`,
          ).toBe(true);
        });
      };
      assertFinitePose();
      v.playCastRelease('audit_unknown_spell', 'hostile');
      for (let i = 0; i < 8; i++) v.update(0.05, state(), true);
      assertFinitePose();
      expect(initial.distanceTo(hand.getWorldPosition(new THREE.Vector3()))).toBeGreaterThan(0.05);
    },
  );
  it.each(['mage', 'priest', 'druid', 'shaman'] as const)(
    '%s joins short and long hostile/self/ally casts, with capped preparation and interruptible recovery',
    (cls) => {
      const p = prefix(cls);
      for (const total of [0.5, 3, 12])
        for (const [mode, family] of [
          ['hostile', 'Shadow'],
          ['self', 'Self'],
          ['ally', 'Ally'],
        ] as const) {
          const v = visual(cls, cls === 'shaman' ? 'rusty_hatchet' : 'gnarled_staff');
          for (let frame = 0; frame <= total * 20; frame++) {
            const remaining = Math.max(0, total - frame / 20);
            v.update(
              0.05,
              state({
                casting: true,
                castingAbility: 'audit_unknown_spell',
                castTargetMode: mode,
                castTotal: total,
                castRemaining: remaining,
              }),
              true,
            );
            expect(clip(v)).toBe(`${p}Cast${family}_Loop`);
            if (remaining > Math.min(0.3, total * 0.25) + 0.00001)
              expect(peek(v).current.timeScale).toBeLessThanOrEqual(1.35);
            expect(mainParent(v)).toBe('mixamorigSpine2');
          }
          expect(peek(v).current.time).toBeCloseTo(peek(v).current.getClip().duration, 4);
          v.playCastRelease('audit_unknown_spell', mode);
          expect(clip(v)).toBe(`${p}Cast${family}_Release`);
          expect(peek(v).currentIsOneShot).toBe(true);
          v.update(0.1, state({ moving: true, speed: 2 }), true);
          expect(clip(v)).toBe(cls === 'shaman' ? 'Warrior_TravelWalk' : `${p}TravelWalk`);
        }
    },
  );
  it('selects Shaman one-hand/shield/two-hand stances and keeps Stormstrike physical', () => {
    for (const [weapon, offhand, family] of [
      ['rusty_hatchet', null, 'OneHand'],
      ['rusty_hatchet', 'eastbrook_buckler', 'Shield'],
      ['ironshod_maul', null, 'TwoHand'],
      ['rusty_hatchet', 'rusty_dagger', 'OneHand'], // Explicit dual-wield fallback.
    ] as const) {
      const v = visual('shaman', weapon, offhand, false);
      expect(clip(v)).toBe(`T1ShamanMotion_${family}_Idle`);
      for (const [patch, suffix] of [
        [{ moving: true, speed: 2 }, 'Walk'],
        [{ moving: true, running: true, speed: 5 }, 'Run'],
        [{ airborne: true }, 'Jump'],
        [{ airborne: true, falling: true }, 'Jump'],
      ] as const) {
        v.update(0.1, state(patch), true);
        expect(clip(v)).toBe(`T1ShamanMotion_${family}_${suffix}`);
      }
      v.update(0.1, state(), true);
      v.playHit();
      expect(clip(v)).toBe(`T1ShamanMotion_${family}_Hit`);
      for (let frame = 0; frame < 60; frame++) v.update(0.05, state(), true);
      v.playCastRelease('lightning_bolt', 'hostile');
      expect(mainParent(v)).toBe('mixamorigSpine2');
      v.playAttack('stormstrike');
      expect(clip(v)).toMatch(new RegExp(`^T1ShamanMotion_${family}_Attack[ABC]$`));
      expect(mainParent(v)).toBe('mixamorigRightHand');
      if (offhand)
        expect(holders(v).find((node) => node.userData.heldSlot === 1)?.parent?.name).toBe(
          'mixamorigLeftHand',
        );
      for (let frame = 0; frame < 60; frame++) v.update(0.05, state(), true);
      v.playAttack('lightning_shield');
      expect(clip(v)).toBe('T1ShamanMotion_CastSelf_Release');
      expect(mainParent(v)).toBe('mixamorigSpine2');
    }
  });
  it('uses the Mage fire family for hostile spells while a friendly target still wins', () => {
    const v = visual('mage');
    for (let frame = 0; frame <= 30; frame++) {
      v.update(
        0.05,
        state({
          casting: true,
          castingAbility: 'fireball',
          castTargetMode: 'hostile',
          castTotal: 1.5,
          castRemaining: Math.max(0, 1.5 - frame / 20),
        }),
        true,
      );
      expect(clip(v)).toBe('T1MageMotion_CastFire_Loop');
    }
    v.playCastRelease('fireball', 'hostile');
    expect(clip(v)).toBe('T1MageMotion_CastFire_Release');
    v.playCastRelease('fireball', 'self');
    expect(clip(v)).toBe('T1MageMotion_CastSelf_Release');
    v.playCastRelease('fireball', 'ally');
    expect(clip(v)).toBe('T1MageMotion_CastAlly_Release');
  });
  it('uses Rogue dagger guard, three native stabs, kick and explicit utility fallbacks', () => {
    const v = visual('rogue', 'rusty_dagger', 'rusty_dagger', false);
    expect(clip(v)).toBe('T1RogueMotion_ReadyIdle');
    for (const name of ['StabA', 'StabB', 'StabC']) {
      v.playAttack();
      expect(clip(v)).toBe(`T1RogueMotion_${name}`);
      expect(mainParent(v)).toBe('mixamorigRightHand');
    }
    for (const [id, name] of [
      ['kick', 'Kick'],
      ['backstab', 'StabB'],
      ['eviscerate', 'StabC'],
      ['blind', 'Utility'],
      ['stealth', 'Utility'],
    ] as const) {
      v.playAttack(id);
      expect(clip(v)).toBe(`T1RogueMotion_${name}`);
      expect(mainParent(v)).toBe('mixamorigRightHand');
    }
    v.setWeaponStowed(true, true);
    for (let frame = 0; frame < 100; frame++) v.update(0.05, state(), true);
    v.update(0.1, state({ moving: true, speed: 2 }), true);
    expect(clip(v)).toBe('Warrior_TravelWalk');
    v.playAttack('sinister_strike');
    expect(clip(v)).toBe('T1RogueMotion_StabA');
    expect(mainParent(v)).toBe('mixamorigRightHand');
  });
});
