/** Warrior-only trial of automatic weapon carry. The simulation still owns gear
 * and attacks; this projection reads the same entity facts on both hosts. */
export interface WeaponCarryFacts {
  id: number;
  kind: string;
  templateId: string;
  dead: boolean;
  inCombat: boolean;
  autoAttack: boolean;
  targetId: number | null;
  aggroTargetId: number | null;
  castingAbility: string | null;
  weaponStowed: boolean;
}

interface CarryChoice {
  manualBit: boolean;
  manualStowed: boolean | null;
  settle: number;
  stowed: boolean;
}

export const WEAPON_CARRY_SETTLE_SECONDS = 1;

/** Use equipment handedness, not model size or skin family. Shields and held
 * offhands are not weapons and retain their existing back carry. */
export function weaponUsesHipCarry(item: { kind: string; hand?: string } | undefined): boolean {
  return item?.kind === 'weapon' && item.hand !== 'twohand';
}

export class WeaponCarryPresentation {
  private readonly engaged = new Set<number>();
  private readonly choices = new WeakMap<WeaponCarryFacts, CarryChoice>();

  /** One allocation-free census per frame, including incoming aggro for peers
   * whose snapshots carry targeting but not the self-only combat scalar. */
  sync(entities: Iterable<WeaponCarryFacts>): void {
    this.engaged.clear();
    for (const e of entities) {
      if (e.dead) continue;
      if (e.inCombat || e.autoAttack || e.aggroTargetId !== null) this.engaged.add(e.id);
      if (e.aggroTargetId !== null) this.engaged.add(e.aggroTargetId);
      if (e.autoAttack && e.targetId !== null) this.engaged.add(e.targetId);
      if (e.kind === 'player' && e.templateId === 'warrior' && e.castingAbility !== null)
        this.engaged.add(e.id);
    }
  }

  combat(e: WeaponCarryFacts): boolean {
    return !e.dead && e.kind === 'player' && e.templateId === 'warrior' && this.engaged.has(e.id);
  }

  /** undefined preserves the existing manual policy for every other class.
   * Manual bit EDGES toggle the visible pose, because automatic carry can
   * differ from the stored bit. A new fight clears that temporary override. */
  stowed(e: WeaponCarryFacts, dt: number): boolean | undefined {
    if (e.kind !== 'player' || e.templateId !== 'warrior') return undefined;
    const combat = this.combat(e);
    let choice = this.choices.get(e);
    if (!choice) {
      choice = {
        manualBit: e.weaponStowed,
        manualStowed: null,
        settle: 0,
        stowed: !combat,
      };
      this.choices.set(e, choice);
    }
    if (combat) {
      choice.manualStowed = null;
      choice.settle = WEAPON_CARRY_SETTLE_SECONDS;
    } else {
      if (choice.manualBit !== e.weaponStowed) choice.manualStowed = !choice.stowed;
      if (!e.dead) choice.settle = Math.max(0, choice.settle - Math.max(0, dt));
    }
    choice.manualBit = e.weaponStowed;
    // Death preserves the last carry; swimming/riding are handled by the shared overlay.
    if (!e.dead) choice.stowed = !combat && (choice.manualStowed ?? choice.settle === 0);
    return choice.stowed;
  }
}
