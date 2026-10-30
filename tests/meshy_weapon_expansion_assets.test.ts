import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';

const spec = JSON.parse(
  readFileSync('scripts/assets/specs/meshy_weapon_sets_oct13.json', 'utf8'),
) as { items: { src: string; out: string; type: string; maxTex: number }[] };

describe('supplied Meshy weapon expansion shipping assets', () => {
  it('includes each of the three five-tier packs and the single test crossbow exactly once', () => {
    const expected = ['claymore_sword', 'lion_warhammer_1h', 'dwarven_warhammer_2h'].flatMap(
      (family) => Array.from({ length: 5 }, (_, index) => `${family}_${index + 1}`),
    );
    expected.push('test_crossbow_1');
    expect(spec.items.map((item) => item.out)).toEqual(
      expected.map((key) => `models/weapons/meshy/${key}.glb`),
    );
  });

  for (const item of spec.items) {
    it(`${item.out}: ships static Meshopt geometry, complete KTX2 PBR and a preview`, () => {
      expect(item.type).toBe('static');
      expect(item.maxTex).toBe(512);
      const bytes = readFileSync(`public/${item.out}`);
      expect(bytes.length).toBeLessThan(1024 * 1024);
      expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
      expect(bytes.readUInt32LE(8)).toBe(bytes.length);
      const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      expect(glb.meshes).toHaveLength(1);
      expect(glb.skins ?? []).toHaveLength(0);
      expect(glb.animations ?? []).toHaveLength(0);
      expect(glb.materials).toHaveLength(1);
      const material = glb.materials[0];
      expect(material.pbrMetallicRoughness.baseColorTexture).toBeDefined();
      expect(material.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();
      expect(material.normalTexture).toBeDefined();
      expect(glb.images).toHaveLength(3);
      for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
      expect(glb.extensionsRequired).toEqual(
        expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
      );
      expect(glb.extensionsUsed).not.toContain('KHR_draco_mesh_compression');
      expect(MEDIA_ASSETS).toHaveProperty(item.out);
      const basename = item.out.slice(item.out.lastIndexOf('/') + 1).replace('.glb', '.jpg');
      const preview = `public/ui/weapons/meshy/${basename}`;
      expect(statSync(preview).size).toBeGreaterThan(1000);
      expect(readFileSync(preview).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    });
  }
});
