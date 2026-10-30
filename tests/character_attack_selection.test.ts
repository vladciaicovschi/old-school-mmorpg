import { afterEach, describe, expect, it, vi } from 'vitest';
import { VISUALS, type VisualDef } from '../src/render/characters/manifest';
import { CharacterVisual } from '../src/render/characters/visual';

function harness(def: VisualDef) {
  const playOneShot = vi.fn();
  const visual = Object.assign(Object.create(CharacterVisual.prototype), {
    def,
    deadLock: false,
    attackIdx: 0,
    weaponItemId: null,
    offhandItemId: null,
    weaponSkinId: null,
    action: () => ({}),
    playOneShot,
    syncHeldPropCastStow: vi.fn(),
  }) as { playAttack(abilityId?: string): void; weaponItemId: string | null; deadLock: boolean };
  return { visual, playOneShot };
}
afterEach(() => vi.restoreAllMocks());

describe('cosmetic attack selection through CharacterVisual', () => {
  it.each(['npc_dev_smart_wolf', 'npc_dev_smart_wolf_v2'])(
    '%s follows random rolls including repeated sides',
    (key) => {
      const { visual, playOneShot } = harness(VISUALS[key]);
      const random = vi.spyOn(Math, 'random');
      for (const roll of [0.85, 0.2, 0.25, 0.7, 0.69, 0.99, 0.01]) {
        random.mockReturnValue(roll);
        visual.playAttack();
      }
      expect(playOneShot.mock.calls.map((c) => c[0])).toEqual([
        'Wolf_Lunge',
        'Wolf_BiteLeft',
        'Wolf_BiteLeft',
        'Wolf_BiteRight',
        'Wolf_BiteRight',
        'Wolf_Lunge',
        'Wolf_BiteLeft',
      ]);
      expect(random).toHaveBeenCalledTimes(7);
      expect(playOneShot.mock.calls.every((c) => c[1] === 1)).toBe(true);
    },
  );

  it('keeps both bite sides equally likely and lunges less common', () => {
    const { visual, playOneShot } = harness(VISUALS.npc_dev_smart_wolf_v2),
      random = vi.spyOn(Math, 'random');
    for (let i = 0; i < 100; i++) {
      random.mockReturnValue((i + 0.5) / 100);
      visual.playAttack();
    }
    const counts = Object.fromEntries(
      ['Wolf_BiteLeft', 'Wolf_BiteRight', 'Wolf_Lunge'].map((name) => [
        name,
        playOneShot.mock.calls.filter((c) => c[0] === name).length,
      ]),
    );
    expect(counts).toEqual({ Wolf_BiteLeft: 40, Wolf_BiteRight: 40, Wolf_Lunge: 20 });
  });

  it('retains the existing cycle for unweighted creatures', () => {
    const def = VISUALS.npc_dev_smart_bear,
      { visual, playOneShot } = harness(def),
      random = vi.spyOn(Math, 'random');
    for (let i = 0; i < 10; i++) visual.playAttack();
    expect(playOneShot.mock.calls.map((c) => c[0])).toEqual([
      ...def.clips.attack,
      ...def.clips.attack,
    ]);
    expect(random).not.toHaveBeenCalled();
  });

  const withWeapon = (attackWeights?: readonly number[]): VisualDef => {
    const def = VISUALS.npc_dev_smart_wolf_v2;
    return {
      ...def,
      clips: {
        ...def.clips,
        weaponMotions: {
          onehand: {
            idle: 'Idle',
            walk: 'Walk',
            run: 'Run',
            jump: 'Jump',
            attack: ['WeaponA', 'WeaponB', 'WeaponC'],
            attackWeights,
          },
        },
      },
    };
  };
  it('lets an equipped weapon own its weighted selection', () => {
    const { visual, playOneShot } = harness(withWeapon([0, 0, 1]));
    visual.weaponItemId = 'worn_sword';
    vi.spyOn(Math, 'random').mockReturnValue(0);
    visual.playAttack();
    expect(playOneShot).toHaveBeenCalledWith('WeaponC', 1);
  });
  it('does not lend default weights to an unweighted weapon profile', () => {
    const { visual, playOneShot } = harness(withWeapon());
    visual.weaponItemId = 'worn_sword';
    const random = vi.spyOn(Math, 'random');
    for (let i = 0; i < 3; i++) visual.playAttack();
    expect(playOneShot.mock.calls.map((c) => c[0])).toEqual(['WeaponA', 'WeaponB', 'WeaponC']);
    expect(random).not.toHaveBeenCalled();
  });
  it('keeps explicit ability gestures ahead of random auto attacks', () => {
    const def = VISUALS.npc_dev_smart_wolf_v2,
      { visual, playOneShot } = harness({
        ...def,
        clips: { ...def.clips, attackByAbility: { special_bite: 'Wolf_Lunge' } },
      }),
      random = vi.spyOn(Math, 'random');
    visual.playAttack('special_bite');
    expect(playOneShot).toHaveBeenCalledWith('Wolf_Lunge', 1);
    expect(random).not.toHaveBeenCalled();
  });
  it('does not select an attack after death', () => {
    const { visual, playOneShot } = harness(VISUALS.npc_dev_smart_wolf_v2);
    visual.deadLock = true;
    const random = vi.spyOn(Math, 'random');
    visual.playAttack();
    expect(playOneShot).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });
});
