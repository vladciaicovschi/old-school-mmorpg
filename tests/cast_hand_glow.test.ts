import { Group, Object3D, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CASTER_MOB_TARGETS } from '../scripts/anim/caster_mob_targets.mjs';
import { createWarlockHandGlow } from '../src/render/ability_vfx/hand_glow';

function fixture(sanitized = false) {
  const scene = new Group();
  const root = new Group();
  const hands = ['Left', 'Right'].map((side, i) => {
    const bone = new Object3D();
    bone.name = `mixamorig${sanitized ? '' : ':'}${side}Hand`;
    bone.position.set(i ? -0.3 : 0.3, 1.1, 0.2);
    const middle = new Object3D();
    middle.name = `${bone.name}Middle1`;
    middle.position.set(0, -0.1, 0);
    bone.add(middle);
    root.add(bone);
    return bone;
  });
  scene.add(root);
  const view = { visualKey: 'player_warlock', visual: { root, isFar: false } };
  const views = new Map([[7, view]]);
  const draw = createWarlockHandGlow(views);
  const overlay = { push: vi.fn() };
  return { scene, root, hands, view, views, draw, overlay };
}

describe('Warlock hand-bound cast preparation', () => {
  it.each(['mage', 'priest', 'druid', 'shaman', 'paladin', 'hunter', 'warrior', 'rogue'])(
    'anchors both palms for %s on fixed and composed bodies',
    (cls) => {
      const f = fixture(true);
      for (const suffix of ['', '_modular']) {
        f.view.visualKey = `player_${cls}${suffix}`;
        f.overlay.push.mockClear();
        expect(f.draw(7, 0x123456, 0xffffff, 0.5, 1, f.overlay)).toBe(true);
        expect(f.overlay.push.mock.calls.map((call) => call[3])).toEqual([
          0x123456, 0x123456, 0x123456, 0x123456,
        ]);
      }
    },
  );
  it.each(CASTER_MOB_TARGETS.map((target) => target.visualKey))(
    'anchors the caster %s glow to both moving palms',
    (visualKey) => {
      const f = fixture(true);
      f.view.visualKey = visualKey;
      f.root.rotation.y = 0.8;
      f.root.scale.setScalar(1.3);
      for (const phase of [0, 0.5, 1]) {
        f.hands[0].rotation.z = phase;
        f.hands[1].position.y += 0.15;
        f.overlay.push.mockClear();
        expect(f.draw(7, 0x6622cc, 0xffffff, phase, 1, f.overlay)).toBe(true);
        expect(f.overlay.push).toHaveBeenCalledTimes(4);
        for (let i = 0; i < 2; i++) {
          const palm = f.hands[i].localToWorld(new Vector3(0, -0.06, 0));
          for (const [axis, value] of palm.toArray().entries())
            expect(f.overlay.push.mock.calls[i * 2][axis]).toBeCloseTo(value, 10);
        }
      }
    },
  );
  it.each([false, true])(
    'follows both animated hands including yaw and scale (sanitized=%s)',
    (sanitized) => {
      const f = fixture(sanitized);
      f.scene.position.set(4, 2, -3);
      f.scene.rotation.y = 0.8;
      f.root.scale.setScalar(1.4);
      expect(f.draw(7, 0x6622cc, 0xddbbff, 0.5, 1, f.overlay)).toBe(true);
      expect(f.overlay.push).toHaveBeenCalledTimes(4);
      for (let i = 0; i < 2; i++) {
        const world = f.hands[i].localToWorld(new Vector3(0, -0.06, 0));
        for (const [axis, value] of world.toArray().entries()) {
          expect(f.overlay.push.mock.calls[i * 2][axis]).toBeCloseTo(value, 10);
        }
        expect(f.overlay.push.mock.calls[i * 2][3]).toBe(0x6622cc);
        expect(f.overlay.push.mock.calls[i * 2 + 1][3]).toBe(0x6622cc);
      }
      f.hands[0].position.y += 0.5;
      f.hands[0].rotation.x = Math.PI / 2;
      f.overlay.push.mockClear();
      f.draw(7, 0xff6600, 0xffffcc, 0.8, 0, f.overlay);
      const palm = f.hands[0].localToWorld(new Vector3(0, -0.06, 0));
      for (const [axis, value] of palm.toArray().entries()) {
        expect(f.overlay.push.mock.calls[0][axis]).toBeCloseTo(value, 10);
      }
    },
  );

  it('resolves bones only once per rig, but refreshes them when the visual is replaced', () => {
    const f = fixture();
    const lookup = vi.spyOn(f.root, 'getObjectByName');
    f.draw(7, 1, 2, 0, 1, f.overlay);
    lookup.mockClear();
    for (let i = 0; i < 30; i++) f.draw(7, 1, 2, i / 30, 1, f.overlay);
    expect(lookup).not.toHaveBeenCalled();
    const replacement = fixture(true);
    f.view.visual = replacement.view.visual;
    expect(f.draw(7, 1, 2, 0, 1, f.overlay)).toBe(true);
  });

  it('leaves non-humanoid forms, missing rigs and hidden ancestors on the fallback path', () => {
    const f = fixture();
    f.view.visualKey = 'form_bear';
    expect(f.draw(7, 1, 2, 0, 1, f.overlay)).toBe(false);
    f.view.visualKey = 'player_warlock';
    f.scene.visible = false;
    expect(f.draw(7, 1, 2, 0, 1, f.overlay)).toBe(false);
    f.scene.visible = true;
    f.hands[1].removeFromParent();
    expect(f.draw(7, 1, 2, 0, 1, f.overlay)).toBe(false);
    expect(f.draw(99, 1, 2, 0, 1, f.overlay)).toBe(false);
    expect(f.overlay.push).not.toHaveBeenCalled();
  });

  it('does not create scene resources or mutate joint transforms', () => {
    const f = fixture();
    f.scene.updateMatrixWorld(true);
    const before = f.root.toJSON();
    for (let i = 0; i < 60; i++) f.draw(7, 1, 2, i / 60, 1, f.overlay);
    expect(f.root.toJSON()).toEqual(before);
    f.views.delete(7);
    f.overlay.push.mockClear();
    expect(f.draw(7, 1, 2, 1, 1, f.overlay)).toBe(false);
    expect(f.overlay.push).not.toHaveBeenCalled();
  });

  it('checks live inner visibility after caching and tolerates a pending far-bake intent', () => {
    const f = fixture();
    expect(f.draw(7, 1, 2, 0, 1, f.overlay)).toBe(true);
    f.overlay.push.mockClear();
    f.hands[1].visible = false;
    expect(f.draw(7, 1, 2, 0, 1, f.overlay)).toBe(false);
    expect(f.overlay.push).not.toHaveBeenCalled();
    f.hands[1].visible = true;
    f.view.visual.isFar = true;
    expect(f.draw(7, 1, 2, 0, 1, f.overlay)).toBe(true);
  });

  it('uses the current skill colour for both glow layers, including fire and Gloom Bolt', async () => {
    const { abilityVfxSpec } = await import('../src/render/ability_vfx_registry');
    const { abilityVfxColor } = await import('../src/render/ability_vfx_core');
    const f = fixture();
    for (const [cls, ability] of [
      ['warlock', 'shadow_bolt'],
      ['warlock', 'immolate'],
      ['mage', 'frostbolt'],
      ['priest', 'heal'],
      ['druid', 'wrath'],
      ['shaman', 'lightning_bolt'],
      ['paladin', 'holy_light'],
      ['hunter', 'aimed_shot'],
      ['rogue', 'blind'],
      ['warrior', 'heroic_strike'],
    ]) {
      f.view.visualKey = `player_${cls}`;
      const color = abilityVfxColor(abilityVfxSpec(ability)!);
      f.overlay.push.mockClear();
      f.draw(7, color, 0xffffff, 0.5, 1, f.overlay);
      expect(f.overlay.push.mock.calls.map((call) => call[3])).toEqual([
        color,
        color,
        color,
        color,
      ]);
    }
  });

  it('falls back to the wrist only when a hand lacks finger bones', () => {
    const f = fixture();
    for (const hand of f.hands) hand.clear();
    expect(f.draw(7, 1, 2, 0, 1, f.overlay)).toBe(true);
    expect(f.overlay.push.mock.calls[0].slice(0, 3)).toEqual(
      f.hands[0].getWorldPosition(new Vector3()).toArray(),
    );
  });
});
