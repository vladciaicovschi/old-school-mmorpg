import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnimState } from '../src/render/characters/anim_state';
import { carriedAttachmentFitFor } from '../src/render/characters/carried_attachment_fit';
import type { StowTransition } from '../src/render/characters/stow_transition';
import { WARRIOR_T1_MOTION_CLIPS } from '../src/render/characters/warrior_t1_motion';
import { weaponMotionClipNames } from '../src/render/characters/weapon_motion_core';

// Exercise the real visual/mixer/attachment code; only network asset loading
// is replaced with a tiny Mixamo rig and the same five T1 source clip names.
function asset(url: string) {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.8, 0.25),
    new THREE.MeshStandardMaterial(),
  );
  mesh.position.y = 0.9;
  mesh.name = 'body';
  scene.add(mesh);
  if (url.includes('/weapons/')) return { scene, animations: [] };
  const hips = new THREE.Bone();
  hips.name = 'mixamorigHips';
  hips.position.y = 0.9;
  scene.add(hips);
  const chest = new THREE.Bone();
  chest.name = 'mixamorigSpine2';
  chest.position.y = 0.45;
  hips.add(chest);
  for (const side of ['Left', 'Right']) {
    let parent: THREE.Object3D = chest;
    for (const part of ['Shoulder', 'Arm', 'ForeArm', 'Hand']) {
      const bone = new THREE.Bone();
      bone.name = `mixamorig${side}${part}`;
      bone.position.y = part === 'ForeArm' ? 0.25 : part === 'Hand' ? 0.22 : 0.07;
      if (part === 'Shoulder') bone.position.x = side === 'Left' ? 0.12 : -0.12;
      if (part === 'Arm')
        bone.quaternion.setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          side === 'Left' ? -Math.PI / 2 : Math.PI / 2,
        );
      parent.add(bone);
      parent = bone;
    }
  }
  const tracks: THREE.KeyframeTrack[] = [];
  scene.traverse((node) => {
    if (!(node instanceof THREE.Bone)) return;
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${node.name}.quaternion`,
        [0, 1],
        [...node.quaternion.toArray(), ...node.quaternion.toArray()],
      ),
    );
    tracks.push(
      new THREE.VectorKeyframeTrack(
        `${node.name}.position`,
        [0, 1],
        [...node.position.toArray(), ...node.position.toArray()],
      ),
    );
  });
  return {
    scene,
    animations: [
      ...['Idle', 'Walk', 'Run', 'Attack', 'Death'].map((n) => `T1Warrior_${n}`),
      ...weaponMotionClipNames(WARRIOR_T1_MOTION_CLIPS.weaponMotions),
    ].map(
      (name) =>
        new THREE.AnimationClip(
          name,
          1,
          tracks.map((track) => track.clone()),
        ),
    ),
  };
}

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
  combat: false,
  ...patch,
});
function inspect(v: Visual) {
  return v as unknown as {
    stow: StowTransition;
    current: THREE.AnimationAction;
    currentIsOneShot: boolean;
    model: THREE.Object3D;
  };
}
function visual() {
  const v = new CharacterVisual(
    'player_warrior',
    0xffffff,
    0,
    'worn_sword',
    null,
    'eastbrook_buckler',
  );
  live.push(v);
  v.update(0, state(), true);
  return v;
}
function held(v: Visual) {
  const result: THREE.Object3D[] = [];
  inspect(v).model.traverse((node) => {
    if (node.userData.heldPropHolder) result.push(node);
  });
  return result;
}

beforeAll(async () => {
  vi.resetModules();
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn((url: string) => Promise.resolve(asset(url))),
    loadTexture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    loadKtx2Texture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    releaseGltf: vi.fn(),
  }));
  const assets = await import('../src/render/characters/assets');
  await assets.charactersReady();
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

describe('warrior live carry transitions', () => {
  it('applies claymore-only hand and back fits through live equipment swaps', async () => {
    const { itemAttachmentFitFor, setRuntimeItemAttachmentFit } = await import(
      '../src/render/characters/item_attachment_fit'
    );
    const url = 'models/weapons/meshy/claymore_sword_1.glb';
    const key = `player_warrior@${url}`;
    const before = itemAttachmentFitFor('player_warrior', url) ?? {};
    try {
      setRuntimeItemAttachmentFit(key, {
        mainhand: { position: [0.14, 0.2, 0.3], rotationDeg: [10, 20, 30], scale: 0.72 },
        mainhand_back: { position: [0.24, 0.4, -0.5], rotationDeg: [30, 20, 10], scale: 0.82 },
      });
      const v = visual();
      const weapon = () => {
        const payload = held(v).find((node) => node.userData.heldSlot === 0);
        if (!payload) throw new Error('equipped weapon payload missing');
        return payload;
      };
      const starterScale = weapon().scale.x;
      expect(starterScale).not.toBe(0.72);
      v.setOffhand(null);
      v.setWeapon('eastbrook_greatsword');
      expect(weapon().position.toArray()).toEqual([0.14, 0.2, 0.3]);
      expect(weapon().scale.x).toBe(0.72);
      v.setWeaponStowed(true, true);
      expect(weapon().parent?.name).toBe('mixamorigSpine2');
      expect(weapon().position.toArray()).toEqual([0.24, 0.4, -0.5]);
      expect(weapon().scale.x).toBe(0.82);
      v.setWeaponStowed(false, true);
      expect(weapon().scale.x).toBe(0.72);
      v.setWeapon('worn_sword');
      expect(weapon().scale.x).toBe(starterScale);
    } finally {
      setRuntimeItemAttachmentFit(key, before);
    }
  });
  it('uses editor carry profiles in new world visuals without changing hand fits', async () => {
    const { carriedAttachmentFitFor, setRuntimeCarriedAttachmentFit } = await import(
      '../src/render/characters/carried_attachment_fit'
    );
    const fit = carriedAttachmentFitFor('player_warrior');
    const before = { ...fit };
    try {
      setRuntimeCarriedAttachmentFit('player_warrior', {
        mainhand_hip: { position: [0.34, -0.22, 0.08], rotationDeg: [10, 20, 30], scale: 0.38 },
        offhand_back: { position: [0, 0.1, -0.4], rotationDeg: [0, 180, 0], scale: 0.29 },
      });
      const v = visual();
      expect(held(v).find((node) => node.userData.heldSlot === 0)?.scale.x).toBe(0.45);
      v.setWeaponStowed(true, true);
      const weapon = held(v).find((node) => node.userData.heldSlot === 0)!;
      expect(weapon.parent?.name).toBe('mixamorigHips');
      expect(weapon.position.toArray()).toEqual([0.34, -0.22, 0.08]);
      expect(weapon.scale.x).toBe(0.38);
      expect(held(v).find((node) => node.userData.heldSlot === 1)?.scale.x).toBe(0.29);
      v.setWeaponStowed(false, true);
      expect(held(v).find((node) => node.userData.heldSlot === 0)?.scale.x).toBe(0.45);
    } finally {
      for (const key of Object.keys(fit)) delete fit[key as keyof typeof fit];
      Object.assign(fit, before);
    }
  });
  it('draws immediately for the first normal or circular hit and cancels a pending swap', () => {
    for (const spin of [false, true]) {
      const v = visual();
      v.setWeaponStowed(true, true);
      v.setWeaponStowed(false);
      expect(inspect(v).stow.timer).toBeGreaterThan(0);
      if (spin) v.playWhirl();
      else v.playAttack();
      expect(inspect(v).stow).toEqual({ attached: false, target: false, timer: 0 });
      expect(held(v)).toHaveLength(2);
      expect(held(v).every((node) => node.parent?.name.endsWith('Hand'))).toBe(true);
      v.update(0.5, state({ combat: true }), true);
      expect(inspect(v).stow.attached).toBe(false);
    }
  });

  it('plays full stationary gestures and returns to relaxed idle after the swap', () => {
    const v = visual();
    v.setWeaponStowed(true);
    expect(inspect(v).current.getClip().name).toBe('Warrior_HipStow');
    v.update(0.2, state(), true);
    expect(inspect(v).stow.attached).toBe(false);
    v.update(0.21, state(), true);
    expect(inspect(v).stow.attached).toBe(true);
    expect(inspect(v).currentIsOneShot).toBe(true);
    for (let n = 0; n < 60; n++) v.update(1 / 60, state(), true);
    expect(inspect(v).current.getClip().name).toBe('Warrior_TravelIdle');
    expect(inspect(v).currentIsOneShot).toBe(false);
  });

  it('yields to running immediately, including movement that starts during a gesture', () => {
    const run = state({ moving: true, running: true, speed: 7 });
    const v = visual();
    v.setWeaponStowed(true);
    v.update(0.1, run, true);
    expect(inspect(v).stow).toEqual({ attached: true, target: true, timer: 0 });
    expect(inspect(v).currentIsOneShot).toBe(false);
    expect(inspect(v).current.getClip().name).toBe('Warrior_TravelRun');
    v.setWeaponStowed(false);
    expect(inspect(v).stow).toEqual({ attached: false, target: false, timer: 0 });
    expect(inspect(v).current.getClip().name).toBe('WarriorT1_Shield_Run');
  });

  it('cancels a pending carry swap before death, including offscreen timer advancement', () => {
    for (const initiallyStowed of [false, true]) {
      const v = visual();
      v.setWeaponStowed(initiallyStowed, true);
      v.setWeaponStowed(!initiallyStowed);
      expect(inspect(v).stow.timer).toBeGreaterThan(0);
      v.update(0.5, state({ dead: true }), true);
      v.advanceOffscreen(1);
      expect(inspect(v).stow).toEqual({
        attached: initiallyStowed,
        target: initiallyStowed,
        timer: 0,
      });
    }
  });

  it('keeps the calibrated sword and shield sizes when carried on the back', () => {
    const v = visual();
    const before = held(v)
      .map((node) => node.scale.x)
      .sort();
    expect(before).toEqual([0.3, 0.45]);
    v.setWeaponStowed(true, true);
    expect(
      held(v)
        .map((node) => node.scale.x)
        .sort(),
    ).toEqual(before);
    expect(held(v).find((node) => node.userData.heldSlot === 0)?.parent?.name).toBe(
      'mixamorigHips',
    );
    expect(held(v).find((node) => node.userData.heldSlot === 1)?.parent?.name).toBe(
      'mixamorigSpine2',
    );
  });

  it('uses the new T1 body and updates the carry anchor on a stowed weapon swap', () => {
    const v = visual();
    v.setWeaponStowed(true, true);
    v.setWeapon('eastbrook_greatsword');
    expect(held(v).find((node) => node.userData.heldSlot === 0)?.parent?.name).toBe(
      'mixamorigSpine2',
    );
    v.setWeaponStowed(false);
    expect(inspect(v).current.getClip().name).toBe('Warrior_TravelDraw');
    v.setWeaponStowed(true, true);
    v.setWeapon('worn_sword');
    expect(held(v).find((node) => node.userData.heldSlot === 0)?.parent?.name).toBe(
      'mixamorigHips',
    );
    v.setWeaponStowed(false);
    expect(inspect(v).current.getClip().name).toBe('Warrior_HipDraw');
  });

  it('mirrors a second one-handed weapon to the other hip and selects dual draw', () => {
    const v = visual();
    v.setOffhand('worn_sword');
    v.setWeaponStowed(true, true);
    const props = held(v);
    expect(props.every((node) => node.parent?.name === 'mixamorigHips')).toBe(true);
    // The carry editor's saved per-slot calibration takes precedence over the
    // original +/-0.26 prototype defaults; animation changes must preserve it.
    const calibration = carriedAttachmentFitFor('player_warrior');
    expect(props.find((node) => node.userData.heldSlot === 0)?.position.x).toBeCloseTo(
      calibration.mainhand_hip?.position[0] ?? 0.26,
    );
    expect(props.find((node) => node.userData.heldSlot === 1)?.position.x).toBeCloseTo(
      calibration.offhand_hip?.position[0] ?? -0.26,
    );
    v.setWeaponStowed(false);
    expect(inspect(v).current.getClip().name).toBe('Warrior_DualHipDraw');
  });

  it('settles old carry gestures when gear changes before the attachment swap', () => {
    const v = visual();
    v.setWeaponStowed(true);
    v.update(0.1, state(), true);
    v.setWeapon('eastbrook_greatsword');
    expect(inspect(v).stow).toEqual({ attached: true, target: true, timer: 0 });
    expect(inspect(v).currentIsOneShot).toBe(false);
    expect(held(v).find((node) => node.userData.heldSlot === 0)?.parent?.name).toBe(
      'mixamorigSpine2',
    );
    v.setWeaponStowed(false);
    v.setOffhand('worn_sword');
    expect(inspect(v).stow).toEqual({ attached: false, target: false, timer: 0 });
    expect(inspect(v).currentIsOneShot).toBe(false);
    expect(held(v).every((node) => node.parent?.name.endsWith('Hand'))).toBe(true);
  });
});
