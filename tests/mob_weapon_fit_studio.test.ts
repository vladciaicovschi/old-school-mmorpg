import { describe, expect, it } from 'vitest';
import {
  HELD_EQUIPMENT_FIT_VISUALS,
  MOB_EQUIPMENT_FIT_SUBJECTS,
} from '../scripts/lib/equipment_fit_payload.mjs';
import { VISUALS } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

describe('imported mob weapon-fitting coverage', () => {
  it('offers every active island model, not retired imports or KayKit replacements', () => {
    const keys = MOB_EQUIPMENT_FIT_SUBJECTS.map((entry) => entry.visualKey);
    expect(keys).toHaveLength(18);
    expect(new Set(keys).size).toBe(18);
    expect(keys.slice().sort()).toEqual(
      Object.keys(DEV_MODEL_LAB_MOBS)
        .map((id) => `npc_${id}`)
        .sort(),
    );
    for (const key of ['mob_ogre', 'skel_rogue', 'npc_dev_meshy_treant', 'npc_dev_skeleton_rogue'])
      expect(keys).not.toContain(key);
    expect(HELD_EQUIPMENT_FIT_VISUALS).toContain('mob_ogre');
  });
  it('allows saving each subject and tags every external weapon for editing', () => {
    let armed = 0;
    for (const { visualKey } of MOB_EQUIPMENT_FIT_SUBJECTS) {
      expect(HELD_EQUIPMENT_FIT_VISUALS).toContain(visualKey);
      const def = VISUALS[visualKey];
      expect(def).toBeDefined();
      if (!def.attach?.length) continue;
      armed++;
      for (const attachment of def.attach)
        expect(['mainhand', 'offhand']).toContain(attachment.calibrationSlot);
    }
    expect(armed).toBe(8);
  });
  it.each([
    ['npc_dev_meshy_ogre', 'models/weapons/rusted_ogre_club.glb'],
    ['npc_dev_meshy_murlok', 'models/weapons/rusted_murloc_pitchfork.glb'],
    ['npc_dev_kobold', 'models/weapons/rusted_kobold_pickaxe.glb'],
  ])('preserves %s native attachment coordinates and fixed weapon', (key, url) => {
    expect(VISUALS[key].attach).toEqual([
      { url, bone: 'mixamorig:RightHand', calibrationSlot: 'mainhand' },
    ]);
    expect(VISUALS[key].attachmentRig).toBeUndefined();
    expect(VISUALS[key].weaponSlots).toBeUndefined();
  });
});
