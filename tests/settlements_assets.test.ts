import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import data from '../src/sim/settlements_data.json';

function document(url: string) {
  const filename = path.join(process.cwd(), 'public', url);
  expect(existsSync(filename), url).toBe(true);
  const bytes = readFileSync(filename);
  expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
}

describe('approved settlement assets', () => {
  it('ships every referenced native assembly with GPU-compressed embedded images', () => {
    const checked = new Set<string>();
    for (const model of Object.values(data.models)) {
      if (checked.has(model.url)) continue;
      checked.add(model.url);
      const doc = document(model.url);
      const bindings = doc.scenes[doc.scene ?? 0].extras?.settlementTextureBindings ?? [];
      for (const binding of bindings)
        for (const url of Object.values(binding.slots)) {
          const bytes = readFileSync(path.join(process.cwd(), 'public', url as string));
          expect([...bytes.subarray(0, 12)]).toEqual([
            171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10,
          ]);
        }
      for (const image of doc.images ?? []) {
        if (image.bufferView !== undefined) expect(image.mimeType, model.url).toBe('image/ktx2');
      }
      if (
        (doc.images ?? []).some((image: { bufferView?: number }) => image.bufferView !== undefined)
      ) {
        expect(doc.extensionsUsed, model.url).toContain('KHR_texture_basisu');
      }
    }
    expect(checked.size).toBeGreaterThan(50);
  });

  it('imports all approved lots and only the additional Wickharbor churchyard', () => {
    expect(data.settlements.map((s) => [s.id, s.lots.length])).toEqual([
      ['eastbrook', 18],
      ['icemantle', 7],
      ['gullhaven', 6],
      ['gibbetmere', 4],
      ['wickharbor', 0],
    ]);
    const wick = data.settlements.find((s) => s.id === 'wickharbor')!;
    expect(wick.decorationOnly).toBe(true);
    expect(wick.dressing).toHaveLength(6);
    for (const settlement of data.settlements) {
      expect(settlement.dressing.some((p) => ['mailbox', 'noticeboard'].includes(p.id))).toBe(
        false,
      );
      for (const lot of settlement.lots) {
        expect(data.models[lot.modelId as keyof typeof data.models].metadata).toHaveProperty(
          'footprint',
        );
      }
    }
  });

  it('retains the darker hammer paladin and individual churchyard marker shapes', () => {
    const east = data.settlements.find((s) => s.id === 'eastbrook')!;
    const statue = east.landmarks.find((p) => p.id === 'monument')!;
    const doc = document(data.models[statue.modelId as keyof typeof data.models].url);
    expect(doc.scenes[doc.scene ?? 0].extras.sourceComponent).toBe(5);
    expect(doc.scenes[doc.scene ?? 0].extras.content).toContain('warhammer');
    expect(doc.materials[0].pbrMetallicRoughness.baseColorFactor).toEqual([0.8, 0.8, 0.8, 1]);
    const graves = east.dressing.filter((p) => p.id.startsWith('chapel-grave-'));
    expect(graves).toHaveLength(9);
    expect(new Set(graves.map((p) => p.z)).size).toBe(9);
    expect(new Set(graves.map((p) => p.modelId)).size).toBeGreaterThan(1);
    expect(new Set(graves.map((p) => p.modelId)).size).toBeLessThan(graves.length);
  });
});
