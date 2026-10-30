import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import {
  characterPreloadUrls,
  isAuthoredHeldModelUrl,
  VISUALS,
} from '../src/render/characters/manifest';

const WEAPONS = [
  'rusted_sword_1',
  'rusted_sword_2',
  'rusted_sword_3',
  'rusted_ogre_club',
  'rusted_kobold_pickaxe',
  'rusted_murloc_pitchfork',
] as const;

describe('rusted mob weapon set', () => {
  it('gives active sword skeletons rusty blades, preserves shields, and equips the troll with the jagged cleaver', () => {
    for (const [key, sword] of [
      ['npc_dev_skeleton_minion', 'rusted_sword_1'],
      ['npc_dev_skeleton_warrior', 'rusted_sword_2'],
    ]) {
      expect(VISUALS[key].attach?.map((att) => att.url)).toEqual([
        `models/weapons/${sword}.glb`,
        'models/weapons/meshy/battleworn_oak_shield.glb',
      ]);
      expect(VISUALS[key].attach?.map((att) => att.calibrationSlot)).toEqual([
        'mainhand',
        'offhand',
      ]);
    }
    expect(VISUALS.npc_dev_troll.attach).toEqual([
      { url: 'models/weapons/rusted_sword_3.glb', bone: 'handslot.r', calibrationSlot: 'mainhand' },
    ]);
    expect(VISUALS.npc_dev_troll.attachmentRig).toBe('mixamo_standard');
    for (const sword of ['rusted_sword_1', 'rusted_sword_2', 'rusted_sword_3']) {
      const url = `models/weapons/${sword}.glb`;
      expect(characterPreloadUrls(false)).toContain(url);
      expect(isAuthoredHeldModelUrl(url)).toBe(true);
    }
  });
  it('ships each separated PBR weapon as a compressed standalone GLB', () => {
    for (const weapon of WEAPONS) {
      const url = `models/weapons/${weapon}.glb`;
      const bytes = readFileSync(`public/${url}`);
      const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      expect(glb.meshes).toHaveLength(1);
      expect(glb.materials).toHaveLength(1);
      expect(glb.images).toHaveLength(3);
      for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
      expect(glb.extensionsRequired).toEqual(
        expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
      );
      expect(MEDIA_ASSETS).toHaveProperty(url);
    }
  });

  it('assigns the weapons to the intended mob families and developer imports', () => {
    const attachment = (key: keyof typeof VISUALS) => VISUALS[key].attach?.[0];
    expect(attachment('mob_ogre')?.url).toBe('models/weapons/rusted_ogre_club.glb');
    expect(attachment('mob_murloc')?.url).toBe('models/weapons/rusted_murloc_pitchfork.glb');
    expect(attachment('mob_kobold')?.url).toBe('models/weapons/rusted_kobold_pickaxe.glb');
    expect(attachment('mob_kobold_digger')?.url).toBe('models/weapons/rusted_kobold_pickaxe.glb');
    expect(attachment('skel_minion')?.url).toBe('models/weapons/rusted_sword_1.glb');
    expect(attachment('skel_warrior')?.url).toBe('models/weapons/rusted_sword_2.glb');
    expect(attachment('skel_rogue')?.url).toBe('models/weapons/rusted_sword_3.glb');
    expect(attachment('npc_dev_meshy_ogre')?.url).toBe('models/weapons/rusted_ogre_club.glb');
    expect(attachment('npc_dev_meshy_murlok')?.url).toBe(
      'models/weapons/rusted_murloc_pitchfork.glb',
    );
    expect(attachment('npc_dev_kobold')?.url).toBe('models/weapons/rusted_kobold_pickaxe.glb');
  });

  it("uses the Meshy ogre's planted idle rather than holding a walk frame", () => {
    const ogre = VISUALS.mob_ogre;
    expect(ogre.url).toBe('models/creatures/ogre_meshy_native.glb');
    expect(ogre.clips.idle).toBe('MeshyOgreNative_Idle');
    expect(ogre.clips.walk).toBe('MeshyOgreNative_WalkInPlace');
    const bytes = readFileSync(`public/${ogre.url}`);
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(glb.animations.map((animation: { name: string }) => animation.name)).toContain(
      'MeshyOgreNative_Idle',
    );
  });
});
