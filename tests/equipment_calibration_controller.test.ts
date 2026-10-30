// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { MESHY_TITAN_EQUIPMENT_FIT } from '../src/render/characters/meshy_titan_equipment_fit.generated';
import {
  type EquipmentCalibrationControllerDeps,
  mountEquipmentCalibrationController,
} from '../src/ui/equipment_calibration_controller';
import {
  EQUIPMENT_CALIBRATION_ARMOR_TARGETS,
  EQUIPMENT_CALIBRATION_STORAGE_KEY,
  EQUIPMENT_CALIBRATION_TARGETS,
  type EquipmentCalibrationLocation,
  type EquipmentCalibrationMode,
  type EquipmentCalibrationSlot,
  type EquipmentCalibrationState,
  type EquipmentCalibrationTransform,
  WEAPON_CALIBRATION_TARGETS,
} from '../src/ui/equipment_calibration_core';

const IDENTITY: EquipmentCalibrationTransform = {
  position: [0, 0, 0],
  rotationDeg: [0, 0, 0],
  scale: 1,
};
const DEFAULTS = Object.fromEntries(
  EQUIPMENT_CALIBRATION_TARGETS.map((target) => [target, structuredClone(IDENTITY)]),
) as EquipmentCalibrationState;
DEFAULTS.mainhand = { position: [0, 0.4, 0], rotationDeg: [0, 0, 180], scale: 0.58 };
DEFAULTS.offhand = { position: [0, 0, 0.2], rotationDeg: [-135, 0, 180], scale: 0.52 };

afterEach(() => {
  document.body.textContent = '';
  localStorage.removeItem(EQUIPMENT_CALIBRATION_STORAGE_KEY);
});

function mount(
  weaponsOnly = false,
  explicitTargets = false,
  carry = false,
  extra: Partial<EquipmentCalibrationControllerDeps> = {},
) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const applied: Array<[EquipmentCalibrationSlot, EquipmentCalibrationTransform]> = [];
  const pauseChanges: boolean[] = [];
  const saved: EquipmentCalibrationState[] = [];
  const carryChanges: EquipmentCalibrationLocation[] = [];
  const events: string[] = [];
  let animationPaused = false;
  let manipulator: {
    slot: EquipmentCalibrationSlot;
    mode: Exclude<EquipmentCalibrationMode, 'scale'>;
    onChange: (transform: EquipmentCalibrationTransform) => void;
  } | null = null;
  let manipulatorClears = 0;
  const controller = mountEquipmentCalibrationController(host, {
    targets: explicitTargets ? WEAPON_CALIBRATION_TARGETS : undefined,
    setCarryLocation: carry
      ? (location) => {
          events.push(`carry:${location}`);
          carryChanges.push(location);
        }
      : undefined,
    readDefault: (slot) =>
      weaponsOnly && slot !== 'mainhand' && slot !== 'offhand' ? null : DEFAULTS[slot],
    apply: (slot, transform) => {
      events.push(`apply:${slot}`);
      applied.push([slot, structuredClone(transform)]);
      return true;
    },
    readAnimationPaused: () => animationPaused,
    setAnimationPaused: (paused) => {
      animationPaused = paused;
      pauseChanges.push(paused);
    },
    setManipulator: (slot, mode, onChange) => {
      manipulator = { slot, mode, onChange };
      return true;
    },
    clearManipulator: () => {
      events.push('clear');
      manipulator = null;
      manipulatorClears += 1;
    },
    saveToProject: async (state) => {
      saved.push(structuredClone(state));
    },
    ...extra,
  });
  return {
    host,
    controller,
    applied,
    pauseChanges,
    saved,
    carryChanges,
    events,
    manipulator: () => manipulator,
    manipulatorClears: () => manipulatorClears,
    setPaused: (paused: boolean) => {
      animationPaused = paused;
    },
  };
}

function button(host: HTMLElement, label: string): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

