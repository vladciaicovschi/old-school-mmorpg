import { describe, expect, it } from 'vitest';
import { HUNTER_T1_MOTION_CLIPS } from '../src/render/characters/hunter_t1_motion';
import { itemWeaponModelUrl, weaponSkinModelUrl } from '../src/render/characters/manifest';
import {
  crossbowModelFallback,
  HUNTER_BOW_ITEM,
  HUNTER_CROSSBOW_ITEM,
  rangedWeaponHandling,
} from '../src/render/characters/ranged_weapon_core';
import { weaponMotionBaseClip, weaponMotionFor } from '../src/render/characters/weapon_motion_core';

describe('hunter ranged equipment and cosmetic selection', () => {
  it('keeps legacy melee-equipped hunters on the imported crossbow, and real bows on bow motion', () => {
    expect(rangedWeaponHandling('rusty_hatchet', null)).toBe('crossbow');
    expect(rangedWeaponHandling(HUNTER_BOW_ITEM, null)).toBe('bow');
    expect(rangedWeaponHandling(HUNTER_CROSSBOW_ITEM, 'winterbite')).toBe('bow');
    expect(rangedWeaponHandling(HUNTER_BOW_ITEM, 'encore_bow')).toBe('crossbow');
    expect(itemWeaponModelUrl(HUNTER_CROSSBOW_ITEM)).toBe(
      'models/weapons/meshy/test_crossbow_1.glb',
    );
    expect(itemWeaponModelUrl(HUNTER_BOW_ITEM)).toBe('models/weapons/meshy/arcane_longbow_1.glb');
  });
  it('uses the one imported fallback only for generic crossbows, preserving authored high-tier models', () => {
    for (const model of ['crossbow_1handed', 'crossbow_2handed', 'simple_farmhand_crossbow'])
      expect(crossbowModelFallback(model)).toBe('meshy/test_crossbow_1');
    expect(weaponSkinModelUrl('cinderlatch_crossbow')).toBe('models/weapons/cinderlatch.glb');
    expect(weaponSkinModelUrl('meteorlatch_crossbow')).toBe(
      'models/weapons/meteorlatch_the_sky_s_last_judgment.glb',
    );
  });
  it('holds aim only for cast-time shots, never taming or pet revival', () => {
    for (const item of [HUNTER_BOW_ITEM, HUNTER_CROSSBOW_ITEM]) {
      const motion = weaponMotionFor(HUNTER_T1_MOTION_CLIPS.weaponMotions, item, null);
      expect(weaponMotionBaseClip(motion, 'cast', 'aimed_shot')).toBe(motion?.cast);
      for (const ability of ['tame_beast', 'revive_pet', 'aspect_of_the_hawk'])
        expect(weaponMotionBaseClip(motion, 'cast', ability)).toBeUndefined();
      expect(weaponMotionBaseClip(motion, 'walkBack')).toBe(motion?.walkBack);
    }
  });
});
