import { describe, expect, it, vi } from 'vitest';
import { AbilityVfx, type AbilityVfxDeps } from '../src/render/ability_vfx/painter';
import { abilityVfxFullSpec } from '../src/render/ability_vfx_registry';

function painter(quality: number) {
  const fx = { setDelegates: vi.fn(), setQuality: vi.fn(), sequenceBolt: vi.fn() };
  const vfx = { projectile: vi.fn() };
  const triggerAttack = vi.fn();
  const triggerCastRelease = vi.fn();
  const result = new AbilityVfx(
    {
      fx,
      vfx,
      triggerAttack,
      triggerCastRelease,
      hasGestureClip: () => true,
      anchor: () => ({ x: 0, y: 1, z: 0 }),
    } as unknown as AbilityVfxDeps,
    () => 0,
  );
  result.setQuality(quality);
  if (quality === 0) {
    // Fill the REAL shared cast budget: low quality alone is not tier 2.
    for (let id = 10; id < 55; id++)
      result.handleSpellfx({
        sourceId: id,
        targetId: 2,
        school: 'physical',
        fx: 'projectile',
        ability: 'arcane_shot',
        attackAnimation: 'ranged-shot',
      });
    fx.sequenceBolt.mockClear();
    vfx.projectile.mockClear();
    triggerAttack.mockClear();
  }
  return { result, fx, vfx, triggerAttack, triggerCastRelease };
}
describe('Hunter arrow and bolt presentation', () => {
  it.each([
    'arcane_shot',
    'concussive_shot',
    'aimed_shot',
    'measured_shot',
    'serpent_sting',
    'counter_shot',
    'multi_shot',
    'startle_shot',
  ])(
    'uses arrow travel for %s at full and degraded quality, preserving launch animation',
    (ability) => {
      for (const quality of [0, 1]) {
        const p = painter(quality);
        expect(
          p.result.handleSpellfx({
            sourceId: 1,
            targetId: 2,
            school: 'physical',
            fx: 'projectile',
            ability,
            attackAnimation: 'ranged-shot',
          }),
        ).toBe(true);
        expect(p.triggerAttack).toHaveBeenCalledExactlyOnceWith(1);
        expect(p.triggerCastRelease).not.toHaveBeenCalled();
        if (quality === 1) {
          expect(p.fx.sequenceBolt).toHaveBeenCalledOnce();
          expect(p.fx.sequenceBolt.mock.calls[0][1].bolt.style).toBe('arrow');
          expect(p.vfx.projectile).not.toHaveBeenCalled();
        } else {
          expect(p.fx.sequenceBolt).not.toHaveBeenCalled();
          expect(p.vfx.projectile).toHaveBeenCalled();
          expect(p.vfx.projectile.mock.calls.every((call) => call[5] === true)).toBe(true);
        }
      }
    },
  );
  it('does not restyle caster magic or steal cast-time release callbacks', () => {
    expect(abilityVfxFullSpec('fireball')?.bolt?.style).not.toBe('arrow');
    expect(abilityVfxFullSpec('shadow_bolt')?.bolt?.style).not.toBe('arrow');
    const p = painter(1);
    p.result.handleSpellfx({
      sourceId: 1,
      targetId: 2,
      school: 'physical',
      fx: 'projectile',
      ability: 'aimed_shot',
    });
    expect(p.triggerCastRelease).toHaveBeenCalledExactlyOnceWith(1, 'aimed_shot', 2);
    expect(p.triggerAttack).not.toHaveBeenCalled();
    expect(
      p.result.handleSpellfx({ sourceId: 1, targetId: 2, school: 'physical', fx: 'projectile' }),
    ).toBe(false);
  });
});
