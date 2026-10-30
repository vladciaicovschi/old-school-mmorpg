import { describe, expect, it, vi } from 'vitest';
import {
  configureQuaterniusCharacterBodyOverrides,
  provingShorePlayerVisualKey,
  quaterniusProvingShoreNpcVisualKey,
  quaterniusProvingShorePlayerVisualKey,
} from '../src/game/quaternius_character_body';
import { warriorSuitSelection } from '../src/game/warrior_suit_selection';
import { WARRIOR_SUIT_VISUAL_KEYS } from '../src/render/characters/warrior_suits';
import { isOnProvingShore, PROVING_SHORE_NPCS } from '../src/sim/content/proving_shore';
import type { Entity } from '../src/sim/types';

type Override = ((entity: Entity) => string | null) | null;
const ISLAND_POS = { x: -281, y: 0, z: -18 } as const;
const MAINLAND_POS = { x: 0, y: 0, z: 0 } as const;

describe('Quaternius character-body boot orchestration', () => {
  it('keeps the T1 chest fallback available when unrelated island assets fail', async () => {
    const player = {
      id: 7,
      name: 'Warrior',
      kind: 'player',
      templateId: 'warrior',
      pos: MAINLAND_POS,
      equippedItems: { chest: 'warrior_knight_suit' },
    } as Entity;
    let provider: Exclude<Override, null> | undefined;
    const result = await configureQuaterniusCharacterBodyOverrides({
      requested: () => true,
      playerVisualKeys: () => [...WARRIOR_SUIT_VISUAL_KEYS],
      loadVisuals: async (keys) => {
        if (!keys.includes(WARRIOR_SUIT_VISUAL_KEYS[0])) throw Error('NPC unavailable');
      },
      loadWeapons: async () => {},
      installPlayerOverride: (next) => {
        provider = next ?? undefined;
      },
      installNpcOverride: () => {},
      reportError: () => {},
    });
    expect(result).toBe(true);
    expect(warriorSuitSelection.ready).toBe(true);
    const installed = provider as Override;
    expect(installed?.(player)).toBe('player_warrior');
    expect(
      installed?.({
        ...player,
        id: 8,
        equippedItems: { chest: 'warrior_militia_suit' },
      }),
    ).toBe('player_warrior');
    warriorSuitSelection.ready = false;
  });

  it('keeps suits unavailable when their own preload fails', async () => {
    const player = {
      id: 7,
      name: 'Warrior',
      kind: 'player',
      templateId: 'warrior',
      equippedItems: { chest: 'warrior_recruit_suit' },
    } as Entity;
    await configureQuaterniusCharacterBodyOverrides({
      requested: () => true,
      playerVisualKeys: () => [...WARRIOR_SUIT_VISUAL_KEYS],
      loadVisuals: async (keys) => {
        if (keys.includes(WARRIOR_SUIT_VISUAL_KEYS[0])) throw Error('Suit unavailable');
      },
      loadWeapons: async () => {},
      installPlayerOverride: () => {},
      installNpcOverride: () => {},
      reportError: () => {},
    });
    expect(warriorSuitSelection.ready).toBe(false);
    expect(warriorSuitSelection.visualKey(player)).toBeNull();
  });
  it('selects Titan by default for an island player while preserving comparison lanes', () => {
    const player = {
      kind: 'player',
      pos: ISLAND_POS,
      modularAppearance: { gender: 'female' },
    } as unknown as Entity;
    expect(provingShorePlayerVisualKey(player, 'meshy')).toBe('player_meshy_sentinel_v1');
    expect(provingShorePlayerVisualKey(player, 'quaternius')).toBe(
      'player_quaternius_female_ranger',
    );
    expect(provingShorePlayerVisualKey(player, 'kaykit')).toBeNull();
    expect(provingShorePlayerVisualKey({ ...player, pos: MAINLAND_POS }, 'meshy')).toBeNull();
  });
  it('keeps a normal island player on its T1 class body', async () => {
    const player = {
      id: 11,
      kind: 'player',
      templateId: 'mage',
      pos: ISLAND_POS,
      equippedItems: {},
    } as Entity;
    let provider: Exclude<Override, null> | undefined;
    await configureQuaterniusCharacterBodyOverrides({
      requested: () => true,
      playerVisualKeys: () => [...WARRIOR_SUIT_VISUAL_KEYS],
      loadVisuals: async () => {},
      loadWeapons: async () => {},
      installPlayerOverride: (next) => {
        provider = next ?? undefined;
      },
      installNpcOverride: () => {},
      reportError: () => {},
    });
    if (!provider) throw new Error('player override was not installed');
    expect(provider(player)).toBeNull();
    warriorSuitSelection.ready = false;
  });
  it('clears both providers without starting asset work under the KayKit rollback', async () => {
    const loadVisuals = vi.fn(() => Promise.resolve());
    const loadWeapons = vi.fn(() => Promise.resolve());
    const installPlayer = vi.fn<(provider: Override) => void>();
    const installNpc = vi.fn<(provider: Override) => void>();
    const reportError = vi.fn();

    await expect(
      configureQuaterniusCharacterBodyOverrides({
        requested: () => false,
        loadVisuals,
        loadWeapons,
        installPlayerOverride: installPlayer,
        installNpcOverride: installNpc,
        reportError,
      }),
    ).resolves.toBe(false);
    expect(loadVisuals).not.toHaveBeenCalled();
    expect(loadWeapons).not.toHaveBeenCalled();
    expect(installPlayer).toHaveBeenCalledOnce();
    expect(installPlayer).toHaveBeenLastCalledWith(null);
    expect(installNpc).toHaveBeenCalledOnce();
    expect(installNpc).toHaveBeenLastCalledWith(null);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('keeps both providers cleared when any required visual fails to load', async () => {
    const failure = new Error('animation donor unavailable');
    const loadVisuals = vi.fn(() => Promise.reject(failure));
    const loadWeapons = vi.fn(() => Promise.resolve());
    const installPlayer = vi.fn<(provider: Override) => void>();
    const installNpc = vi.fn<(provider: Override) => void>();
    const reportError = vi.fn();

    await expect(
      configureQuaterniusCharacterBodyOverrides({
        requested: () => true,
        loadVisuals,
        loadWeapons,
        installPlayerOverride: installPlayer,
        installNpcOverride: installNpc,
        reportError,
      }),
    ).resolves.toBe(false);
    expect(installPlayer).toHaveBeenCalledOnce();
    expect(installPlayer).toHaveBeenLastCalledWith(null);
    expect(installNpc).toHaveBeenCalledOnce();
    expect(installNpc).toHaveBeenLastCalledWith(null);
    expect(reportError).toHaveBeenCalledWith(failure);
  });

  it('keeps both providers cleared when the island weapon slice fails to load', async () => {
    const failure = new Error('weapon pack unavailable');
    const installPlayer = vi.fn<(provider: Override) => void>();
    const installNpc = vi.fn<(provider: Override) => void>();
    const reportError = vi.fn();

    await expect(
      configureQuaterniusCharacterBodyOverrides({
        requested: () => true,
        loadVisuals: () => Promise.resolve(),
        loadWeapons: () => Promise.reject(failure),
        installPlayerOverride: installPlayer,
        installNpcOverride: installNpc,
        reportError,
      }),
    ).resolves.toBe(false);
    expect(installPlayer).toHaveBeenCalledOnce();
    expect(installPlayer).toHaveBeenLastCalledWith(null);
    expect(installNpc).toHaveBeenCalledOnce();
    expect(installNpc).toHaveBeenLastCalledWith(null);
    expect(reportError).toHaveBeenCalledWith(failure);
  });

  it('keeps island players on production bodies and installs imported NPC bodies', async () => {
    const loadVisuals = vi.fn(() => Promise.resolve());
    const loadWeapons = vi.fn(() => Promise.resolve());
    let playerProvider: Exclude<Override, null> | undefined;
    let npcProvider: Exclude<Override, null> | undefined;
    const installPlayer = vi.fn((next: Override) => {
      playerProvider = next ?? undefined;
    });
    const installNpc = vi.fn((next: Override) => {
      npcProvider = next ?? undefined;
    });

    await expect(
      configureQuaterniusCharacterBodyOverrides({
        requested: () => true,
        loadVisuals,
        loadWeapons,
        installPlayerOverride: installPlayer,
        installNpcOverride: installNpc,
        reportError: vi.fn(),
      }),
    ).resolves.toBe(true);
    expect(loadVisuals).toHaveBeenCalledWith([
      'npc_quaternius_instructor_maren',
      'npc_quaternius_quartermaster_finch',
      'npc_quaternius_bursar_wick',
      'npc_quaternius_ferryman_odo',
      'npc_quaternius_warden_tam',
      'npc_quaternius_overseer_pell',
      'npc_quaternius_drillmaster_rook',
      'npc_quaternius_tidewarden_nel',
    ]);
    expect(loadWeapons).toHaveBeenCalledOnce();
    expect(playerProvider).toBeDefined();
    expect(npcProvider).toBeDefined();
    if (!playerProvider || !npcProvider) throw new Error('providers were not installed');
    expect(
      playerProvider({
        kind: 'player',
        pos: ISLAND_POS,
        modularAppearance: { gender: 'male' },
      } as unknown as Entity),
    ).toBeNull();
    expect(
      playerProvider({
        kind: 'player',
        templateId: 'warrior',
        pos: ISLAND_POS,
        equippedItems: { chest: 'warrior_knight_suit' },
      } as unknown as Entity),
    ).toBeNull();
    expect(npcProvider({ kind: 'npc', templateId: 'warden_tam', pos: ISLAND_POS } as Entity)).toBe(
      'npc_quaternius_warden_tam',
    );
    expect(
      npcProvider({ kind: 'npc', templateId: 'tidewarden_nel', pos: ISLAND_POS } as Entity),
    ).toBe('npc_quaternius_tidewarden_nel');
  });

  it('claims tutorial players and imported NPCs only while they are physically on the island', () => {
    expect(
      quaterniusProvingShorePlayerVisualKey({
        kind: 'player',
        pos: ISLAND_POS,
        modularAppearance: { gender: 'female' },
      } as unknown as Entity),
    ).toBe('player_quaternius_female_ranger');
    expect(
      quaterniusProvingShorePlayerVisualKey({
        kind: 'player',
        pos: MAINLAND_POS,
        modularAppearance: { gender: 'female' },
      } as unknown as Entity),
    ).toBeNull();

    const islandNpcIds = Object.values(PROVING_SHORE_NPCS)
      .filter((npc) => isOnProvingShore(npc.pos.x, npc.pos.z))
      .map((npc) => npc.id);
    expect(islandNpcIds).toHaveLength(8);
    for (const templateId of islandNpcIds) {
      expect(
        quaterniusProvingShoreNpcVisualKey({
          kind: 'npc',
          templateId,
          pos: ISLAND_POS,
        } as Entity),
        templateId,
      ).toBe(`npc_quaternius_${templateId}`);
    }
    expect(
      quaterniusProvingShoreNpcVisualKey({
        kind: 'npc',
        templateId: 'wayfarer_bryn',
        pos: ISLAND_POS,
      } as Entity),
    ).toBeNull();
    expect(
      quaterniusProvingShoreNpcVisualKey({
        kind: 'npc',
        templateId: 'quartermaster_bree',
        pos: ISLAND_POS,
      } as Entity),
    ).toBeNull();
    expect(
      quaterniusProvingShoreNpcVisualKey({
        kind: 'mob',
        templateId: 'training_effigy',
        pos: ISLAND_POS,
      } as Entity),
    ).toBeNull();
    expect(
      quaterniusProvingShoreNpcVisualKey({
        kind: 'npc',
        templateId: 'warden_tam',
        pos: MAINLAND_POS,
      } as Entity),
    ).toBeNull();
  });
});
