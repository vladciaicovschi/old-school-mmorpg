import { afterEach, describe, expect, it, vi } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';
import type { Entity } from '../src/sim/types';

const built = vi.hoisted(() => [] as { key: string; look: unknown }[]);
const weaponOverrides = vi.hoisted(() => [] as unknown[]);

vi.mock('../src/render/characters/assets', () => ({
  modularHeadFor: vi.fn(),
}));

vi.mock('../src/render/characters/visual', () => ({
  CharacterVisual: class {
    budgetedWeaponLight = false;

    constructor(key: string, _color: number, _skin: number, ...args: unknown[]) {
      built.push({ key, look: args[3] });
      weaponOverrides.push(args[1]);
    }
  },
  setWeaponVfxViewportHeight: vi.fn(),
}));

import {
  characterBaseVisualKeyFor,
  characterVisualPoolKeyFor,
  createCharacterVisual,
  modularLookFor,
  npcLookFor,
  setModularLookProvider,
  setNpcVisualOverrideProvider,
  setPlayerVisualOverrideProvider,
} from '../src/render/characters/index';

const player = {
  kind: 'player',
  id: 1,
  templateId: 'warrior',
  color: 0xffffff,
  skin: 0,
  skinCatalog: 'class',
  mainhandItemId: null,
  offhandItemId: null,
} as unknown as Entity;

const modularLook = { gender: 'male' } as never;
const npc = {
  ...player,
  kind: 'npc',
  templateId: 'warden_tam',
} as unknown as Entity;

afterEach(() => {
  built.length = 0;
  weaponOverrides.length = 0;
  setModularLookProvider(null);
  setNpcVisualOverrideProvider(null);
  setPlayerVisualOverrideProvider(null);
});

describe('player visual override', () => {
  it('uses the T1 fallback in the live factory and suppresses modular armor overlays', () => {
    setModularLookProvider(() => modularLook);
    const wearer = {
      ...player,
      equippedItems: { chest: 'warrior_militia_suit', helmet: 'cryptbone_helm' },
    };
    expect(characterBaseVisualKeyFor(wearer)).toBe('player_warrior');
    expect(modularLookFor(wearer)).toBeNull();
    createCharacterVisual(wearer);
    expect(built.at(-1)?.key).toBe('player_warrior');
    expect(built.at(-1)?.look).toBeNull();
    expect(characterBaseVisualKeyFor({ ...wearer, equippedItems: {} })).toBe('player_warrior');
    createCharacterVisual({ ...wearer, equippedItems: {} });
    expect(built.at(-1)?.key).toBe('player_warrior');
    expect(built.at(-1)?.look).toBeNull();
  });
  it('switches a registered chest tier through the live factory and back to T1', () => {
    VISUALS.player_warrior_t2 = { ...VISUALS.player_warrior };
    try {
      const wearer = { ...player, equippedItems: { chest: 'warrior_militia_suit' } };
      expect(characterBaseVisualKeyFor(wearer)).toBe('player_warrior_t2');
      createCharacterVisual(wearer);
      expect(built.at(-1)?.key).toBe('player_warrior_t2');
      expect(
        characterBaseVisualKeyFor({ ...wearer, equippedItems: { chest: 'recruit_tunic' } }),
      ).toBe('player_warrior');
      expect(characterBaseVisualKeyFor({ ...wearer, skinCatalog: 'mech' })).toBe('player_mech');
      createCharacterVisual(wearer, 'form_sheep');
      expect(built.at(-1)?.key).toBe('form_sheep');
    } finally {
      delete VISUALS.player_warrior_t2;
    }
  });
  it('switches warrior suit identity and suppresses modular preview/helmet controls', () => {
    let suit = 'player_warrior_recruit';
    setModularLookProvider(() => modularLook);
    setPlayerVisualOverrideProvider(() => suit);
    expect(characterBaseVisualKeyFor(player)).toBe(suit);
    expect(modularLookFor(player)).toBeNull();
    createCharacterVisual(player);
    expect(built.at(-1)?.key).toBe(suit);
    suit = 'player_warrior_knight';
    expect(characterBaseVisualKeyFor(player)).toBe(suit);
    expect(characterBaseVisualKeyFor({ ...player, skinCatalog: 'mech' })).toBe('player_mech');
    setPlayerVisualOverrideProvider(null);
    expect(modularLookFor(player)).toBe(modularLook);
  });
  it('wins over fixed and modular ordinary-player bodies', () => {
    setModularLookProvider(() => modularLook);
    setPlayerVisualOverrideProvider(() => 'player_quaternius_male_ranger');

    expect(createCharacterVisual(player)).not.toBeNull();
    expect(built).toEqual([{ key: 'player_quaternius_male_ranger', look: null }]);
    expect(weaponOverrides.at(-1)).toMatchObject({
      weaponSlots: [0],
      offhandSlot: 1,
      attach: [
        { url: 'models/weapons/sword_1handed.glb', bone: 'handslot.r' },
        { url: 'models/weapons/shield_round.glb', bone: 'handslot.l' },
      ],
    });
  });

  it('ignores NPCs and invalid manifest keys', () => {
    setPlayerVisualOverrideProvider(() => 'player_quaternius_male_ranger');
    createCharacterVisual({ ...player, kind: 'mob', templateId: 'training_dummy' });
    expect(built.at(-1)?.key).toBe('mob_training_dummy');

    setPlayerVisualOverrideProvider(() => 'missing_visual');
    createCharacterVisual(player);
    expect(built.at(-1)?.key).toBe('player_warrior');
  });

  it('keeps explicit forms and Combat Mech above the experiment', () => {
    setPlayerVisualOverrideProvider(() => 'player_quaternius_female_ranger');

    createCharacterVisual(player, 'form_sheep');
    expect(built.at(-1)?.key).toBe('form_sheep');

    createCharacterVisual({ ...player, skinCatalog: 'mech' });
    expect(built.at(-1)?.key).toBe('player_mech');
  });

  it('returns to the modular/default selection after the provider is cleared', () => {
    setPlayerVisualOverrideProvider(() => 'player_quaternius_male_ranger');
    setPlayerVisualOverrideProvider(null);
    setModularLookProvider(() => modularLook);

    createCharacterVisual(player);
    expect(built.at(-1)?.key).toBe('player_warrior_modular');
    expect(built.at(-1)?.look).toBe(modularLook);
  });
});

