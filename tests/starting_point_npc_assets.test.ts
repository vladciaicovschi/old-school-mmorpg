import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { quaterniusProvingShoreNpcVisualKey } from '../src/game/quaternius_character_body';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { VISUALS } from '../src/render/characters/manifest';

const NPCS = [
  ['bursar_wick', 'BursarWick'],
  ['drillmaster_rook', 'DrillmasterRook'],
  ['ferryman_odo', 'FerrymanOdo'],
  ['instructor_maren', 'InstructorMaren'],
  ['overseer_pell', 'OverseerPell'],
  ['quartermaster_finch', 'QuartermasterFinch'],
  ['tidewarden_nel', 'TidewardenNel'],
  ['warden_tam', 'WardenTam'],
] as const;

describe('Starting Point Meshy NPC imports', () => {
  it.each(NPCS)('%s supplies the imported PBR body for its island NPC', (id, name) => {
    const url = `models/chars/npcs/starting_point_${id}.glb`;
    const bytes = fs.readFileSync(`public/${url}`);
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const visualKey = `npc_quaternius_${id}`;
    const idle = `StartingPoint_${name}_Idle`;

    expect(VISUALS[visualKey]).toMatchObject({
      url,
      preserveSkinnedParts: true,
      attachmentRig: 'mixamo_standard',
      clips: { idle, walk: idle, run: idle, death: idle },
    });
    expect(
      quaterniusProvingShoreNpcVisualKey({
        kind: 'npc',
        templateId: id,
        pos: { x: -300, z: 50 },
      } as never),
    ).toBe(`npc_quaternius_${id}`);
    expect(glb.meshes).toHaveLength(1);
    expect(glb.skins).toHaveLength(1);
    expect(glb.materials).toHaveLength(1);
    expect(glb.animations.map((animation: { name: string }) => animation.name)).toEqual([idle]);
    expect(glb.images).toHaveLength(3);
    for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
    expect(glb.extensionsRequired).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
    );
    expect(MEDIA_ASSETS).toHaveProperty(url);
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
  });
});
