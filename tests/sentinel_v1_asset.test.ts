import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import {
  characterPreloadUrls,
  MESHY_SENTINEL_VISUAL_KEY,
  VISUALS,
} from '../src/render/characters/manifest';

const url = 'models/chars/players/meshy_sentinel_v1.glb';
const bytes = fs.readFileSync(`public/${url}`);
const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());

describe('Sentinel V1 game import', () => {
  it('ships one complete suit on one skeleton without toggleable armor slots', () => {
    const expected = ['Sentinel_Body'];
    expect(glb.meshes).toHaveLength(1);
    expect(glb.skins).toHaveLength(1);
    expect(VISUALS[MESHY_SENTINEL_VISUAL_KEY].equipmentParts).toBeUndefined();
    const jointLists: string[] = [];
    for (const name of expected) {
      const node = glb.nodes.find((n: { name: string }) => n.name === name);
      expect(node, name).toBeDefined();
      expect(node.mesh, name).toBeTypeOf('number');
      expect(node.skin, name).toBeTypeOf('number');
      jointLists.push(JSON.stringify(glb.skins[node.skin].joints));
      for (const p of glb.meshes[node.mesh].primitives) {
        expect(p.attributes.JOINTS_0, name).toBeTypeOf('number');
        expect(p.attributes.WEIGHTS_0, name).toBeTypeOf('number');
        expect(p.attributes.TEXCOORD_0, name).toBeTypeOf('number');
      }
    }
    expect(new Set(jointLists).size).toBe(1);
  });

  it('registers the optimized asset, compressed textures and full runtime clip vocabulary', () => {
    const def = VISUALS[MESHY_SENTINEL_VISUAL_KEY];
    expect(def.url).toBe(url);
    expect(def.attachmentRig).toBe('mixamo_sentinel');
    expect(def.preserveSkinnedParts).toBe(true);
    expect(characterPreloadUrls(true)).toContain(url);
    expect(MEDIA_ASSETS).toHaveProperty(url);
    expect(glb.extensionsRequired).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
    );
    const clips = glb.animations.map((a: { name: string }) => a.name);
    for (const name of Object.values(def.clips).flat()) expect(clips).toContain(name);
  });
});
