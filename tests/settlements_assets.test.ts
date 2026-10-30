import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
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
  it('retains varying UV coordinates for every shared-atlas primitive', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    let checked = 0;
    for (const model of Object.values(data.models)) {
      const json = document(model.url);
      const bindings = json.scenes[json.scene ?? 0].extras?.settlementTextureBindings;
      if (!bindings?.length) continue;
      const names = new Set(bindings.map((binding: { material: string }) => binding.material));
      const decoded = await io.read(path.join(process.cwd(), 'public', model.url));
      for (const mesh of decoded.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
          const material = primitive.getMaterial();
          if (!material || !names.has(material.getName())) continue;
          const label = `${model.url}: ${material.getName()}`;
          const uv = primitive.getAttribute('TEXCOORD_0');
          expect(uv, label).not.toBeNull();
          const values = uv!.getArray()!;
          let varying = false;
          for (let i = 2; i < values.length; i += 2) {
            if (values[i] !== values[0] || values[i + 1] !== values[1]) {
              varying = true;
              break;
            }
          }
          expect(varying, label).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(350);
  }, 60_000);

  it('preserves the approved mountain and forest timber factors', () => {
    let checked = 0;
    for (const [id, model] of Object.entries(data.models)) {
      if (!id.startsWith('icemantle:') && !id.startsWith('gibbetmere:')) continue;
      for (const material of document(model.url).materials ?? []) {
        if (!/^MI_WoodTrim(?:_Wear)?$/.test(material.name)) continue;
        if (id === 'icemantle:log') continue;
        const pbr = material.pbrMetallicRoughness;
        expect(pbr.baseColorFactor, id).toEqual([
          0.36625259558833256, 0.3231432091022285, 0.2541520943200296, 1,
        ]);
        expect(pbr.roughnessFactor, id).toBe(0.92);
        expect(pbr.metallicFactor ?? 1, id).toBe(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

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
