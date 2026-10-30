import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGlbIO, indexClip } from '../scripts/anim/pose_blend.mjs';
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
  v as unknown as {
    current: THREE.AnimationAction;
    currentIsOneShot: boolean;
    model: THREE.Object3D;
  };
const clip = (v: Visual) => peek(v).current.getClip().name;
function visual(main = 'worn_sword', off: string | null = 'eastbrook_buckler') {
  const v = new CharacterVisual('player_warrior', 0xffffff, 0, main, null, off);
  live.push(v);
  v.setWeaponStowed(false, true);
  v.update(0.05, state(), true);
  return v;
}

beforeAll(async () => {
  const io = createGlbIO();
  const base = (await io.read('public/models/chars/players/t1_warrior.glb')).getRoot();
  const donor = (
    await io.read('public/models/chars/players/warrior_t1_motion_anims.glb')
  ).getRoot();
  const rig = createPoseRig(base);
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
  // Only transport/material geometry is mocked: actual hierarchy, clip keys,
  // CharacterVisual, carry machinery and AnimationMixer all run unchanged.
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
  await assets.preloadCharacterVisualAssets('player_warrior');
  ({ CharacterVisual } = await import('../src/render/characters/visual'));
}, 30000);
afterEach(() => {
  for (const v of live.splice(0)) v.dispose();
});
afterAll(() => {
  vi.doUnmock('../src/render/assets/loader');
  vi.resetModules();
});

