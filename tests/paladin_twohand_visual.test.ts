import assert from 'node:assert/strict';
import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig, retargetPose } from '../scripts/anim/rig_pose.mjs';
import type { AnimState } from '../src/render/characters/anim_state';
import { VISUALS } from '../src/render/characters/manifest';
import { weaponMotionClipNames } from '../src/render/characters/weapon_motion_core';

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
const name = (v: Visual) => peek(v).current.getClip().name;
function visual(main = 'ironshod_maul', off: string | null = null) {
  const v = new CharacterVisual('player_paladin', 0xffffff, 0, main, null, off);
  live.push(v);
  v.update(0.05, state(), true);
  return v;
}
beforeAll(async () => {
  const io = createGlbIO();
  const body = (await io.read('public/models/chars/players/t1_paladin.glb')).getRoot();
  const donor = (
    await io.read('public/models/chars/players/paladin_twohand_motion_anims.glb')
  ).getRoot();
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
  vi.resetModules();
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn((url: string) =>
      Promise.resolve(
        url.includes('/weapons/')
          ? { scene: new THREE.Group(), animations: [] }
          : { scene: scene.clone(true), animations },
      ),
    ),
    loadTexture: () => Promise.resolve(new THREE.Texture()),
    loadKtx2Texture: () => Promise.resolve(new THREE.Texture()),
    releaseGltf: vi.fn(),
  }));
  const assets = await import('../src/render/characters/assets');
  await assets.preloadCharacterVisualAssets('player_paladin');
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

