import { describe, expect, it } from 'vitest';
import {
  chestAppearanceTier,
  playerArmorVisualKey,
} from '../src/render/characters/armor_tier_core';
import { characterPreloadUrls, VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { ITEMS } from '../src/sim/data';
import type { ArmorItemDef, Entity, ItemDef } from '../src/sim/types';

const player = {
  kind: 'player',
  templateId: 'warrior',
  skinCatalog: 'class',
  equippedItems: {},
} as Entity;

describe('chest-selected armor tier', () => {
  it('supports an ordinary non-warrior chest with numeric tier and independently rejects wrong slot and kind', () => {
    const items: Record<string, ItemDef> = {
      ordinary: { ...(ITEMS.recruit_tunic as ArmorItemDef), appearanceTier: 4 },
      helmet: { ...(ITEMS.monarch_crown_helm as ArmorItemDef), appearanceTier: 4 },
      weapon: { ...ITEMS.worn_sword, slot: 'chest', appearanceTier: 4 } as unknown as ItemDef,
    };
    const visuals = { player_mage: {}, player_mage_t4: {}, player_warrior: {} };
    expect(playerArmorVisualKey('mage', { chest: 'ordinary' }, items, visuals)).toBe(
      'player_mage_t4',
    );
    expect(chestAppearanceTier({ chest: 'helmet' }, items)).toBe(1);
    expect(chestAppearanceTier({ chest: 'weapon' }, items)).toBe(1);
    expect(playerArmorVisualKey('mage', { helmet: 'ordinary' }, items, visuals)).toBe(
      'player_mage',
    );
  });
  it('resolves the explicitly authored chest tier, not rarity or other worn pieces', () => {
    expect(chestAppearanceTier({ chest: 'warrior_recruit_suit' }, ITEMS)).toBe(1);
    expect(chestAppearanceTier({ chest: 'warrior_militia_suit' }, ITEMS)).toBe(2);
    expect(chestAppearanceTier({ chest: 'warrior_knight_suit' }, ITEMS)).toBe(3);
    expect(chestAppearanceTier({ helmet: 'warrior_knight_suit' }, ITEMS)).toBe(1);
    expect(chestAppearanceTier({ chest: 'monarch_crown_helm' }, ITEMS)).toBe(1);
    expect(chestAppearanceTier({ chest: 'missing' }, ITEMS)).toBe(1);
    expect(chestAppearanceTier({}, ITEMS)).toBe(1);
    expect(chestAppearanceTier({ chest: 'recruit_tunic' }, ITEMS)).toBe(1);
  });

  it('uses base T1 for empty, ordinary, invalid or unavailable tiers', () => {
    for (const tier of [undefined, 0, -1, 1.5, Number.NaN, 99]) {
      const items = { test: { ...ITEMS.recruit_tunic, appearanceTier: tier } } as Record<
        string,
        ItemDef
      >;
      expect(playerArmorVisualKey('warrior', { chest: 'test' }, items, VISUALS)).toBe(
        'player_warrior',
      );
    }
    expect(
      playerArmorVisualKey('warrior', { chest: 'warrior_knight_suit' }, ITEMS, {
        player_warrior: {},
      }),
    ).toBe('player_warrior');
    expect(playerArmorVisualKey('mage', { chest: 'warrior_knight_suit' }, ITEMS, VISUALS)).toBe(
      'player_mage',
    );
  });

  it('routes live local and mirrored peer equipment through the same manifest rule', () => {
    expect(visualKeyFor(player)).toBe('player_warrior');
    for (const [chest, key] of [
      ['warrior_recruit_suit', 'player_warrior'],
      ['warrior_militia_suit', 'player_warrior'],
      ['warrior_knight_suit', 'player_warrior'],
    ]) {
      const equippedItems = { chest, helmet: 'cryptbone_helm', feet: 'oiled_boots' };
      const local = { ...player, equippedItems };
      const peer = { ...player, id: 42, equippedItems: structuredClone(equippedItems) };
      expect(visualKeyFor(local)).toBe(key);
      expect(visualKeyFor(peer)).toBe(key);
      expect(visualKeyFor({ ...local, equippedItems: { chest, gloves: 'mistveil_grips' } })).toBe(
        key,
      );
      expect(visualKeyFor({ ...local, skinCatalog: 'mech' })).toBe('player_mech');
    }
  });

  it('selects a registered class tier body without borrowing another class or a legacy rig', () => {
    const available = { player_warrior: {}, player_warrior_t2: {} };
    expect(
      playerArmorVisualKey('warrior', { chest: 'warrior_militia_suit' }, ITEMS, available),
    ).toBe('player_warrior_t2');
    expect(
      playerArmorVisualKey('warrior', { chest: 'warrior_knight_suit' }, ITEMS, available),
    ).toBe('player_warrior');
    expect(
      playerArmorVisualKey('mage', { chest: 'warrior_militia_suit' }, ITEMS, {
        ...available,
        player_mage: {},
      }),
    ).toBe('player_mage');
    for (const key of ['player_warrior_militia', 'player_warrior_knight']) {
      expect(VISUALS[key].lazyPreload).toBe(true);
      expect(characterPreloadUrls(false)).not.toContain(VISUALS[key].url);
      expect(characterPreloadUrls(true)).not.toContain(VISUALS[key].url);
    }
    expect(VISUALS.player_warrior.url).toBe('models/chars/players/t1_warrior.glb');
  });
});