describe('NPC visual override', () => {
  it('builds the remaining named imports without modular overlays or borrowed props', () => {
    setModularLookProvider((entity) => npcLookFor(entity.templateId, entity.kind));
    for (const [templateId, key] of [
      ['foreman_odell', 'npc_foreman_odell'],
      ['brother_aldric', 'npc_aldric'],
      ['brother_aldric_fen', 'npc_aldric'],
      ['brother_aldric_highwatch', 'npc_aldric'],
      ['brother_aldric_raid', 'npc_aldric'],
    ]) {
      const entity = { ...npc, templateId };
      expect(characterBaseVisualKeyFor(entity)).toBe(key);
      expect(modularLookFor(entity)).toBeNull();
      expect(createCharacterVisual(entity)).not.toBeNull();
      expect(built.at(-1)).toEqual({ key, look: null });
      expect(weaponOverrides.at(-1)).toBeNull();
    }
  });
  it('gives scoped bodies distinct live-swap and reuse-pool identities', () => {
    setNpcVisualOverrideProvider((entity) =>
      entity.pos.x < -180 ? 'npc_quaternius_warden_tam' : null,
    );
    const islandNpc = { ...npc, pos: { x: -281, y: 0, z: -18 } };
    const mainlandNpc = { ...npc, pos: { x: 0, y: 0, z: 0 } };

    expect(characterBaseVisualKeyFor(islandNpc)).toBe('npc_quaternius_warden_tam');
    expect(characterBaseVisualKeyFor(mainlandNpc)).toBe('npc_villager');
    expect(characterVisualPoolKeyFor(islandNpc)).toBe(
      'npc:warden_tam:0:visual:npc_quaternius_warden_tam',
    );
    expect(characterVisualPoolKeyFor(mainlandNpc)).toBe('npc:warden_tam:0:visual:npc_villager');
  });

  it('wins over an authored modular NPC look', () => {
    setModularLookProvider(() => modularLook);
    setNpcVisualOverrideProvider(() => 'player_quaternius_male_ranger');

    expect(createCharacterVisual(npc)).not.toBeNull();
    expect(built).toEqual([{ key: 'player_quaternius_male_ranger', look: null }]);
    expect(weaponOverrides.at(-1)).toBeNull();
  });

  it('leaves mobs, unclaimed NPCs and invalid override keys on their normal visuals', () => {
    setNpcVisualOverrideProvider((entity) =>
      entity.templateId === 'warden_tam' ? 'player_quaternius_male_ranger' : null,
    );
    createCharacterVisual({ ...npc, kind: 'mob', templateId: 'training_effigy' });
    expect(built.at(-1)?.key).toBe('mob_training_dummy');

    setModularLookProvider(() => modularLook);
    createCharacterVisual({ ...npc, templateId: 'quartermaster_bree' });
    expect(built.at(-1)?.key).toBe('npc_modular_none');
    expect(built.at(-1)?.look).toBe(modularLook);

    setNpcVisualOverrideProvider(() => 'missing_visual');
    createCharacterVisual(npc);
    expect(built.at(-1)?.key).toBe('npc_modular_none');
    expect(built.at(-1)?.look).toBe(modularLook);
  });
});
