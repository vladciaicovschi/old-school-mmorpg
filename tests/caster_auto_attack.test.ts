import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { playCasterAutoAttack } from '../src/render/caster_auto_attack';

const cue = { fx: 'projectile', wand: true as const, sourceId: 1, targetId: 2, school: 'arcane' };
function fixture(found = true, animate = true) {
  const visual = {
    playMagicAutoAttack: vi.fn(() => animate),
    castPalmWorldPosition: vi.fn((out: Vector3) => {
      out.set(4, 5, 6);
      return found;
    }),
  };
  const vfx = { projectileForEvent: vi.fn() };
  return { visual, vfx };
}
describe('caster magic auto launch', () => {
  it('plays one release and spawns from the displayed palm without delaying the cue', () => {
    const f = fixture();
    expect(playCasterAutoAttack(cue, 'player', f.visual, f.vfx)).toBe(true);
    expect(f.visual.playMagicAutoAttack).toHaveBeenCalledOnce();
    expect(f.vfx.projectileForEvent).toHaveBeenCalledExactlyOnceWith(cue, new Vector3(4, 5, 6));
  });
  it('keeps the projectile when a current spell already owns the animation', () => {
    const f = fixture(true, false);
    expect(playCasterAutoAttack(cue, 'player', f.visual, f.vfx)).toBe(true);
    expect(f.vfx.projectileForEvent).toHaveBeenCalledOnce();
  });
  it.each([undefined, 'mob', 'pet'])('does not intercept non-player kind %s', (kind) => {
    const f = fixture();
    expect(playCasterAutoAttack(cue, kind, f.visual, f.vfx)).toBe(false);
    expect(f.visual.playMagicAutoAttack).not.toHaveBeenCalled();
    expect(f.vfx.projectileForEvent).not.toHaveBeenCalled();
  });
  it.each([
    { ...cue, wand: undefined },
    { ...cue, fx: 'windup' },
    { ...cue, wand: undefined, attackAnimation: 'ranged-shot' },
  ])('leaves ability bolts and physical ranged shots on their existing route (%j)', (event) => {
    const f = fixture();
    expect(playCasterAutoAttack(event, 'player', f.visual, f.vfx)).toBe(false);
    expect(f.visual.playMagicAutoAttack).not.toHaveBeenCalled();
    expect(f.vfx.projectileForEvent).not.toHaveBeenCalled();
  });
  it('falls back to the body anchor for missing and hidden/form rigs', () => {
    const f = fixture(false);
    playCasterAutoAttack(cue, 'player', f.visual, f.vfx);
    expect(f.vfx.projectileForEvent).toHaveBeenCalledWith(cue, undefined);
    playCasterAutoAttack(cue, 'player', null, f.vfx);
    expect(f.vfx.projectileForEvent).toHaveBeenLastCalledWith(cue, undefined);
  });
});
