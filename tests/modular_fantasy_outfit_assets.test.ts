import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';

interface GlbJson {
  nodes?: { name?: string; mesh?: number }[];
  extras?: {
    wocSourceArchivesSha256?: Record<string, string>;
  };
}

function readGlbJson(path: string): GlbJson {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(
    bytes
      .subarray(20, 20 + jsonLength)
      .toString('utf8')
      .replace(/\0+$/, ''),
  );
}

describe('Modular Character Outfits - Fantasy island slice', () => {
  it('ships every player and NPC body with Ranger or Peasant outfit geometry', () => {
    const bodies = Object.entries(VISUALS).filter(
      ([key]) => key.startsWith('player_quaternius_') || key.startsWith('npc_quaternius_'),
    );
    expect(bodies).toHaveLength(10);

    for (const [key, def] of bodies) {
      const json = readGlbJson(`public/${def.url}`);
      const meshNames = (json.nodes ?? [])
        .filter((node) => node.mesh !== undefined)
        .map((node) => node.name ?? '');
      expect(
        meshNames.some((name) => /_(Ranger|Peasant)_/.test(name)),
        `${key} must be built from Modular Character Outfits - Fantasy geometry`,
      ).toBe(true);
      expect(json.extras?.wocSourceArchivesSha256?.modularCharacterOutfitsFantasy).toBe(
        'c3468b18871cc8c8f05ab14df7712baf22cb9f389cbd870babf130e595187f70',
      );
    }
  });
});
