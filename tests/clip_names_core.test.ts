import { describe, expect, it } from 'vitest';
import { clipNamesOf } from '../src/render/characters/clip_names_core';
import { VISUALS } from '../src/render/characters/manifest';
import { weaponMotionClipNames } from '../src/render/characters/weapon_motion_core';

describe('character action registration', () => {
  it('collects every weapon profile and the stowed jump, not just the default loadout', () => {
    const def = VISUALS.player_warrior;
    const names = clipNamesOf(def);
    for (const name of weaponMotionClipNames(def.clips.weaponMotions))
      expect(names).toContain(name);
    expect(names).toContain(def.clips.travel!.jump);
    expect(names).toContain('WarriorT1_Shield_Block');
    expect(names).toContain('WarriorT1_TwoHand_Jump');
  });

  it('keeps all existing cast, emote and presentation actions on other bodies', () => {
    const def = VISUALS.player_warlock;
    const names = clipNamesOf(def);
    expect(names).toContain('WarlockT1_CastSelf_Release');
    expect(names).toContain('WarlockT1_CastShadow_Loop');
    expect(names).toContain('WarlockT1_StaffIdle');
    for (const pose of def.clips.presentationPoses ?? []) expect(names).toContain(pose);
  });
  it('loads native bonus throws and the complete slam for studio preview only', () => {
    expect(clipNamesOf(VISUALS.mob_wildheart_ravager)).toContain('Wildheart_AxeThrow');
    expect(VISUALS.mob_wildheart_ravager.clips.attack).not.toContain('Wildheart_AxeThrow');
    expect(clipNamesOf(VISUALS.mob_wildheart_hexcaller)).toContain('Wildheart_Slam');
    expect(clipNamesOf(VISUALS.mob_mogger)).toContain('Mogger_GroundPound');
  });
});
