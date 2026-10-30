import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { npcLookFor, npcModularKeyFor } from '../src/render/characters/npc_looks';
import { resolvePosition } from '../src/sim/colliders';
import { DEV_MODEL_COMPARISONS } from '../src/sim/content/dev_model_comparisons';
import {
  DEV_MODEL_LAB_ARRIVAL,
  DEV_MODEL_LAB_PROPS,
  isOnDevModelLab,
} from '../src/sim/content/dev_model_lab';
import { DEV_MODEL_COMPARISON_GALLERY as gallery, MOBS, NPCS } from '../src/sim/data';
import type { Entity } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';
import { worldEntityText } from '../src/ui/world_entity_i18n';

const entityFor = (templateId: string) => ({ kind: 'npc', templateId }) as Entity;

describe('model replacement comparison gallery', () => {
  it('covers every animal and enemy visual archetype, including missing candidates', () => {
    const covered = new Set(DEV_MODEL_COMPARISONS.flatMap((row) => [row.oldVisual, row.newVisual]));
    // Same scuttler asset, with the boss/tint variants already present.
    covered.add('mob_proving_shore_scuttler');
    for (const key of Object.keys(VISUALS).filter((key) =>
      /^(mob_|skel_|delve_|rift_)/.test(key),
    )) {
      expect(covered.has(key), key).toBe(true);
    }
    for (const id of Object.keys(MOBS).filter((id) => !id.startsWith('dev_'))) {
      const key = visualKeyFor({ kind: 'mob', templateId: id } as Entity);
      expect(covered.has(key), id).toBe(true);
    }
    expect(gallery.subjects.some((s) => s.category === 'animal' && s.status === 'missing')).toBe(
      true,
    );
    expect(gallery.subjects.some((s) => s.category === 'mob' && s.status === 'missing')).toBe(true);
  });

  it('covers the complete named NPC roster and keeps all mannequins inert and dynamic', () => {
    const sources = new Set(gallery.subjects.map((s) => s.sourceNpcId));
    for (const npc of Object.values(NPCS).filter((npc) => !npc.id.startsWith('dev_'))) {
      const canonical = npc.id.startsWith('brother_aldric')
        ? 'brother_aldric'
        : npc.id === 'scout_maren_highwatch'
          ? 'scout_maren'
          : npc.id === 'brother_halven_marsh'
            ? 'brother_halven'
            : npc.id;
      expect(sources.has(canonical), npc.id).toBe(true);
    }
    for (const subject of gallery.subjects) {
      const npc = NPCS[subject.templateId];
      expect(npc.dynamic).toBe(true);
      expect(npc.questIds).toEqual([]);
      expect(npc.vendorItems).toBeUndefined();
      expect(npc.banker).toBeUndefined();
      expect(npc.market).toBeUndefined();
      expect(npc.name).toContain(subject.side.toUpperCase());
      expect(
        (worldEntityText.en.entities.npcs as Record<string, { name: string }>)[npc.id].name,
      ).toBe(npc.name);
    }
  });

  it('puts each real replacement eight yards beside its original, with an explicitly empty missing slot', () => {
    const ids = new Set<string>();
    for (const old of gallery.subjects.filter((s) => s.side === 'old')) {
      const replacement = gallery.subjects.find((s) => s.pairId === old.pairId && s.side === 'new');
      if (old.status === 'missing') {
        expect(replacement).toBeUndefined();
        expect(NPCS[old.templateId].title).toBe('NO REPLACEMENT');
        expect(DEV_MODEL_LAB_PROPS.decorProps).toContainEqual({
          key: 'hexFlagRed',
          x: old.x - 8,
          z: old.z,
          scale: 6,
        });
      } else {
        expect(replacement).toMatchObject({
          x: old.x - 8,
          z: old.z,
          status: old.status,
          category: old.category,
        });
        const oldLook = npcLookFor(old.templateId);
        const oldKey = oldLook
          ? npcModularKeyFor(old.templateId)
          : visualKeyFor(entityFor(old.templateId));
        if (!replacement) throw new Error(`Missing replacement for ${old.pairId}`);
        const newKey = visualKeyFor(entityFor(replacement.templateId));
        expect(oldKey, old.pairId).not.toBe(newKey);
        expect(VISUALS[oldKey].url, old.pairId).not.toBe(VISUALS[newKey].url);
      }
    }
    for (const subject of gallery.subjects) {
      expect(ids.has(subject.templateId)).toBe(false);
      ids.add(subject.templateId);
      const key = npcLookFor(subject.templateId)
        ? npcModularKeyFor(subject.templateId)
        : visualKeyFor(entityFor(subject.templateId));
      expect(VISUALS[key], subject.templateId).toBeDefined();
      expect(existsSync(`public/${VISUALS[key].url}`), key).toBe(true);
    }
  });

  it('preserves the genuine old crab, ogre and named NPC looks after rollout', () => {
    expect(VISUALS.dev_legacy_crab.url).toBe('models/creatures/crabenemy.glb');
    expect(VISUALS.dev_legacy_ogre.url).toBe('models/creatures/ogre.glb');
    expect(VISUALS.dev_legacy_aldric.url).toBe('models/chars/players/mage_classic.glb');
    expect(npcLookFor('dev_compare_npc_old_apothecary_lin')).not.toBeNull();
    expect(npcLookFor('dev_compare_npc_new_apothecary_lin')).toBeNull();
    expect(npcLookFor('apothecary_lin')).toBeNull();
    expect(visualKeyFor(entityFor('apothecary_lin'))).toBe('npc_apothecary_lin');
    expect(npcLookFor('dev_compare_npc_old_cook_marlow')).toBe(npcLookFor('cook_marlow'));
    expect(visualKeyFor(entityFor('dev_compare_npc_new_instructor_maren'))).toBe(
      'npc_quaternius_instructor_maren',
    );
  });

  it('pins installed status to real production routes and archives to playable idle clips', () => {
    for (const [pairId, sourceId] of [
      ['animal_crab', 'tide_scuttler'],
      ['animal_tidepool_boss', 'mister_crabs'],
      ['mob_murloc', 'mudfin_murloc'],
      ['mob_kobold', 'tunnel_rat'],
      ['mob_deeprock_kobold', 'deeprock_kobold'],
      ['mob_grix', 'grix_the_tunnelking'],
      ['mob_ogre', 'thornpeak_ogre'],
    ]) {
      const replacement = gallery.subjects.find((s) => s.pairId === pairId && s.side === 'new');
      expect(replacement?.status, pairId).toBe('installed');
      expect(replacement?.visualKey, sourceId).toBe(
        visualKeyFor({ kind: 'mob', templateId: sourceId } as Entity),
      );
    }
    for (const subject of gallery.subjects.filter(
      (s) => s.side === 'new' && s.category === 'npc' && s.status === 'installed',
    )) {
      expect(subject.visualKey).toBe(visualKeyFor(entityFor(subject.sourceNpcId ?? '')));
    }
    for (const key of ['dev_legacy_crab', 'dev_legacy_ogre', 'dev_legacy_aldric']) {
      const def = VISUALS[key];
      const names = new Set<string>();
      for (const url of [def.url, ...(def.animUrls ?? [])]) {
        const bytes = readFileSync(`public/${url}`);
        const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
        for (const clip of json.animations ?? []) names.add(clip.name);
      }
      expect(names.has(def.clips.idle), key).toBe(true);
    }
  });

  it('keeps all slots dry, level and clear of colliders, with room to approach', () => {
    const height = terrainHeight(DEV_MODEL_LAB_ARRIVAL.x, DEV_MODEL_LAB_ARRIVAL.z, WORLD_SEED);
    for (const subject of gallery.subjects) {
      expect(isOnDevModelLab(subject.x, subject.z)).toBe(true);
      for (const [dx, dz] of [
        [0, 0],
        [3, 0],
        [-3, 0],
        [0, 3],
        [0, -3],
      ]) {
        const x = subject.x + dx;
        const z = subject.z + dz;
        expect(terrainHeight(x, z, WORLD_SEED), `${subject.templateId}: ${x},${z}`).toBeCloseTo(
          height,
          6,
        );
        const resolved = resolvePosition(WORLD_SEED, x, z);
        expect(
          Math.hypot(resolved.x - x, resolved.z - z),
          `${subject.templateId}: ${x},${z}`,
        ).toBeLessThan(0.001);
      }
    }
  });
});
