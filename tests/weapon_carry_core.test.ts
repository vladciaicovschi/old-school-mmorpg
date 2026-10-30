import { describe, expect, it } from 'vitest';
import { weaponStowedOverlay } from '../src/render/characters/anim_state';
import {
  type WeaponCarryFacts,
  WeaponCarryPresentation,
  weaponUsesHipCarry,
} from '../src/render/characters/weapon_carry_core';

const warrior = (over: Partial<WeaponCarryFacts> = {}): WeaponCarryFacts => ({
  id: 0,
  kind: 'player',
  templateId: 'warrior',
  dead: false,
  inCombat: false,
  autoAttack: false,
  targetId: null,
  aggroTargetId: null,
  castingAbility: null,
  weaponStowed: false,
  ...over,
});

describe('warrior automatic weapon carry', () => {
  it('routes one-handed weapon definitions to the hip, never shields or two-handers', () => {
    expect(weaponUsesHipCarry({ kind: 'weapon' })).toBe(true);
    expect(weaponUsesHipCarry({ kind: 'weapon', hand: 'onehand' })).toBe(true);
    expect(weaponUsesHipCarry({ kind: 'weapon', hand: 'twohand' })).toBe(false);
    expect(weaponUsesHipCarry({ kind: 'armor' })).toBe(false);
    expect(weaponUsesHipCarry({ kind: 'held_offhand' })).toBe(false);
    expect(weaponUsesHipCarry(undefined)).toBe(false);
  });
  it('keeps swimming and riding above automatic carry, without changing other classes', () => {
    expect(weaponStowedOverlay(true, false, false, false)).toBe(false);
    expect(weaponStowedOverlay(false, false, false, true)).toBe(true);
    expect(weaponStowedOverlay(false, true, false, false)).toBe(true);
    expect(weaponStowedOverlay(false, false, true, false)).toBe(true);
    expect(weaponStowedOverlay(false, false, false)).toBe(false);
    expect(weaponStowedOverlay(true, false, false)).toBe(true);
  });
  it('starts stowed and merely selecting a target never draws', () => {
    const p = warrior({ targetId: 4 });
    const carry = new WeaponCarryPresentation();
    carry.sync([p]);
    expect(carry.stowed(p, 1 / 60)).toBe(true);
    expect(carry.combat(p)).toBe(false);
  });

  it('draws for attack intent immediately and settles after combat, with no state writes', () => {
    const p = warrior();
    const carry = new WeaponCarryPresentation();
    carry.sync([p]);
    carry.stowed(p, 0);
    p.autoAttack = true;
    carry.sync([p]);
    expect(carry.stowed(p, 0)).toBe(false);
    p.autoAttack = false;
    carry.sync([p]);
    expect(carry.stowed(p, 0.5)).toBe(false);
    expect(carry.stowed(p, 0.51)).toBe(true);
    expect(p.weaponStowed).toBe(false);
  });

  it('keeps weapons drawn for incoming aggro on an online peer, including id zero', () => {
    const p = warrior();
    const mob = warrior({ id: 8, kind: 'mob', templateId: 'wolf', aggroTargetId: 0 });
    const carry = new WeaponCarryPresentation();
    carry.sync([p, mob]);
    expect(carry.combat(p)).toBe(true);
    expect(carry.stowed(p, 1)).toBe(false);
    mob.dead = true;
    carry.sync([p, mob]);
    expect(carry.combat(p)).toBe(false);
    expect(carry.stowed(p, 1.1)).toBe(true);
  });

  it('draws for warrior abilities and never changes other classes', () => {
    const p = warrior({ castingAbility: 'slam' });
    const mage = warrior({ id: 2, templateId: 'mage' });
    const carry = new WeaponCarryPresentation();
    carry.sync([p, mage]);
    expect(carry.stowed(p, 0)).toBe(false);
    expect(carry.stowed(mage, 0)).toBeUndefined();
  });

  it('manual toggle follows visible carry and a new fight restores automatic mode', () => {
    const p = warrior();
    const carry = new WeaponCarryPresentation();
    carry.sync([p]);
    expect(carry.stowed(p, 0)).toBe(true);
    p.weaponStowed = true;
    expect(carry.stowed(p, 0)).toBe(false);
    p.weaponStowed = false;
    expect(carry.stowed(p, 0)).toBe(true);
    p.inCombat = true;
    carry.sync([p]);
    expect(carry.stowed(p, 0)).toBe(false);
    p.inCombat = false;
    carry.sync([p]);
    expect(carry.stowed(p, 2)).toBe(true);
  });

  it('does not move weapons on death or reuse a dead combat target', () => {
    const p = warrior({ autoAttack: true });
    const carry = new WeaponCarryPresentation();
    carry.sync([p]);
    expect(carry.stowed(p, 0)).toBe(false);
    p.dead = true;
    carry.sync([p]);
    expect(carry.combat(p)).toBe(false);
    expect(carry.stowed(p, 10)).toBe(false);
  });
});
