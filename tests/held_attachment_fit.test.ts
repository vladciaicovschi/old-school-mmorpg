// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const body = 'npc_dev_meshy_ogre';
const storage = `woc.equipmentCalibration.${body}.v2`;
const transform = (scale: number) => ({
  position: [0.1, 0.2, 0.3],
  rotationDeg: [10, 20, 30],
  scale,
});
async function coldImport(authored: Record<string, unknown> = {}) {
  vi.resetModules();
  vi.doMock('../src/render/characters/held_attachment_fit.generated.json', () => ({
    default: authored,
  }));
  return import('../src/render/characters/held_attachment_fit');
}
afterEach(() => {
  localStorage.removeItem(storage);
  vi.doUnmock('../src/render/characters/held_attachment_fit.generated.json');
  vi.resetModules();
});

describe('body weapon-fit persistence', () => {
  it('hydrates a new mob draft even when its body has no authored JSON entry', async () => {
    localStorage.setItem(
      storage,
      JSON.stringify({ version: 2, transforms: { mainhand: transform(0.8) } }),
    );
    const fits = await coldImport();
    expect(fits.heldAttachmentFitFor(body)?.mainhand).toEqual(transform(0.8));
    expect(fits.heldAttachmentFitFor('mob_ogre')).toBeUndefined();
    expect(fits.heldAttachmentFitFor('npc_dev_kobold')).toBeUndefined();
  });
  it('updates existing manifest references as well as fresh attachment lookups', async () => {
    const fits = await coldImport({ npc_dev_rogue_minion: { mainhand: transform(0.4) } });
    const held = fits.HELD_ATTACHMENT_FITS.npc_dev_rogue_minion;
    fits.setRuntimeHeldAttachmentFit('npc_dev_rogue_minion', { mainhand: transform(0.7) });
    expect(held.mainhand).toEqual(transform(0.7));
    fits.setRuntimeHeldAttachmentFit(body, { mainhand: transform(0.9) });
    expect(fits.heldAttachmentFitFor(body)?.mainhand).toEqual(transform(0.9));
  });
  it('restores a project-authored mob fit without local storage', async () => {
    const fits = await coldImport({ [body]: { mainhand: transform(0.75) } });
    expect(fits.heldAttachmentFitFor(body)?.mainhand).toEqual(transform(0.75));
  });
  it('keeps authored values for malformed, wrong-version or out-of-range drafts', async () => {
    for (const raw of [
      'broken',
      JSON.stringify({ version: 1, transforms: { mainhand: transform(0.9) } }),
      JSON.stringify({ version: 2, transforms: { mainhand: transform(99) } }),
    ]) {
      localStorage.setItem(storage, raw);
      const fits = await coldImport({ [body]: { mainhand: transform(0.4) } });
      expect(fits.heldAttachmentFitFor(body)?.mainhand).toEqual(transform(0.4));
    }
  });
  it('rejects unknown body keys and invalid runtime transforms without corrupting the baseline', async () => {
    const fits = await coldImport({ [body]: { mainhand: transform(0.4) } });
    for (const key of ['__proto__', 'constructor', '../anything', 'npc_dev_missing']) {
      fits.setRuntimeHeldAttachmentFit(key, { mainhand: transform(0.9) });
      expect(fits.heldAttachmentFitFor(key)).toBeUndefined();
    }
    for (const invalid of [
      { ...transform(1), position: [Infinity, 0, 0] },
      { ...transform(1), rotationDeg: [0, 0, 361] },
      transform(0),
    ])
      fits.setRuntimeHeldAttachmentFit(body, { mainhand: invalid });
    expect(fits.heldAttachmentFitFor(body)?.mainhand).toEqual(transform(0.4));
  });
});
