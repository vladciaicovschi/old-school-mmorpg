// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const url = 'models/weapons/meshy/claymore_sword_1.glb';
const key = `player_warrior@${url}`;
const storage = `woc.equipmentCalibration.${key}.v2`;
const bowUrl = 'models/weapons/meshy/arcane_longbow_1.glb';
const crossbowUrl = 'models/weapons/meshy/test_crossbow_1.glb';
const hunterKey = (model: string) => `player_hunter@${model}`;
const hunterStorage = (model: string) => `woc.equipmentCalibration.${hunterKey(model)}.v2`;
const maulUrl = 'models/weapons/meshy/dwarven_warhammer_2h_1.glb';
const paladinKey = `player_paladin@${maulUrl}`;
const paladinStorage = `woc.equipmentCalibration.${paladinKey}.v2`;
const transform = (scale: number) => ({
  position: [0.1, 0.2, 0.3],
  rotationDeg: [10, 20, 30],
  scale,
});
afterEach(() => {
  localStorage.removeItem(storage);
  localStorage.removeItem(hunterStorage(bowUrl));
  localStorage.removeItem(hunterStorage(crossbowUrl));
  localStorage.removeItem(paladinStorage);
  vi.doUnmock('../src/render/characters/held_attachment_fit.generated.json');
  vi.resetModules();
});
async function coldImport(extra: Record<string, unknown> = {}) {
  vi.resetModules();
  vi.doMock('../src/render/characters/held_attachment_fit.generated.json', () => ({
    default: { [key]: { mainhand: transform(0.5), mainhand_back: transform(0.6) }, ...extra },
  }));
  return import('../src/render/characters/item_attachment_fit');
}
describe('cold-start item fit hydration', () => {
  it('restores Paladin hammer hand/back drafts without changing another body fit', async () => {
    localStorage.setItem(
      paladinStorage,
      JSON.stringify({
        version: 2,
        transforms: { mainhand: transform(0.7), mainhand_back: transform(0.8) },
      }),
    );
    const restored = await coldImport();
    expect(restored.itemAttachmentFitFor('player_paladin', maulUrl)?.mainhand).toEqual(
      transform(0.7),
    );
    expect(restored.itemAttachmentFitFor('player_paladin', maulUrl)?.mainhand_back).toEqual(
      transform(0.8),
    );
    expect(restored.itemAttachmentFitFor('player_mage', maulUrl)).toBeUndefined();
  });
  it('keeps Hunter bow and crossbow defaults, runtime edits and restored drafts independent', async () => {
    const defaults = await coldImport();
    expect(defaults.itemAttachmentFitFor('player_hunter', bowUrl)?.mainhand?.scale).toBe(1.35);
    expect(defaults.itemAttachmentFitFor('player_hunter', crossbowUrl)?.mainhand?.scale).toBe(0.5);
    defaults.setRuntimeItemAttachmentFit(hunterKey(bowUrl), { mainhand: transform(1.1) });
    expect(defaults.itemAttachmentFitFor('player_hunter', bowUrl)?.mainhand?.scale).toBe(1.1);
    expect(defaults.itemAttachmentFitFor('player_hunter', crossbowUrl)?.mainhand?.scale).toBe(0.5);
    localStorage.setItem(
      hunterStorage(bowUrl),
      JSON.stringify({ version: 2, transforms: { mainhand: transform(1.1) } }),
    );
    localStorage.setItem(
      hunterStorage(crossbowUrl),
      JSON.stringify({ version: 2, transforms: { mainhand: transform(0.65) } }),
    );
    const restored = await coldImport();
    expect(restored.itemAttachmentFitFor('player_hunter', bowUrl)?.mainhand).toEqual(
      transform(1.1),
    );
    expect(restored.itemAttachmentFitFor('player_hunter', crossbowUrl)?.mainhand).toEqual(
      transform(0.65),
    );
    expect(restored.itemAttachmentFitFor('player_warrior', crossbowUrl)).toBeUndefined();
    localStorage.removeItem(hunterStorage(bowUrl));
    localStorage.setItem(hunterStorage(crossbowUrl), 'malformed');
    const authored = await coldImport({ [hunterKey(bowUrl)]: { mainhand: transform(1.2) } });
    expect(authored.itemAttachmentFitFor('player_hunter', bowUrl)?.mainhand?.scale).toBe(1.2);
    expect(authored.itemAttachmentFitFor('player_hunter', crossbowUrl)?.mainhand?.scale).toBe(0.5);
  });
  it('loads the authored item baseline and then a saved local editor draft', async () => {
    const authored = await coldImport();
    expect(authored.itemAttachmentFitFor('player_warrior', url)?.mainhand?.scale).toBe(0.5);
    localStorage.setItem(
      storage,
      JSON.stringify({
        version: 2,
        transforms: {
          mainhand: transform(0.72),
          mainhand_back: transform(0.82),
        },
      }),
    );
    const restored = await coldImport();
    expect(restored.itemAttachmentFitFor('player_warrior', url)?.mainhand?.scale).toBe(0.72);
    expect(restored.itemAttachmentFitFor('player_warrior', url)?.mainhand_back?.scale).toBe(0.82);
    expect(restored.itemAttachmentFitFor('player_mage', url)).toBeUndefined();
  });
  it('keeps authored values when a local draft is malformed or unsupported', async () => {
    for (const raw of [
      'broken JSON',
      JSON.stringify({ version: 1, transforms: { mainhand: transform(0.9) } }),
      JSON.stringify({ version: 2, transforms: { mainhand: transform(99) } }),
    ]) {
      localStorage.setItem(storage, raw);
      const restored = await coldImport();
      expect(restored.itemAttachmentFitFor('player_warrior', url)?.mainhand?.scale).toBe(0.5);
    }
  });
});
