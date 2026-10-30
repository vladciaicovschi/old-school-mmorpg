import { describe, expect, it } from 'vitest';
import { WARRIOR_T1_MOTION_CLIPS } from '../src/render/characters/warrior_t1_motion';
import {
  drawnIdleClip,
  type WeaponMotionProfiles,
  type WeaponMotionSet,
  weaponMotionAttackIndex,
  weaponMotionBaseClip,
  weaponMotionClipNames,
  weaponMotionFor,
  weaponMotionStyle,
} from '../src/render/characters/weapon_motion_core';
import { ITEMS } from '../src/sim/data';

const motion = (prefix: string): WeaponMotionSet => ({
  idle: `${prefix}_Idle`,
  walk: `${prefix}_Walk`,
  run: `${prefix}_Run`,
  jump: `${prefix}_Jump`,
  attack: [`${prefix}_Attack`],
});

describe('actual-equipment motion profile selection', () => {
  it('limits a drawn idle to standing states and never replaces free-hand or moving poses', () => {
    for (const state of ['idle', 'combatIdle']) {
      expect(drawnIdleClip('StaffIdle', state, false)).toBe('StaffIdle');
      expect(drawnIdleClip('StaffIdle', state, true)).toBeUndefined();
      expect(drawnIdleClip(undefined, state, false)).toBeUndefined();
    }
    for (const state of ['cast', 'walk', 'walkBack', 'run', 'jump', 'fall', 'swim', 'sit'])
      expect(drawnIdleClip('StaffIdle', state, false)).toBeUndefined();
  });
  it('uses exact visual-only weighted intervals and retains legacy cycling without weights', () => {
    const weights = [0.65, 0.175, 0.175];
    expect(weaponMotionAttackIndex(3, weights, 0, 2)).toBe(0);
    expect(weaponMotionAttackIndex(3, weights, 0.649999, 2)).toBe(0);
    expect(weaponMotionAttackIndex(3, weights, 0.65, 0)).toBe(1);
    expect(weaponMotionAttackIndex(3, weights, 0.824999, 0)).toBe(1);
    expect(weaponMotionAttackIndex(3, weights, 0.825001, 0)).toBe(2);
    expect(weaponMotionAttackIndex(3, weights, 1, 0)).toBe(2);
    const counts = [0, 0, 0];
    for (let index = 0; index < 10000; index++) {
      counts[weaponMotionAttackIndex(3, weights, (index + 0.5) / 10000, 0)]++;
    }
    expect(counts).toEqual([6500, 1750, 1750]);
    for (const invalid of [undefined, [], [1], [0, 0, 0], [-1, 1, 1], [NaN, 1, 1]]) {
      expect(weaponMotionAttackIndex(3, invalid, 0.3, 5)).toBe(2);
    }
    expect(weaponMotionAttackIndex(0, [], 0.3, 0)).toBe(0);
  });

  it('limits loadout overrides to owned base states and leaves water/death alone', () => {
    const profile = motion('Two');
    expect(weaponMotionBaseClip(profile, 'combatIdle')).toBe('Two_Idle');
    expect(weaponMotionBaseClip(profile, 'walkBack')).toBe('Two_Walk');
    expect(weaponMotionBaseClip(profile, 'fall')).toBe('Two_Jump');
    expect(weaponMotionBaseClip(profile, 'death')).toBeUndefined();
    expect(weaponMotionBaseClip(profile, 'swim')).toBeUndefined();
    expect(weaponMotionBaseClip(undefined, 'walk')).toBeUndefined();
  });

  it.each([
    [null, null, 'unarmed'],
    [null, 'eastbrook_buckler', 'unarmed'],
    ['missing_item', 'eastbrook_buckler', 'unarmed'],
    ['worn_sword', null, 'onehand'],
    ['worn_sword', 'missing_item', 'onehand'],
    ['worn_sword', 'eastbrook_buckler', 'shield'],
    ['worn_sword', 'rusty_dagger', 'dualwield'],
    ['wyrmfang_greatblade', null, 'twohand'],
    ['wyrmfang_greatblade', 'eastbrook_buckler', 'twohand'],
    ['wyrmfang_greatblade', 'rusty_dagger', 'dualwield'],
    ['wyrmfang_greatblade', 'deathless_greatblade', 'dualwield'],
  ] as const)('routes %s and %s to %s', (mainhand, offhand, expected) => {
    expect(weaponMotionStyle(mainhand, offhand)).toBe(expected);
  });

  it('does not mistake an ordinary caster offhand for a shield', () => {
    const offhand = Object.values(ITEMS).find(
      (item) => item.kind === 'held_offhand' && item.slot === 'offhand',
    );
    expect(offhand).toBeDefined();
    expect(weaponMotionStyle('worn_sword', offhand!.id)).toBe('onehand');
  });

  it('keeps profile fallback opt-in and prefers explicit dual-wield motion', () => {
    const onehand = motion('One');
    const dualwield = motion('Dual');
    const profiles: WeaponMotionProfiles = { onehand };
    expect(weaponMotionFor(profiles, 'worn_sword', 'rusty_dagger')).toBe(onehand);
    profiles.dualwield = dualwield;
    expect(weaponMotionFor(profiles, 'worn_sword', 'rusty_dagger')).toBe(dualwield);
    expect(weaponMotionFor(profiles, 'wyrmfang_greatblade', null)).toBeUndefined();
    expect(weaponMotionFor(profiles, null, null)).toBeUndefined();
    expect(weaponMotionFor(undefined, 'worn_sword', null)).toBeUndefined();
  });

  it('collects all action names once, including ability-only guards', () => {
    const onehand = motion('One');
    onehand.cast = 'Cast';
    onehand.hit = ['Hit'];
    onehand.attackByAbility = { raised_guard: 'Block', heroic_strike: 'One_Attack' };
    expect(weaponMotionClipNames({ onehand, dualwield: onehand })).toEqual([
      'One_Idle',
      'One_Walk',
      'One_Run',
      'One_Jump',
      'One_Attack',
      'Cast',
      'Hit',
      'Block',
    ]);
    expect(weaponMotionClipNames(undefined)).toEqual([]);
  });

  it('keeps the fixed warrior shield and two-hand actions inside their own families', () => {
    const profiles = WARRIOR_T1_MOTION_CLIPS.weaponMotions;
    const shield = weaponMotionFor(profiles, 'worn_sword', 'eastbrook_buckler')!;
    const twohand = weaponMotionFor(profiles, 'wyrmfang_greatblade', null)!;
    expect(shield.idle).toBe('WarriorT1_Shield_Idle');
    expect(twohand.idle).toBe('WarriorT1_TwoHand_Idle');
    for (const [profile, family] of [
      [shield, 'Shield'],
      [twohand, 'TwoHand'],
    ] as const) {
      for (const name of weaponMotionClipNames({ onehand: profile })) {
        expect(name.startsWith(`WarriorT1_${family}_`)).toBe(true);
      }
    }
    expect(shield.attackByAbility?.shield_slam).toBe('WarriorT1_Shield_Block');
    expect(twohand.attackByAbility?.heroic_strike).toBe('WarriorT1_TwoHand_AttackB');
    expect(WARRIOR_T1_MOTION_CLIPS.travel?.jump).toBe('WarriorT1_Unarmed_Jump');
  });
});
