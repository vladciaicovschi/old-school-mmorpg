import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { VISUALS } from '../src/render/characters/manifest';
import { WARRIOR_SUITS, warriorSuitVisualKey } from '../src/render/characters/warrior_suits';

describe('whole-body warrior asset contracts', () => {
  for (const suit of WARRIOR_SUITS) {
    it(`${suit}: one textured skin, full sword/shield pack, runtime states and separate hands`, () => {
      const def = VISUALS[warriorSuitVisualKey(suit)];
      const bytes = fs.readFileSync(`public/${def.url}`);
      const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      expect(glb.meshes).toHaveLength(1);
      expect(glb.skins).toHaveLength(1);
      expect(glb.animations).toHaveLength(51);
      expect(def.equipmentParts).toBeUndefined();
      expect(def.authoredAtlas).toBe(true);
      expect(def.lazyPreload).toBe(true);
      expect(def.weaponSlots).toEqual([0]);
      expect(def.offhandSlot).toBe(1);
      const names = glb.animations.map((a: { name: string }) => a.name);
      const { travel, draw, stow, carrySwapFraction, ...sourceClips } = def.clips;
      for (const name of Object.values(sourceClips).flat()) expect(names).toContain(name);
      expect(travel?.idle).toBe('Warrior_TravelIdle');
      expect(draw).toBe('Warrior_TravelDraw');
      expect(stow).toBe('Warrior_TravelStow');
      expect(carrySwapFraction).toBe(0.5);
      for (const primitive of glb.meshes[0].primitives) {
        for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
          expect(primitive.attributes[attribute], attribute).toBeTypeOf('number');
        }
      }
      for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
      expect(glb.extensionsRequired).toContain('EXT_meshopt_compression');
      expect(MEDIA_ASSETS).toHaveProperty(def.url);
      expect(bytes.length).toBeLessThan(4 * 1024 * 1024);
    });
  }
});