describe('equipment-specific motion through the actual T1 Warrior controller', () => {
  it.each([
    ['eastbrook_greatsword', null, 'TwoHand', ['AttackA', 'AttackB', 'AttackC']],
    ['worn_sword', null, 'OneHand', ['AttackA', 'AttackB']],
  ] as const)(
    'cycles only inspected grounded strikes for %s + %s',
    (main, off, family, strikes) => {
      const v = visual(main, off);
      const random = family === 'TwoHand' ? vi.spyOn(Math, 'random') : null;
      for (let strike = 0; strike < strikes.length * 2; strike++) {
        random?.mockReturnValue([0.1, 0.65, 0.85][strike % strikes.length]);
        v.playAttack();
        expect(clip(v)).toBe(`WarriorT1_${family}_${strikes[strike % strikes.length]}`);
      }
      random?.mockRestore();
    },
  );

  it.each([
    ['worn_sword', 'eastbrook_buckler', 'Shield'],
    ['eastbrook_greatsword', null, 'TwoHand'],
    ['worn_sword', null, 'OneHand'],
  ] as const)(
    'selects native idle, drawn movement, attack and jump for %s + %s',
    (main, off, family) => {
      const v = visual(main, off);
      expect(clip(v)).toBe(`WarriorT1_${family}_Idle`);
      v.update(0.1, state({ moving: true, speed: 2 }), true);
      expect(clip(v)).toBe(`WarriorT1_${family}_Walk`);
      v.update(0.1, state({ moving: true, running: true, speed: 5 }), true);
      expect(clip(v)).toBe(`WarriorT1_${family}_Run`);
      v.update(0.1, state({ airborne: true }), true);
      expect(clip(v)).toBe(`WarriorT1_${family}_Jump`);
      expect(peek(v).current.loop).toBe(THREE.LoopOnce);
      expect(peek(v).current.clampWhenFinished).toBe(true);
      v.update(0.1, state({ airborne: true, falling: true }), true);
      expect(clip(v)).toBe(`WarriorT1_${family}_Jump`);
      v.update(0.1, state(), true);
      v.playAttack('heroic_strike');
      expect(clip(v)).toBe(`WarriorT1_${family}_AttackB`);
    },
  );

  it('uses native free-hand exploration movement and jump regardless of stowed weapon type', () => {
    const v = visual('eastbrook_greatsword', null);
    v.setWeaponStowed(true, true);
    v.update(0.1, state({ combat: false }), true);
    expect(clip(v)).toBe('Warrior_TravelIdle');
    v.update(0.1, state({ combat: false, moving: true, speed: 2 }), true);
    expect(clip(v)).toBe('Warrior_TravelWalk');
    v.update(0.1, state({ combat: false, moving: true, running: true, speed: 5 }), true);
    expect(clip(v)).toBe('Warrior_TravelRun');
    v.update(0.1, state({ combat: false, airborne: true }), true);
    expect(clip(v)).toBe('WarriorT1_Unarmed_Jump');
    v.playAttack('mortal_strike');
    expect(clip(v)).toBe('WarriorT1_TwoHand_AttackA');
  });

  it('selects shield ordinary attacks at the configured 65/17.5/17.5 boundaries', () => {
    const v = visual();
    const random = vi.spyOn(Math, 'random');
    try {
      for (const [roll, name] of [
        [0, 'AttackA'],
        [0.649, 'AttackA'],
        [0.65, 'AttackB'],
        [0.824, 'AttackB'],
        [0.825, 'AttackC'],
        [0.999, 'AttackC'],
      ] as const) {
        random.mockReturnValue(roll);
        v.playAttack();
        expect(clip(v)).toBe(`WarriorT1_Shield_${name}`);
      }
    } finally {
      random.mockRestore();
    }
  });

  it('refreshes a stationary stance and ongoing gait when actual equipment changes', () => {
    const v = visual();
    v.setWeapon('eastbrook_greatsword');
    v.update(0.05, state(), true);
    expect(clip(v)).toBe('WarriorT1_TwoHand_Idle');
    v.setOffhand(null);
    v.setWeapon('worn_sword');
    v.update(0.05, state(), true);
    expect(clip(v)).toBe('WarriorT1_OneHand_Idle');
    const walk = state({ moving: true, speed: 2 });
    v.update(0.05, walk, true);
    v.setOffhand('eastbrook_buckler');
    v.update(0.05, walk, true);
    expect(clip(v)).toBe('WarriorT1_Shield_Walk');
  });

  it('drives actual sword/shield arm bones rather than a bound-but-foreign action', () => {
    const v = visual();
    v.playAttack();
    const hand = peek(v).model.getObjectByName('mixamorigRightHand')!;
    const start = hand.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 6; i++) v.update(0.1, state(), true);
    expect(start.distanceTo(hand.getWorldPosition(new THREE.Vector3()))).toBeGreaterThan(0.15);
    expect(v.hasAttackClipOverride('raised_guard')).toBe(true);
  });

  it('plays the native guard and uses the explicit dual-wield fallback for Titan Grip', () => {
    const shield = visual();
    shield.playAttack('raised_guard');
    expect(clip(shield)).toBe('WarriorT1_Shield_Block');
    const twohand = visual('eastbrook_greatsword', null);
    twohand.playAttack('raised_guard');
    expect(clip(twohand)).toBe('WarriorT1_TwoHand_Block');
    const dual = visual('wyrmfang_greatblade', 'deathless_greatblade');
    expect(clip(dual)).toBe('WarriorT1_OneHand_Idle');
    dual.playAttack('heroic_strike');
    expect(clip(dual)).toBe('WarriorT1_OneHand_AttackB');
  });

  it('keeps a long fall clamped and lets death override weapon/profile changes', () => {
    const v = visual('eastbrook_greatsword', null);
    for (let i = 0; i < 30; i++) v.update(0.1, state({ airborne: true, falling: true }), true);
    expect(clip(v)).toBe('WarriorT1_TwoHand_Jump');
    expect(peek(v).current.paused).toBe(true);
    v.update(0.1, state({ dead: true }), true);
    expect(clip(v)).toBe('T1Warrior_Death');
    v.setWeapon('worn_sword');
    v.setOffhand('eastbrook_buckler');
    v.update(0.1, state({ dead: true }), true);
    expect(clip(v)).toBe('T1Warrior_Death');
  });
});
