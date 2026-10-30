import { describe, expect, it, vi } from 'vitest';
import {
  carriedAttachmentFitFor,
  setRuntimeCarriedAttachmentFit,
} from '../src/render/characters/carried_attachment_fit';

describe('runtime carried attachment profiles', () => {
  it('hydrates native mob carry drafts even without an authored body entry', async () => {
    vi.resetModules();
    vi.doMock('../src/render/characters/held_attachment_fit.generated.json', () => ({
      default: {},
    }));
    const transform = { position: [0.1, 0.2, 0.3], rotationDeg: [10, 20, 30], scale: 0.8 };
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        key === 'woc.equipmentCalibration.npc_dev_meshy_ogre.v2'
          ? JSON.stringify({
              version: 2,
              transforms: { mainhand_hip: transform, mainhand_back: transform },
            })
          : null,
    });
    try {
      const fresh = await import('../src/render/characters/carried_attachment_fit');
      expect(fresh.carriedAttachmentFitFor('npc_dev_meshy_ogre').mainhand_hip).toEqual(transform);
      expect(fresh.carriedAttachmentFitFor('npc_dev_meshy_ogre').mainhand_back).toEqual(transform);
      expect(fresh.carriedAttachmentFitFor('mob_ogre')).toEqual({});
      expect(fresh.carriedAttachmentFitFor('npc_dev_kobold')).toEqual({});
    } finally {
      vi.doUnmock('../src/render/characters/held_attachment_fit.generated.json');
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
  it('hydrates Titan drafts using the editor compatibility storage key', async () => {
    vi.resetModules();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        key === 'woc.equipmentCalibration.meshyTitan.v2'
          ? JSON.stringify({
              version: 2,
              transforms: {
                mainhand_hip: { position: [0.3, -0.2, 0], rotationDeg: [0, 0, 180], scale: 0.6 },
              },
            })
          : null,
    });
    try {
      const fresh = await import('../src/render/characters/carried_attachment_fit');
      expect(fresh.carriedAttachmentFitFor('player_meshy_titan').mainhand_hip?.scale).toBe(0.6);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('snapshots authored carry before the legacy hand adapter hydrates an old draft', async () => {
    vi.resetModules();
    const hand = { position: [0, 0, 0], rotationDeg: [0, 0, 0], scale: 0.5 };
    vi.doMock('../src/render/characters/held_attachment_fit.generated.json', () => ({
      default: { player_warrior: { mainhand: hand, mainhand_back: { ...hand, scale: 0.7 } } },
    }));
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        key.endsWith('player_warrior.v2')
          ? JSON.stringify({ version: 2, transforms: { mainhand: hand } })
          : null,
    });
    try {
      const fresh = await import('../src/render/characters/carried_attachment_fit');
      await import('../src/render/characters/held_attachment_fit.generated');
      expect(fresh.carriedAttachmentFitFor('player_warrior').mainhand_back?.scale).toBe(0.7);
    } finally {
      vi.doUnmock('../src/render/characters/held_attachment_fit.generated.json');
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
  it('keeps manifest references stable and updates profiles independently', () => {
    const fit = carriedAttachmentFitFor('test-carry-registry');
    const draft = {
      position: [0.1, 0.2, 0.3] as [number, number, number],
      rotationDeg: [0, 180, 0] as [number, number, number],
      scale: 0.5,
    };
    setRuntimeCarriedAttachmentFit('test-carry-registry', { mainhand_hip: draft });
    draft.position[0] = 99;
    setRuntimeCarriedAttachmentFit('test-carry-registry', {
      offhand_back: { ...draft, position: [0, 0, -0.4] },
    });
    expect(carriedAttachmentFitFor('test-carry-registry')).toBe(fit);
    expect(fit.mainhand_hip!.position).toEqual([0.1, 0.2, 0.3]);
    expect(fit.offhand_back!.position).toEqual([0, 0, -0.4]);
    expect(fit.mainhand_back).toBeUndefined();
  });
  it('rejects malformed drafts and ignores hand-only data without erasing carry', () => {
    const fit = carriedAttachmentFitFor('test-carry-invalid');
    setRuntimeCarriedAttachmentFit('test-carry-invalid', {
      mainhand_back: { position: [0, 0, -0.4], rotationDeg: [0, 0, 0], scale: 0.6 },
    });
    for (const scale of [0, 11, Infinity, '1'])
      setRuntimeCarriedAttachmentFit('test-carry-invalid', {
        mainhand_back: { position: [0, 0, 0], rotationDeg: [0, 0, 0], scale },
      });
    setRuntimeCarriedAttachmentFit('test-carry-invalid', {
      mainhand: { position: [0, 0, 0], rotationDeg: [0, 0, 0], scale: 1 },
    });
    expect(fit.mainhand_back!.scale).toBe(0.6);
    expect(fit.mainhand_back!.position).toEqual([0, 0, -0.4]);
  });
});