describe('Paladin two-hand motion on its actual target hierarchy', () => {
  it('selects two-hand idle, gait, classic jump and native cast', () => {
    const v = visual();
    expect(name(v)).toBe('PaladinT1_TwoHand_Idle');
    for (const [patch, suffix] of [
      [{ moving: true, speed: 2 }, 'Walk'],
      [{ moving: true, running: true, speed: 5 }, 'Run'],
      [{ airborne: true }, 'Jump'],
      [{ casting: true, castingAbility: 'holy_light' }, 'Cast'],
    ] as const) {
      v.update(0.1, state(patch), true);
      expect(name(v)).toBe(`PaladinT1_TwoHand_${suffix}`);
      if (suffix === 'Jump') {
        expect(peek(v).current.loop).toBe(THREE.LoopOnce);
        expect(peek(v).current.clampWhenFinished).toBe(true);
      }
    }
  });
  it('selects grounded strikes and the rare spin instead of the legacy two-hand Chop', () => {
    const v = visual();
    const random = vi.spyOn(Math, 'random');
    for (const [roll, suffix] of [
      [0.1, 'AttackA'],
      [0.65, 'AttackB'],
      [0.85, 'AttackC'],
      [0.99, 'AttackSpin'],
    ] as const) {
      random.mockReturnValue(roll);
      v.playAttack();
      expect(name(v)).toBe(`PaladinT1_TwoHand_${suffix}`);
    }
    for (const [id, suffix] of [
      ['final_edict', 'AttackA'],
      ['bastion_sweep', 'AttackC'],
      ['hammer_of_justice', 'AttackB'],
      ['blessing_of_might', 'Cast'],
    ] as const) {
      v.playAttack(id);
      expect(name(v)).toBe(`PaladinT1_TwoHand_${suffix}`);
    }
  });
  it('uses baked free-hand gaits with the hammer stowed and restores the two-hand grip on Z', () => {
    const v = visual();
    v.setWeaponStowed(true);
    for (const [patch, clip] of [
      [{}, 'Warrior_TravelIdle'],
      [{ moving: true, speed: 2 }, 'Warrior_TravelWalk'],
      [{ moving: true, running: true, speed: 5 }, 'Warrior_TravelRun'],
      [{ airborne: true }, 'PaladinT1_Unarmed_Jump'],
    ] as const) {
      for (let frame = 0; frame < 30; frame++) v.update(0.05, state(patch), true);
      expect(name(v)).toBe(clip);
    }
    v.setWeaponStowed(false);
    for (let frame = 0; frame < 30; frame++) v.update(0.05, state(), true);
    expect(name(v)).toBe('PaladinT1_TwoHand_Idle');
  });
  it('switches the actual held model without a shield and restores the starter family', () => {
    const v = visual('training_mace', 'eastbrook_buckler');
    expect(name(v)).toBe('T1Paladin_Idle');
    v.setOffhand(null);
    v.setWeapon('ironshod_maul');
    v.update(0.1, state(), true);
    expect(name(v)).toBe('PaladinT1_TwoHand_Idle');
    const holders: THREE.Object3D[] = [];
    peek(v).model.traverse((node) => {
      if (node.userData.heldPropHolder) holders.push(node);
    });
    expect(holders.some((node) => node.userData.heldSlot === 1)).toBe(false);
    expect(holders.find((node) => node.userData.heldSlot === 0)?.userData.heldModelUrl).toBe(
      'models/weapons/meshy/dwarven_warhammer_2h_1.glb',
    );
    v.setWeapon('training_mace');
    v.setOffhand('eastbrook_buckler');
    v.update(0.1, state(), true);
    expect(name(v)).toBe('T1Paladin_Idle');
    v.playAttack();
    expect(name(v)).toBe('T1Paladin_Attack');
  });
  it('ships only animation data with exact warrior jump timing and target-rest transfer', async () => {
    const io = createGlbIO();
    const body = (await io.read('public/models/chars/players/t1_paladin.glb')).getRoot();
    const targetRig = createPoseRig(body);
    const sourceRig = createPoseRig(
      (await io.read('public/models/chars/players/t1_warrior.glb')).getRoot(),
    );
    const donor = (
      await io.read('public/models/chars/players/paladin_twohand_motion_anims.glb')
    ).getRoot();
    const source = (
      await io.read('public/models/chars/players/warrior_t1_motion_anims.glb')
    ).getRoot();
    expect(donor.listMeshes()).toHaveLength(0);
    expect(donor.listSkins()).toHaveLength(0);
    expect(donor.listAnimations()).toHaveLength(15);
    const available = donor.listAnimations().map((anim) => anim.getName());
    for (const clip of weaponMotionClipNames(VISUALS.player_paladin.clips.weaponMotions))
      expect(available).toContain(clip);
    for (const [gait, clip] of Object.entries(VISUALS.player_paladin.clips.travel ?? {}))
      if (gait !== 'draw' && gait !== 'stow') expect(available).toContain(clip);
    for (const anim of donor.listAnimations()) {
      const clip = indexClip(donor, anim.getName());
      for (const [key, channel] of clip) {
        expect(targetRig.rest.has(key)).toBe(true);
        expect([...channel.values].every(Number.isFinite)).toBe(true);
      }
    }
    const jump = indexClip(donor, 'PaladinT1_TwoHand_Jump');
    const sourceJump = indexClip(source, 'WarriorT1_TwoHand_Jump');
    const duration = Math.max(...[...jump.values()].map((ch) => ch.times.at(-1) ?? 0));
    expect(duration).toBeCloseTo(0.833333, 5);
    for (const time of [0, 0.2, 0.6, duration]) {
      const expected = retargetPose(samplePose(sourceJump, time), sourceRig.rest, targetRig.rest);
      const actual = samplePose(jump, time);
      for (const [key, value] of expected) {
        const got = actual.get(key);
        assert(got);
        if (key.endsWith('|rotation'))
          expect(
            new THREE.Quaternion().fromArray(got).angleTo(new THREE.Quaternion().fromArray(value)),
          ).toBeLessThan(0.003);
        else for (const [i, component] of value.entries()) expect(got[i]).toBeCloseTo(component, 3);
      }
    }
  });
});
