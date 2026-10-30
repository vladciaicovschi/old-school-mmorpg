import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { npcLookFor, npcModularKeyFor } from '../src/render/characters/npc_looks';
import { resolvePosition } from '../src/sim/colliders';
import {
  DEV_MODEL_COMPARISONS,
  DEV_NPC_REPLACEMENTS,
} from '../src/sim/content/dev_model_comparisons';
import {
  DEV_MODEL_LAB_ARRIVAL,
  DEV_MODEL_LAB_MOB_LINEUP,
  DEV_MODEL_LAB_NPC_LINEUP,
  DEV_MODEL_LAB_PROPS,
  isOnDevModelLab,
} from '../src/sim/content/dev_model_lab';
import {
  DEV_MODEL_LAB_SUBJECTS,
  DEV_MODEL_COMPARISON_GALLERY as gallery,
  MOBS,
  NPCS,
} from '../src/sim/data';
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

  it('covers the named NPC roster and keeps preview NPC definitions inert and dynamic', () => {
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

  it('shows one current model per row and keeps old bodies only for missing replacements', () => {
    const pairs = new Set(gallery.subjects.map((subject) => subject.pairId));
    expect(pairs.size).toBe(gallery.subjects.length);
    for (const row of DEV_MODEL_COMPARISONS) {
      const subjects = gallery.subjects.filter((s) => s.pairId === `${row.category}_${row.id}`);
      expect(subjects).toHaveLength(1);
      expect(subjects[0]).toMatchObject({
        side: row.newVisual ? 'new' : 'old',
        visualKey: row.newVisual ?? row.oldVisual,
        status: row.newVisual ? (row.installed ? 'installed' : 'ready') : 'missing',
      });
      if (row.newVisual) {
        expect(gallery.templates).not.toHaveProperty(`dev_compare_${row.category}_old_${row.id}`);
        if (row.palette) {
          expect(VISUALS[row.oldVisual].url).toBe(VISUALS[row.newVisual].url);
          expect(VISUALS[row.oldVisual].atlasDye).toBeUndefined();
          expect(VISUALS[row.newVisual].atlasDye?.rules.length).toBeGreaterThan(0);
        } else expect(VISUALS[row.oldVisual].url).not.toBe(VISUALS[row.newVisual].url);
      }
    }
    for (const [id, visualKey] of Object.entries(DEV_NPC_REPLACEMENTS)) {
      expect(gallery.subjects.filter((s) => s.pairId === `npc_${id}`)).toMatchObject([
        { side: 'new', visualKey, sourceNpcId: id },
      ]);
      expect(gallery.templates).not.toHaveProperty(`dev_compare_npc_old_${id}`);
    }
  });

  it.each([
    ['elemental', 'mob_elemental', 'npc_dev_stone_elemental', 'dev_stone_elemental'],
    ['fire_elemental', 'mob_elemental', 'npc_dev_fire_elemental', 'dev_fire_elemental'],
    ['ice_elemental', 'mob_elemental', 'npc_dev_ice_elemental', 'dev_ice_elemental'],
    ['water_elemental', 'mob_water_elemental', 'npc_dev_water_elemental', 'dev_water_elemental'],
    ['storm_elemental', 'mob_elemental', 'npc_dev_storm_elemental', 'dev_storm_elemental'],
  ])(
    'links %s to its ready replacement without an old body or missing flag',
    (id, oldVisual, newVisual, labMobId) => {
      expect(DEV_MODEL_COMPARISONS.find((row) => row.id === id)).toMatchObject({
        category: 'mob',
        oldVisual,
        newVisual,
        labMobId,
      });
      const subjects = gallery.subjects.filter((subject) => subject.pairId === `mob_${id}`);
      expect(subjects).toHaveLength(1);
      const subject = subjects[0];
      expect(subject).toMatchObject({ side: 'new', status: 'ready', visualKey: newVisual });
      expect(visualKeyFor(entityFor(subject.templateId))).toBe(newVisual);
      const pad = DEV_MODEL_LAB_MOB_LINEUP.find((entry) => entry.templateId === labMobId);
      expect(pad).toBeDefined();
      if (!pad) throw new Error(`Missing elemental combat pad: ${labMobId}`);
      expect(Math.hypot(subject.x - pad.x, subject.z - pad.z)).toBeLessThan(12);
      // Each label and body needs its own space, including nearby palette trials.
      for (const other of [
        ...gallery.subjects.filter((entry) => entry !== subject),
        ...DEV_MODEL_LAB_MOB_LINEUP,
        ...DEV_MODEL_LAB_NPC_LINEUP,
      ]) {
        expect(
          Math.hypot(subject.x - other.x, subject.z - other.z),
          other.templateId,
        ).toBeGreaterThanOrEqual(8);
      }
      expect(gallery.templates).not.toHaveProperty(`dev_compare_mob_old_${id}`);
      expect(DEV_MODEL_LAB_PROPS.decorProps).not.toContainEqual({
        key: 'hexFlagRed',
        x: subject.x,
        z: subject.z,
        scale: 6,
      });
    },
  );

  it('keeps missing-slot flags and resolves every remaining model asset', () => {
    const ids = new Set<string>();
    for (const old of DEV_MODEL_LAB_SUBJECTS.filter((s) => s.side === 'old')) {
      const replacement = gallery.subjects.find((s) => s.pairId === old.pairId && s.side === 'new');
      expect(old.status).toBe('missing');
      expect(replacement).toBeUndefined();
      expect(NPCS[old.templateId].title).toBe('NO REPLACEMENT');
      expect(DEV_MODEL_LAB_PROPS.decorProps).toContainEqual({
        key: 'hexFlagRed',
        x: old.x - 8,
        z: old.z,
        scale: 6,
      });
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
