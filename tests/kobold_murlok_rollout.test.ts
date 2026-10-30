import { afterEach, describe, expect, it } from 'vitest';
import { createGlbIO, indexClip } from '../scripts/anim/pose_blend.mjs';
import { heldAttachmentFitFor } from '../src/render/characters/held_attachment_fit';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';
import { MOBS } from '../src/sim/data';
import type { Entity } from '../src/sim/types';
import { tEntity } from '../src/ui/entity_i18n';
import { ensureLocaleLoaded, setLanguage } from '../src/ui/i18n';

const keyFor = (id: string) => visualKeyFor({ kind: 'mob', templateId: id } as Entity);
const KOBOLDS = [
  'tunnel_rat',
  'grix_the_tunnelking',
  'deeprock_kobold',
  'ironvein_foreman',
  'ironvein_sapper',
];
const MURLOKS = [
  'mudfin_murloc',
  'deepfen_murloc',
  'mirejaw_the_ravenous',
  'mirejaw_frenzy',
  'sloomtooth_the_drowned',
  'glimmermere_wader',
  'moonspawn',
  'rift_tide_thrall',
  'rift_boss_tide',
  'mere_lurker',
  'the_meredark',
];

describe('kobold and murlok world rollout', () => {
  afterEach(() => setLanguage('en'));

  it.each(KOBOLDS)('replaces %s with the actual editable island kobold', (id) => {
    expect(MOBS[id]).toBeDefined();
    expect(keyFor(id)).toBe('npc_dev_kobold');
    expect(VISUALS[keyFor(id)].url).toBe('models/chars/npcs/dev_kobold.glb');
  });

  it.each(MURLOKS)('replaces %s with the actual editable island murlok', (id) => {
    expect(MOBS[id]).toBeDefined();
    expect(keyFor(id)).toBe('npc_dev_meshy_murlok');
    expect(VISUALS[keyFor(id)].url).toBe('models/chars/npcs/dev_meshy_murlok.glb');
  });

  it.each(['bogtoad', 'drowsy_croaker', 'bog_bloat'])('preserves the frog body for %s', (id) => {
    expect(VISUALS[keyFor(id)].url).toBe('models/creatures/frog.glb');
  });

  it.each([
    'fen_sprite',
    'harvest_sprite',
    'willow_sprite',
    'hedge_gnome',
    'downs_bandit',
    'wreck_thief',
    'breach_wretch',
    'rift_deep_lurker',
  ])('does not turn %s into a kobold', (id) => {
    expect(keyFor(id)).toBe('mob_kobold');
    expect(VISUALS[keyFor(id)].url).toBe('models/creatures/goblin.glb');
  });

  it.each([
    ['dev_kobold', 'npc_dev_kobold', 'models/weapons/rusted_kobold_pickaxe.glb'],
    ['dev_meshy_murlok', 'npc_dev_meshy_murlok', 'models/weapons/rusted_murloc_pitchfork.glb'],
  ])('shares saved attachment coordinates with %s', (id, key, weapon) => {
    const def = VISUALS[key];
    expect(keyFor(id)).toBe(key);
    expect(def.equipmentFitKey).toBe(key);
    expect(heldAttachmentFitFor(def.equipmentFitKey)?.mainhand).toBeDefined();
    expect(def.attach).toEqual([
      { url: weapon, bone: 'mixamorig:RightHand', calibrationSlot: 'mainhand' },
    ]);
  });

  it('marks only the promoted island models and resolves the requested Russian labels', async () => {
    const marked = Object.values(DEV_MODEL_LAB_MOBS)
      .filter((mob) => mob.name.endsWith('(Replaced)'))
      .map((mob) => mob.id);
    expect(marked).toEqual(['dev_kobold', 'dev_meshy_murlok']);
    await ensureLocaleLoaded('ru_RU');
    setLanguage('ru_RU');
    expect(tEntity({ kind: 'mob', id: 'dev_kobold', field: 'name' })).toBe('Кобольд (заменен)');
    expect(tEntity({ kind: 'mob', id: 'dev_meshy_murlok', field: 'name' })).toBe(
      'Морлок (заменен)',
    );
    setLanguage('en');
    expect(tEntity({ kind: 'mob', id: 'dev_kobold', field: 'name' })).toBe('Kobold (Replaced)');
  });

  it.each(['npc_dev_kobold', 'npc_dev_meshy_murlok'])(
    'binds every selected clip to the shipped %s skeleton',
    async (key) => {
      const def = VISUALS[key];
      expect(def.animUrls).toBeUndefined();
      const root = (await createGlbIO().read(`public/${def.url}`)).getRoot();
      const joints = new Set(root.listSkins().flatMap((skin) => skin.listJoints()));
      for (const name of [
        def.clips.idle,
        def.clips.combatIdle,
        def.clips.walk,
        def.clips.run,
        ...def.clips.attack,
        ...(def.clips.hit ?? []),
        def.clips.death,
      ]) {
        if (!name) continue;
        const clip = indexClip(root, name);
        expect(clip.size, name).toBeGreaterThan(0);
        for (const channel of clip.values()) {
          expect(joints.has(channel.node), `${name}: ${channel.node.getName()}`).toBe(true);
          expect([...channel.values].every(Number.isFinite), name).toBe(true);
        }
      }
    },
  );
});
