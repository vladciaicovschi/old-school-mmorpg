// Pins the authored NPC look roster (src/render/characters/npc_looks.ts):
// coverage (EVERY NpcDef id resolves to a composed look), validity (every
// authored value survives normalizeAppearance byte-identical, so a typo'd
// style id cannot silently clamp to the default face), distinctness (no two
// NPCs share an appearance), and the manifest contract (every prop set has
// its derived npc_modular_<id> VisualDef, every def resolvable).

import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { ARMOR_SETS, ARMOR_SLOTS, normalizeAppearance } from '../src/render/characters/modular';
import {
  aldricKeepsHisRig,
  meshyNpcKeepsItsRig,
  NPC_LOOKS,
  NPC_PROP_SET_IDS,
  npcLookFor,
  npcModularKeyFor,
} from '../src/render/characters/npc_looks';
import { NPCS } from '../src/sim/data';

describe('npc looks roster', () => {
  it('covers every NpcDef id except fixed bespoke rigs', () => {
    const missing = Object.keys(NPCS).filter(
      (id) => !aldricKeepsHisRig(id) && !meshyNpcKeepsItsRig(id) && npcLookFor(id) === null,
    );
    expect(missing).toEqual([]);
  });

  it('keeps named Meshy NPCs on their bespoke fixed bodies', () => {
    expect(meshyNpcKeepsItsRig('apothecary_lin')).toBe(true);
    expect(npcLookFor('apothecary_lin')).toBeNull();
    expect(NPC_LOOKS.apothecary_lin).toBeUndefined();
    expect(visualKeyFor({ kind: 'npc', templateId: 'apothecary_lin' } as never)).toBe(
      'npc_apothecary_lin',
    );
    expect(VISUALS.npc_apothecary_lin).toMatchObject({
      url: 'models/chars/npcs/apothecary_lin.glb',
      clips: {
        idle: 'Apothecary_Idle_A',
      },
    });
    for (const [id, visualKey, url, idle] of [
      [
        'fisherman_brandt',
        'npc_fisherman_brandt',
        'models/chars/npcs/fisherman_brandt.glb',
        'Fisherman_Idle',
      ],
      ['trader_wilkes', 'npc_trader_wilkes', 'models/chars/npcs/trader_wilkes.glb', 'Trader_Idle'],
      ['smith_haldren', 'npc_smith_haldren', 'models/chars/npcs/smith_haldren.glb', 'Smith_Idle'],
      [
        'marshal_redbrook',
        'npc_marshal_redbrook',
        'models/chars/npcs/marshal_redbrook.glb',
        'Marshal_Idle',
      ],
      ['foreman_odell', 'npc_foreman_odell', 'models/chars/npcs/foreman_odell.glb', 'Foreman_Idle'],
    ] as const) {
      expect(meshyNpcKeepsItsRig(id), id).toBe(true);
      expect(npcLookFor(id), id).toBeNull();
      expect(NPC_LOOKS[id], id).toBeUndefined();
      expect(visualKeyFor({ kind: 'npc', templateId: id } as never)).toBe(visualKey);
      expect(VISUALS[visualKey]).toMatchObject({
        url,
        preserveSkinnedParts: true,
        clips: { idle },
      });
    }
  });

  // Every placement of Brother Aldric shares his named imported body.
  it('never composes Brother Aldric, at any of his hub ids', () => {
    const aldricIds = Object.keys(NPCS).filter((id) => id.startsWith('brother_aldric'));
    expect(aldricIds.length).toBeGreaterThan(1);
    for (const id of aldricIds) {
      expect(aldricKeepsHisRig(id), id).toBe(true);
      expect(npcLookFor(id), id).toBeNull();
      expect(visualKeyFor({ kind: 'npc', templateId: id } as never)).toBe('npc_aldric');
    }
    expect(VISUALS.npc_aldric).toMatchObject({
      url: 'models/chars/npcs/brother_aldric.glb',
      preserveSkinnedParts: true,
      clips: { idle: 'Aldric_Idle' },
    });
    expect(Object.keys(NPC_LOOKS).filter((id) => id.startsWith('brother_aldric'))).toEqual([]);
  });

  it('leaves NPCs without their own imported model on their authored looks', () => {
    for (const id of [
      'the_merchant',
      'bursar_fernando',
      'card_master',
      'chronicler_saul',
      'forgemistress_darva',
      'cook_marlow',
      'weaver_ottilie',
      'tinker_gizzel',
      'farmer_jessica',
    ]) {
      expect(meshyNpcKeepsItsRig(id), id).toBe(false);
      expect(npcLookFor(id), id).not.toBeNull();
    }
  });

  it('covers the NPC-bodied quest actors and the dev vendor', () => {
    for (const id of [
      'ptr_dev_vendor',
      'fisher_bram',
      'apprentice_wren',
      'castaway_navigator',
      'gravedigger_mosley',
    ]) {
      expect(npcLookFor(id), id).not.toBeNull();
    }
  });

  it('keeps every Proving Shore civilian unarmed', () => {
    for (const id of [
      'instructor_maren',
      'quartermaster_finch',
      'bursar_wick',
      'ferryman_odo',
      'warden_tam',
      'overseer_pell',
      'drillmaster_rook',
      'tidewarden_nel',
    ]) {
      expect(NPC_LOOKS[id]?.props, id).toBe('none');
    }
  });

  it('keeps mob-kind Sexton Marrow on the mob visual while NPC-kind composes', () => {
    const npcLook = npcLookFor('sexton_marrow', 'npc');
    expect(npcLook).not.toBeNull();
    expect(npcLookFor('sexton_marrow')).toBe(npcLook);
    expect(npcLookFor('sexton_marrow', 'mob')).toBeNull();
    expect(visualKeyFor({ kind: 'mob', templateId: 'sexton_marrow' } as never)).toBe('skel_mage');
  });

  // Aldric's hub ids are covered by the dedicated null test above; asserting
  // alias equality on him here would compare null to null and pass vacuously.
  it('recurring characters share one look across their hub ids', () => {
    expect(npcLookFor('scout_maren')).not.toBeNull();
    expect(npcLookFor('scout_maren_highwatch')).toBe(npcLookFor('scout_maren'));
    expect(npcLookFor('brother_halven')).not.toBeNull();
    expect(npcLookFor('brother_halven_marsh')).toBe(npcLookFor('brother_halven'));
  });

  it('resolves to a stable object identity (caches key off it)', () => {
    for (const id of Object.keys(NPCS)) {
      expect(npcLookFor(id)).toBe(npcLookFor(id));
    }
  });

  it('every authored appearance value survives normalization unchanged', () => {
    for (const [id, def] of Object.entries(NPC_LOOKS)) {
      const normalized = normalizeAppearance(def.app) as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(def.app)) {
        expect(normalized[key], `${id}.${key}`).toEqual(value);
      }
    }
  });

  it('no two NPCs share an authored appearance', () => {
    const seen = new Map<string, string>();
    for (const [id, def] of Object.entries(NPC_LOOKS)) {
      const sig = JSON.stringify(normalizeAppearance(def.app));
      const prior = seen.get(sig);
      expect(prior, `${id} duplicates ${prior}`).toBeUndefined();
      seen.set(sig, id);
    }
  });

  it('worn loadouts reference only real slots and sets', () => {
    for (const [id, def] of Object.entries(NPC_LOOKS)) {
      for (const [slot, set] of Object.entries(def.worn)) {
        expect(ARMOR_SLOTS, `${id} slot ${slot}`).toContain(slot);
        if (set !== null && set !== undefined) {
          expect(ARMOR_SETS, `${id} ${slot}=${set}`).toContain(set);
        }
      }
    }
  });

  it('every prop set derives a modular VisualDef, and every NPC resolves one', () => {
    for (const propSet of NPC_PROP_SET_IDS) {
      const def = VISUALS[`npc_modular_${propSet}`];
      expect(def, propSet).toBeDefined();
      expect(def.modular, propSet).toBe(true);
    }
    for (const id of [...Object.keys(NPCS), ...Object.keys(NPC_LOOKS)]) {
      const key = npcModularKeyFor(id);
      expect(VISUALS[key], `${id} -> ${key}`).toBeDefined();
    }
    const unknownPropSets = Object.entries(NPC_LOOKS)
      .filter(([, def]) => !NPC_PROP_SET_IDS.includes(def.props))
      .map(([id]) => id);
    expect(unknownPropSets).toEqual([]);
  });
});