describe('equipment calibration controller', () => {
  it('keeps unarmed or baked-weapon subjects preview-only without saving fake hand defaults', () => {
    const key = 'npc_dev_treant_v2';
    const f = mount(false, true, false, { visualKey: key, readDefault: () => null });
    expect(f.host.querySelector<HTMLElement>('.ec-controls')?.hidden).toBe(true);
    expect(f.host.querySelector<HTMLElement>('.ec-actions')?.hidden).toBe(true);
    expect(f.host.querySelector<HTMLButtonElement>('.ec-save')?.disabled).toBe(true);
    expect(f.host.querySelector<HTMLButtonElement>('.ec-animation-toggle')?.disabled).toBe(false);
    f.controller.destroy();
    expect(localStorage.getItem(`woc.equipmentCalibration.${key}.v2`)).toBeNull();
  });
  it('offers loadout choices and detaches obsolete gizmo callbacks on teardown', async () => {
    const changes: string[] = [];
    const f = mount(false, true, true, {
      loadouts: [
        { id: 'starter', label: 'Sword + Shield' },
        { id: 'claymore', label: 'Eastbrook Greatsword' },
      ],
      selectedLoadout: 'starter',
      onLoadoutChange: async (id) => {
        changes.push(id);
      },
    });
    const select = f.host.querySelector<HTMLSelectElement>('.ec-loadout-select');
    if (!select) throw new Error('loadout selector missing');
    expect([...select.options].map((option) => option.value)).toEqual(['starter', 'claymore']);
    select.value = 'claymore';
    select.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(changes).toEqual(['claymore']);
    const staleGizmo = f.manipulator();
    f.controller.destroy();
    const applied = f.applied.length;
    staleGizmo?.onChange({ ...IDENTITY, scale: 0.72 });
    expect(f.applied).toHaveLength(applied);
  });
  it('restores the selected carry profile when a shared preview is reactivated', () => {
    const { host, controller, applied, carryChanges } = mount(false, true, true);
    const select = host.querySelector<HTMLSelectElement>('.ec-carry-select')!;
    select.value = 'hip';
    select.dispatchEvent(new Event('change'));
    const input = host.querySelector<HTMLInputElement>('.ec-number')!;
    input.value = '0.42';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    applied.length = 0;
    controller.activate();
    expect(carryChanges.at(-1)).toBe('hip');
    expect(applied.map(([slot]) => slot)).toEqual(['mainhand_hip', 'offhand_hip']);
    expect(applied[0][1].position[0]).toBe(0.42);
    controller.destroy();
  });
  it('only exposes carry location selection when its live adapter is supplied', () => {
    const plain = mount(false, true);
    expect(plain.host.querySelector('.ec-carry-select')).toBeNull();
    plain.controller.destroy();
    const carried = mount(false, true, true);
    const select = carried.host.querySelector<HTMLSelectElement>('.ec-carry-select');
    expect([...(select?.options ?? [])].map((option) => option.value)).toEqual([
      'hand',
      'hip',
      'back',
    ]);
    expect(select?.getAttribute('aria-label')).toBe('Equipment location');
    expect(carried.host.querySelectorAll('.ec-tab')).toHaveLength(2);
    expect(carried.applied.map(([slot]) => slot)).toEqual(['mainhand', 'offhand']);
    carried.controller.destroy();
  });

  it('edits, resets, copies, saves and restores independent hand, belt and back profiles', async () => {
    const current = mount(false, true, true);
    const { host, controller, applied, events, manipulator, saved } = current;
    const select = host.querySelector<HTMLSelectElement>('.ec-carry-select');
    const position = host.querySelector<HTMLInputElement>('.ec-number');
    if (!select || !position) throw new Error('carry controls missing');
    const location = (value: EquipmentCalibrationLocation): void => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const move = (value: number): void => {
      position.value = String(value);
      position.dispatchEvent(new Event('input', { bubbles: true }));
    };

    move(0.11);
    const oldGizmo = manipulator();
    events.length = 0;
    location('hip');
    expect(events.slice(0, 4)).toEqual([
      'clear',
      'carry:hip',
      'apply:mainhand_hip',
      'apply:offhand_hip',
    ]);
    expect(manipulator()).toMatchObject({ slot: 'mainhand_hip', mode: 'position' });
    expect(position.value).toBe('0');
    oldGizmo?.onChange({ ...IDENTITY, position: [4, 4, 4] });
    move(0.22);
    button(host, 'Shield')?.click();
    move(0.33);
    expect(applied.at(-1)?.[0]).toBe('offhand_hip');
    button(host, 'Sword')?.click();
    location('back');
    manipulator()?.onChange({ ...IDENTITY, position: [0.44, 0, 0] });
    expect(position.value).toBe('0.44');
    location('hip');
    expect(position.value).toBe('0.22');
    button(host, 'Reset item')?.click();
    expect(applied.at(-1)).toEqual(['mainhand_hip', DEFAULTS.mainhand_hip]);

    button(host, 'Copy values')?.click();
    const output = JSON.parse(host.querySelector<HTMLTextAreaElement>('.ec-output')?.value ?? '{}');
    expect(output.transforms.mainhand.position[0]).toBe(0.11);
    expect(output.transforms.mainhand_hip.position[0]).toBe(0);
    expect(output.transforms.offhand_hip.position[0]).toBe(0.33);
    expect(output.transforms.mainhand_back.position[0]).toBe(0.44);
    expect(JSON.parse(localStorage.getItem(EQUIPMENT_CALIBRATION_STORAGE_KEY) ?? '{}')).toEqual(
      output,
    );
    button(host, 'Save fit to project')?.click();
    await Promise.resolve();
    expect(saved[0].mainhand_back.position[0]).toBe(0.44);
    expect(saved[0].offhand_hip.position[0]).toBe(0.33);
    controller.destroy();

    const restored = mount(false, true, true);
    const restoredSelect = restored.host.querySelector<HTMLSelectElement>('.ec-carry-select');
    if (!restoredSelect) throw new Error('restored carry controls missing');
    expect(restored.applied.map(([slot]) => slot)).toEqual(['mainhand', 'offhand']);
    restoredSelect.value = 'back';
    restoredSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(restored.applied.at(-2)).toEqual([
      'mainhand_back',
      { ...IDENTITY, position: [0.44, 0, 0] },
    ]);
    restored.controller.destroy();
  });

  it('can expose a weapon-only studio while retaining live armor defaults', () => {
    const { host, controller, applied } = mount(false, true);
    expect(host.querySelectorAll('.ec-tab')).toHaveLength(2);
    expect(applied.map(([slot]) => slot)).toEqual(WEAPON_CALIBRATION_TARGETS);
    controller.destroy();
  });

  it('keeps model selection in the common tool strip and delegates changes', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const changes: string[] = [];
    const controller = mountEquipmentCalibrationController(host, {
      visualKey: 'npc_dev_rogue_minion',
      targets: WEAPON_CALIBRATION_TARGETS,
      subjects: [
        { visualKey: 'npc_dev_rogue_minion', label: 'Rogue Minion' },
        { visualKey: 'npc_dev_skeleton_warrior', label: 'Skeleton Warrior' },
      ],
      selectedSubject: 'npc_dev_rogue_minion',
      onSubjectChange: async (visualKey) => {
        changes.push(visualKey);
      },
      readDefault: (slot) => DEFAULTS[slot],
      apply: () => true,
      readAnimationPaused: () => false,
      setAnimationPaused: () => undefined,
      setManipulator: () => true,
      clearManipulator: () => undefined,
    });
    const select = host.querySelector<HTMLSelectElement>('.ec-toolbar .ec-subject-select');
    expect(select?.value).toBe('npc_dev_rogue_minion');
    if (!select) throw new Error('model select missing');
    select.value = 'npc_dev_skeleton_warrior';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(changes).toEqual(['npc_dev_skeleton_warrior']);
    controller.destroy();
  });

  it('hides unavailable armor controls and preserves their baseline when saving weapons', async () => {
    const { host, controller, applied, saved } = mount(true);
    expect(host.querySelectorAll('.ec-tab')).toHaveLength(2);
    expect(button(host, 'Chest')).toBeNull();
    expect(applied.map(([slot]) => slot)).toEqual(['mainhand', 'offhand']);
    const positionNumber = host.querySelector<HTMLInputElement>('.ec-number');
    if (!positionNumber) throw new Error('position input missing');
    positionNumber.value = '0.375';
    positionNumber.dispatchEvent(new Event('input', { bubbles: true }));
    button(host, 'Save fit to project')?.click();
    await Promise.resolve();
    expect(saved[0].mainhand.position[0]).toBe(0.375);
    for (const target of EQUIPMENT_CALIBRATION_ARMOR_TARGETS) {
      expect(saved[0][target]).toEqual(MESHY_TITAN_EQUIPMENT_FIT[target]);
    }
    controller.destroy();
    const restored = mount(true);
    expect(restored.applied[0][1].position[0]).toBe(0.375);
    restored.controller.destroy();
  });

  it('applies all 15 saved targets and edits an armor segment live', () => {
    const { host, controller, applied } = mount();
    expect(applied.slice(0, 15).map(([slot]) => slot)).toEqual(
      EQUIPMENT_CALIBRATION_TARGETS.slice(0, 15),
    );
    expect(host.querySelectorAll('.ec-tab')).toHaveLength(15);

    button(host, 'Chest')?.click();
    button(host, 'Rotation')?.click();

    const rotationNumbers = host
      .querySelectorAll<HTMLInputElement>('.ec-vector')[1]
      .querySelectorAll<HTMLInputElement>('.ec-number');
    rotationNumbers[1].value = '27';
    rotationNumbers[1].dispatchEvent(new Event('input', { bubbles: true }));

    const [slot, transform] = applied.at(-1) ?? [];
    expect(slot).toBe('Armor_valor_Chest');
    expect(transform?.rotationDeg).toEqual([0, 27, 0]);
    const exported = JSON.parse(
      host.querySelector<HTMLTextAreaElement>('.ec-output')?.value ?? '{}',
    );
    expect(exported.transforms.Armor_valor_Chest.space).toBe('skinned-node-local');
    expect(exported.transforms.Armor_valor_Chest.rotationDeg).toEqual([0, 27, 0]);
    controller.destroy();
  });

  it('flushes the numeric draft and restores it on the next mount', () => {
    const first = mount();
    const positionNumber = first.host.querySelector<HTMLInputElement>('.ec-number');
    if (!positionNumber) throw new Error('position input missing');
    positionNumber.value = '0.375';
    positionNumber.dispatchEvent(new Event('input', { bubbles: true }));
    first.controller.destroy();

    expect(localStorage.getItem(EQUIPMENT_CALIBRATION_STORAGE_KEY)).toContain('0.375');
    const second = mount();
    expect(second.applied[0][1].position[0]).toBe(0.375);
    second.controller.destroy();
  });

  it('resets only the selected item to the captured shipped transform', () => {
    const { host, controller, applied } = mount();
    const positionNumber = host.querySelector<HTMLInputElement>('.ec-number');
    if (!positionNumber) throw new Error('position input missing');
    positionNumber.value = '0.8';
    positionNumber.dispatchEvent(new Event('input', { bubbles: true }));
    button(host, 'Reset item')?.click();

    expect(applied.at(-1)).toEqual(['mainhand', DEFAULTS.mainhand]);
    controller.destroy();
  });

  it('uses icon-only controls with accessible labels and refreshes the animation toggle', () => {
    const { host, controller, pauseChanges, setPaused } = mount();
    const toggle = button(host, 'Pause animation');
    expect(toggle?.textContent).toBe('');
    expect(toggle?.querySelector('svg')).not.toBeNull();
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');

    toggle?.click();
    expect(pauseChanges).toEqual([true]);
    expect(toggle?.getAttribute('aria-label')).toBe('Resume animation');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');

    setPaused(false);
    controller.activate();
    expect(toggle?.getAttribute('aria-label')).toBe('Pause animation');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    controller.destroy();
  });

  it('lists loaded clips and plays or stops the selected animation', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const played: string[] = [];
    let stopped = 0;
    const controller = mountEquipmentCalibrationController(host, {
      targets: WEAPON_CALIBRATION_TARGETS,
      animationClips: ['Idle', 'Attack', 'Cast'],
      playAnimation: (clip) => {
        played.push(clip);
        return true;
      },
      stopAnimation: () => {
        stopped += 1;
      },
      readDefault: (slot) => DEFAULTS[slot],
      apply: () => true,
      readAnimationPaused: () => false,
      setAnimationPaused: () => undefined,
      setManipulator: () => true,
      clearManipulator: () => undefined,
    });
    const select = host.querySelector<HTMLSelectElement>('.ec-clip-select');
    expect([...(select?.options ?? [])].map((option) => option.value)).toEqual([
      'Idle',
      'Attack',
      'Cast',
    ]);
    if (!select) throw new Error('animation select missing');
    select.value = 'Cast';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    button(host, 'Play animation')?.click();
    button(host, 'Stop animation')?.click();
    expect(played).toEqual(['Cast']);
    expect(stopped).toBe(1);
    controller.destroy();
  });

  it('binds the mouse gizmo to armor targets and mirrors drag values into the export', () => {
    const { host, controller, applied, manipulator, manipulatorClears } = mount();
    expect(manipulator()).toMatchObject({ slot: 'mainhand', mode: 'position' });

    button(host, 'Shoulder · Left')?.click();
    button(host, 'Rotation')?.click();
    expect(manipulator()).toMatchObject({ slot: 'Armor_valor_ShoulderL', mode: 'rotation' });

    manipulator()?.onChange({
      position: [-0.1234567, 0.2, 0.3],
      rotationDeg: [-135, 4.5678912, 90],
      scale: 0.310128,
    });
    expect(applied.at(-1)).toEqual([
      'Armor_valor_ShoulderL',
      {
        position: [-0.123457, 0.2, 0.3],
        rotationDeg: [-135, 4.567891, 90],
        scale: 0.310128,
      },
    ]);

    button(host, 'Scale')?.click();
    expect(manipulator()).toBeNull();
    expect(manipulatorClears()).toBe(1);
    controller.destroy();
  });

  it('saves the complete fit through the injected project writer', async () => {
    const { host, controller, saved } = mount();
    button(host, 'Chest')?.click();
    const positionNumber = host.querySelector<HTMLInputElement>('.ec-number');
    if (!positionNumber) throw new Error('position input missing');
    positionNumber.value = '0.125';
    positionNumber.dispatchEvent(new Event('input', { bubbles: true }));

    button(host, 'Save fit to project')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(saved).toHaveLength(1);
    expect(saved[0].Armor_valor_Chest.position[0]).toBe(0.125);
    expect(host.querySelector('.ec-status')?.textContent).toBe('Fit saved to the project.');
    controller.destroy();
  });
});
