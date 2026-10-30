import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { SPIDER_VARIANTS } from '../src/render/characters/spider_palettes';
import { DEV_MODEL_COMPARISONS } from '../src/sim/content/dev_model_comparisons';
import { DEV_MODEL_LAB_MOB_LINEUP } from '../src/sim/content/dev_model_lab';
import { DEV_MODEL_COMPARISON_GALLERY as gallery, MOBS } from '../src/sim/data';

describe('spider palette and size trials', () => {
  it.each([
    ['forest', 0.9, 92, 46],
    ['marsh', 1.05, 150, 112],
    ['sand', 0.8, 34, 22],
    ['frost', 1.1, 204, 187],
    ['broodmother', 1.3, 8, 0],
  ] as const)(
    '%s shares the original body and motion at the authored scale',
    (name, scale, shell, accent) => {
      const base = VISUALS.mob_spider;
      const variant = VISUALS[`npc_dev_spider_${name}`];
      expect(SPIDER_VARIANTS[name].scale).toBe(scale);
      expect(variant.url).toBe(base.url);
      expect(variant.clips).toBe(base.clips);
      expect(variant.height).toBeCloseTo(0.85 * scale, 5);
      expect(variant.walkRef).toBeCloseTo(1.071 * scale, 4);
      expect(variant.runRef).toBeCloseTo(5.455 * scale, 4);
      expect(variant.atlasDye?.rules.map((r) => r.hue)).toEqual([shell, accent]);
      expect(variant.tint).toBeUndefined();
      expect(base.atlasDye).toBeUndefined();
      const row = DEV_MODEL_COMPARISONS.find((r) => r.id === `spider_${name}`);
      expect(row).toMatchObject({
        palette: true,
        labMobId: 'dev_smart_spider',
        combatMobId: `dev_spider_${name}`,
      });
      const subjects = gallery.subjects.filter((s) => s.pairId === `animal_spider_${name}`);
      expect(subjects).toHaveLength(1);
      expect(subjects[0]).toMatchObject({
        side: 'new',
        status: 'ready',
        visualKey: `npc_dev_spider_${name}`,
      });
      expect(visualKeyFor({ kind: 'npc', templateId: subjects[0].templateId } as never)).toBe(
        `npc_dev_spider_${name}`,
      );
    },
  );

  it('uses separate shell and violet accent selectors without touching the source atlas', () => {
    for (const { dye } of Object.values(SPIDER_VARIANTS)) {
      expect(dye.rules).toHaveLength(2);
      expect(dye.rules[0].sat).toEqual([-0.02, -0.01, 0.3, 0.5]);
      expect(dye.rules[1]).toMatchObject({ ref: 285, band: 52, sat: [0.28, 0.5, 1.1, 1.2] });
    }
    expect(new Set(Object.values(SPIDER_VARIANTS).map((v) => v.dye)).size).toBe(5);
  });

  it('places all trials near the original without overlapping or consuming gallery cells', () => {
    const pad = DEV_MODEL_LAB_MOB_LINEUP.find((s) => s.templateId === 'dev_smart_spider');
    if (!pad) throw new Error('Missing spider pad');
    const subjects = gallery.subjects.filter((s) => /^animal_spider(?:_|$)/.test(s.pairId));
    expect(subjects).toHaveLength(6);
    const expected = [
      [844, 40],
      [828, 40],
      [828, 48],
      [828, 56],
      [836, 56],
      [844, 56],
    ];
    expect(subjects.map((s) => [s.x, s.z])).toEqual(expected);
    const occupied = [{ x: pad.x, z: pad.z }, ...subjects];
    for (const [index, a] of occupied.entries()) {
      expect(Math.hypot(a.x - pad.x, a.z - pad.z)).toBeLessThan(13);
      for (const b of occupied.slice(index + 1))
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(8);
    }
    for (const trial of subjects.slice(1)) {
      const nearest = gallery.subjects.filter((s) => !subjects.includes(s));
      for (const other of nearest)
        expect(Math.hypot(trial.x - other.x, trial.z - other.z)).toBeGreaterThan(4);
    }
  });

  it('leaves production spiders on the existing base appearance', () => {
    for (const mob of Object.values(MOBS).filter(
      (m) => m.family === 'spider' && m.id !== 'spider_egg' && !m.id.startsWith('dev_'),
    )) {
      expect(visualKeyFor({ kind: 'mob', templateId: mob.id } as never)).toBe('mob_spider');
    }
    expect(VISUALS.mob_spider.height).toBe(0.85);
    expect(VISUALS.mob_spider.atlasDye).toBeUndefined();
  });
});
