import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { VISUALS } from '../src/render/characters/manifest';

describe('T1 Meshy warlock import', () => {
  it('uses original PBR maps with magic and staff-strike clips', () => {
    const url = 'models/chars/players/warlock_t1.glb';
    const bytes = fs.readFileSync(`public/${url}`);
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const clips = glb.animations.map((animation: { name: string }) => animation.name);

    expect(VISUALS.player_warlock).toMatchObject({
      url,
      preserveSkinnedParts: true,
      attachmentRig: 'mixamo_standard',
      clips: {
        idle: 'WarlockT1_TravelIdle',
        walk: 'WarlockT1_TravelWalk',
        run: 'WarlockT1_TravelRun',
        death: 'WarlockT1_Death',
        attack: [
          'WarlockT1_StaffStrikeHorizontal',
          'WarlockT1_StaffStrikeDownward',
          'WarlockT1_StaffStrikeBackhand',
        ],
      },
    });
    expect(clips).toHaveLength(13);
    expect(clips).toEqual(
      expect.arrayContaining([
        'WarlockT1_CastShadow',
        'WarlockT1_CastFire',
        'WarlockT1_CastDrain',
        'WarlockT1_CastArea',
        'WarlockT1_StaffStrikeHorizontal',
        'WarlockT1_StaffStrikeDownward',
        'WarlockT1_StaffStrikeBackhand',
      ]),
    );
    expect(glb.meshes).toHaveLength(1);
    expect(glb.skins).toHaveLength(1);
    expect(glb.materials).toHaveLength(1);
    expect(glb.images).toHaveLength(3);
    for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
    expect(glb.extensionsRequired).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
    );
    expect(MEDIA_ASSETS).toHaveProperty(url);
    expect(bytes.length).toBeLessThan(3 * 1024 * 1024);
  });
});
