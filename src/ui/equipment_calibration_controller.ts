// Character-creator equipment fitting panel. It owns cold DOM and persistence;
// CharacterPreview supplies the live hand/armor-node transform adapter.

import { setRuntimeCarriedAttachmentFit } from '../render/characters/carried_attachment_fit';
import { setRuntimeHeldAttachmentFit } from '../render/characters/held_attachment_fit';
import { setRuntimeItemAttachmentFit } from '../render/characters/item_attachment_fit';
import { MESHY_TITAN_EQUIPMENT_FIT } from '../render/characters/meshy_titan_equipment_fit.generated';
import {
  cloneEquipmentCalibrationState,
  cloneEquipmentCalibrationTransform,
  EQUIPMENT_CALIBRATION_CARRY_TARGETS,
  EQUIPMENT_CALIBRATION_SLOTS,
  type EquipmentCalibrationAxis,
  type EquipmentCalibrationLocation,
  type EquipmentCalibrationMode,
  type EquipmentCalibrationSlot,
  type EquipmentCalibrationState,
  type EquipmentCalibrationTransform,
  equipmentCalibrationStorageKey,
  equipmentCalibrationTarget,
  normalizeEquipmentCalibrationTransform,
  parseEquipmentCalibrationState,
  serializeEquipmentCalibration,
  withEquipmentCalibrationAxis,
  withEquipmentCalibrationScale,
} from './equipment_calibration_core';
import { t } from './i18n';

export interface EquipmentCalibrationControllerDeps {
  /** Body whose held transforms are being authored. */
  visualKey?: string;
  /** Item-scoped save key; never replace the generic body profile. */
  fitKey?: string;
  loadouts?: readonly { id: string; label: string }[];
  selectedLoadout?: string;
  onLoadoutChange?(id: string): void | Promise<void>;
  /** Targets shown by this mode. The saved payload remains complete so old
   *  armor-fit data is not discarded while the weapon-only studio is open. */
  targets?: readonly EquipmentCalibrationSlot[];
  /** Optional fitting subjects rendered in the common tool strip. */
  subjects?: readonly { visualKey: string; label: string }[];
  selectedSubject?: string;
  onSubjectChange?(visualKey: string): void | Promise<void>;
  /** Reattach the visible weapons before applying the selected local-space fit. */
  setCarryLocation?(location: EquipmentCalibrationLocation): void;
  readDefault(slot: EquipmentCalibrationSlot): EquipmentCalibrationTransform | null;
  apply(slot: EquipmentCalibrationSlot, transform: EquipmentCalibrationTransform): boolean;
  readAnimationPaused(): boolean;
  setAnimationPaused(paused: boolean): void;
  /** Clips actually loaded on the selected fitting subject. */
  animationClips?: readonly string[];
  playAnimation?(clip: string): boolean;
  stopAnimation?(): void;
  setManipulator(
    slot: EquipmentCalibrationSlot,
    mode: Exclude<EquipmentCalibrationMode, 'scale'>,
    onChange: (transform: EquipmentCalibrationTransform) => void,
  ): boolean;
  clearManipulator(): void;
  saveToProject?(state: EquipmentCalibrationState): Promise<void>;
}

export interface EquipmentCalibrationController {
  activate(): void;
  destroy(): void;
}

type IconName =
  | 'sword'
  | 'shield'
  | 'helmet'
  | 'chest'
  | 'waist'
  | 'shoulder'
  | 'bracer'
  | 'glove'
  | 'leg'
  | 'foot'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'pause'
  | 'play'
  | 'stop'
  | 'reset'
  | 'copy'
  | 'save';

interface CalibrationTargetMeta {
  label: string;
  icon: IconName;
  badge?: 'L' | 'R';
}

const AXES = ['X', 'Y', 'Z'] as const;
const STORE_DELAY_MS = 160;
const SAVE_ENDPOINT = '/__equipment_calibration/save';
const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS: Record<IconName, readonly string[]> = {
  sword: ['M14 3l7 0-10 10-3-3z', 'M7 11l6 6', 'M5 15l4 4', 'M3 21l4-4'],
  shield: ['M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z'],
  helmet: ['M5 13a7 7 0 0114 0v7h-5v-5h-4v5H5z', 'M8 13h8'],
  chest: ['M8 4l4 2 4-2 4 5-3 2v9H7v-9L4 9z'],
  waist: ['M4 9h16v6H4z', 'M9 9v6m6-6v6'],
  shoulder: ['M4 15c1-6 4-9 8-9s7 3 8 9l-5 2-3-4-3 4z'],
  bracer: ['M8 4h8l2 16H6z', 'M7 9h10m-9 6h8'],
  glove: ['M7 20V9a2 2 0 014 0V5a2 2 0 014 0v7l2-2a2 2 0 013 3l-4 7z'],
  leg: ['M8 3h8l-1 8 2 10h-5l-1-7-1 7H5l2-10z'],
  foot: ['M7 4h7v10l6 3v3H5z'],
  move: [
    'M12 2v20M2 12h20',
    'M12 2l-3 3m3-3l3 3M22 12l-3-3m3 3l-3 3M12 22l-3-3m3 3l3-3M2 12l3-3m-3 3l3 3',
  ],
  rotate: ['M20 8V3l-2 2a8 8 0 10.5 13', 'M20 3h-5'],
  scale: ['M4 10V4h6M4 4l7 7', 'M20 14v6h-6m6 0l-7-7'],
  pause: ['M8 5v14M16 5v14'],
  play: ['M8 5l11 7-11 7z'],
  stop: ['M6 6h12v12H6z'],
  reset: ['M5 7V3m0 0h4M5 3l3 3', 'M5 4a9 9 0 11-1 12'],
  copy: ['M9 8h10v12H9z', 'M5 16H4V4h10v1'],
  save: ['M5 3h12l2 2v16H5z', 'M8 3v6h8V3M8 21v-7h8v7'],
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgIcon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ec-icon');
  for (const d of ICON_PATHS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function iconButton(
  className: string,
  label: string,
  icon: IconName,
  badge?: string,
): HTMLButtonElement {
  const button = element('button', className);
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.appendChild(svgIcon(icon));
  if (badge) button.appendChild(element('span', 'ec-icon-badge', badge));
  return button;
}

function numberText(value: number, digits: number): string {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function readStoredState(
  fallback: EquipmentCalibrationState,
  visualKey: string,
): EquipmentCalibrationState {
  try {
    return parseEquipmentCalibrationState(
      localStorage.getItem(equipmentCalibrationStorageKey(visualKey)),
      fallback,
    );
  } catch {
    return cloneEquipmentCalibrationState(fallback);
  }
}

export async function saveEquipmentCalibrationToProject(
  state: EquipmentCalibrationState,
  visualKey = 'player_meshy_titan',
): Promise<void> {
  const response = await fetch(SAVE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: serializeEquipmentCalibration(state, visualKey),
  });
  if (!response.ok) throw new Error(`Equipment fit save failed (${response.status})`);
}

function targetMeta(): Partial<Record<EquipmentCalibrationSlot, CalibrationTargetMeta>> {
  const left = t('auth.equipmentLeft');
  const right = t('auth.equipmentRight');
  const pair = (base: string, side: string, icon: IconName, badge: 'L' | 'R') => ({
    label: `${base} · ${side}`,
    icon,
    badge,
  });
  return {
    mainhand: { label: t('auth.equipmentSword'), icon: 'sword' },
    offhand: { label: t('auth.equipmentShield'), icon: 'shield' },
    Armor_valor_Head: { label: t('itemUi.slots.helmet'), icon: 'helmet' },
    Armor_valor_Chest: { label: t('itemUi.slots.chest'), icon: 'chest' },
    Armor_valor_Waist: { label: t('itemUi.slots.waist'), icon: 'waist' },
    Armor_valor_ShoulderL: pair(t('itemUi.slots.shoulder'), left, 'shoulder', 'L'),
    Armor_valor_ShoulderR: pair(t('itemUi.slots.shoulder'), right, 'shoulder', 'R'),
    Armor_valor_BracerL: pair(t('auth.equipmentBracer'), left, 'bracer', 'L'),
    Armor_valor_BracerR: pair(t('auth.equipmentBracer'), right, 'bracer', 'R'),
    Armor_valor_GloveL: pair(t('itemUi.slots.gloves'), left, 'glove', 'L'),
    Armor_valor_GloveR: pair(t('itemUi.slots.gloves'), right, 'glove', 'R'),
    Armor_valor_LegL: pair(t('itemUi.slots.legs'), left, 'leg', 'L'),
    Armor_valor_LegR: pair(t('itemUi.slots.legs'), right, 'leg', 'R'),
    Armor_valor_FootL: pair(t('itemUi.slots.feet'), left, 'foot', 'L'),
    Armor_valor_FootR: pair(t('itemUi.slots.feet'), right, 'foot', 'R'),
  };
}

export function mountEquipmentCalibrationController(
  host: HTMLElement,
  deps: EquipmentCalibrationControllerDeps,
): EquipmentCalibrationController {
  const visualKey = deps.fitKey ?? deps.visualKey ?? 'player_meshy_titan';
  const cleanups: Array<() => void> = [];
  const availableSlots: EquipmentCalibrationSlot[] = [];
  const availableCarryLocations = new Set<EquipmentCalibrationLocation>();
  const visibleTargets = new Set(deps.targets ?? EQUIPMENT_CALIBRATION_SLOTS);
  const defaults = Object.fromEntries(
    EQUIPMENT_CALIBRATION_SLOTS.map((slot) => {
      const live = deps.readDefault(slot);
      const isCarry = EQUIPMENT_CALIBRATION_CARRY_TARGETS.some((target) => target === slot);
      if (live && isCarry) availableCarryLocations.add(slot.endsWith('_hip') ? 'hip' : 'back');
      if (live && !isCarry && visibleTargets.has(slot)) availableSlots.push(slot);
      // A different armor set has no legacy fit proxies. Keep its predecessor's
      // baseline in the complete save payload while editing the available weapons.
      const fallbackSlot = slot.startsWith('mainhand_')
        ? 'mainhand'
        : slot.startsWith('offhand_')
          ? 'offhand'
          : slot;
      const transform =
        live ?? MESHY_TITAN_EQUIPMENT_FIT[fallbackSlot as keyof typeof MESHY_TITAN_EQUIPMENT_FIT];
      return [
        slot,
        {
          position: [...transform.position],
          rotationDeg: [...transform.rotationDeg],
          scale: transform.scale,
        },
      ];
    }),
  ) as EquipmentCalibrationState;
  const state = readStoredState(defaults, visualKey);
  let selectedSlot: EquipmentCalibrationSlot = availableSlots[0] ?? 'mainhand';
  let selectedLocation: EquipmentCalibrationLocation = 'hand';
  let selectedMode: EquipmentCalibrationMode = 'position';
  let animationPaused = deps.readAnimationPaused();
  let selectedAnimation = deps.animationClips?.[0] ?? '';
  let storeTimer: number | null = null;
  let destroyed = false;

  host.textContent = '';
  host.classList.add('equipment-calibration');

  const on = <K extends keyof HTMLElementEventMap>(
    node: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
  ): void => {
    node.addEventListener(type, listener as EventListener);
    cleanups.push(() => node.removeEventListener(type, listener as EventListener));
  };

  const header = element('div', 'ec-head');
  header.appendChild(element('div', 'ec-title', t('auth.equipmentCalibration')));
  header.appendChild(element('p', 'ec-hint', t('auth.equipmentCalibrationHint')));
  host.appendChild(header);

  const slotRail = element('div', 'ec-tab-rail');
  slotRail.setAttribute('role', 'tablist');
  slotRail.setAttribute('aria-label', t('auth.equipmentCalibrationItem'));
  const slotButtons = new Map<EquipmentCalibrationSlot, HTMLButtonElement>();
  const metas = targetMeta();
  for (const slot of availableSlots) {
    const meta = metas[slot];
    if (!meta) continue;
    const button = iconButton('ec-tab', meta.label, meta.icon, meta.badge);
    button.setAttribute('role', 'tab');
    on(button, 'click', () => {
      selectedSlot = slot;
      syncManipulator();
      syncControls();
    });
    slotButtons.set(slot, button);
    slotRail.appendChild(button);
  }
  host.appendChild(slotRail);

  const toolbar = element('div', 'ec-toolbar');
  if (deps.loadouts?.length && deps.onLoadoutChange) {
    const control = element('label', 'ec-subject-control');
    control.appendChild(element('span', 'ec-subject-label', t('itemUi.slots.mainhand')));
    const select = element('select', 'auth-input ec-subject-select ec-loadout-select');
    select.setAttribute('aria-label', t('itemUi.slots.mainhand'));
    for (const loadout of deps.loadouts) {
      const option = element('option', undefined, loadout.label);
      option.value = loadout.id;
      option.selected = loadout.id === deps.selectedLoadout;
      select.appendChild(option);
    }
    on(select, 'change', () => {
      select.disabled = true;
      void Promise.resolve(deps.onLoadoutChange?.(select.value)).catch((error: unknown) => {
        select.disabled = false;
        console.warn('Weapon editor could not switch loadout:', error);
      });
    });
    control.appendChild(select);
    toolbar.appendChild(control);
  }
  let locationSelect: HTMLSelectElement | undefined;
  if (deps.setCarryLocation) {
    const control = element('label', 'ec-subject-control');
    control.appendChild(element('span', 'ec-subject-label', t('auth.equipmentCarryLocation')));
    locationSelect = element('select', 'auth-input ec-subject-select ec-carry-select');
    locationSelect.setAttribute('aria-label', t('auth.equipmentCarryLocation'));
    for (const [location, label] of [
      ['hand', t('auth.equipmentInHands')],
      ['hip', t('auth.equipmentAtBelt')],
      ['back', t('auth.equipmentOnBack')],
    ] as const) {
      const option = element('option', undefined, label);
      option.value = location;
      option.disabled = location !== 'hand' && !availableCarryLocations.has(location);
      locationSelect.appendChild(option);
    }
    const select = locationSelect;
    on(select, 'change', () => {
      deps.clearManipulator();
      selectedLocation = select.value as EquipmentCalibrationLocation;
      deps.setCarryLocation?.(selectedLocation);
      applyVisibleWeapons();
      syncControls();
      syncManipulator();
    });
    control.appendChild(select);
    toolbar.appendChild(control);
  }
  if (deps.subjects?.length && deps.onSubjectChange) {
    const subjectControl = element('label', 'ec-subject-control');
    subjectControl.appendChild(element('span', 'ec-subject-label', 'Model'));
    const subjectSelect = element('select', 'auth-input ec-subject-select');
    subjectSelect.setAttribute('aria-label', 'Model');
    for (const subject of deps.subjects) {
      const option = element('option');
      option.value = subject.visualKey;
      option.textContent = subject.label;
      option.selected = subject.visualKey === deps.selectedSubject;
      subjectSelect.appendChild(option);
    }
    on(subjectSelect, 'change', () => {
      subjectSelect.disabled = true;
      void Promise.resolve(deps.onSubjectChange?.(subjectSelect.value)).catch((error: unknown) => {
        subjectSelect.disabled = false;
        console.warn(`Weapon editor could not load ${subjectSelect.value}:`, error);
      });
    });
    subjectControl.appendChild(subjectSelect);
    toolbar.appendChild(subjectControl);
  }
  const modeRail = element('div', 'ec-mode-rail');
  modeRail.setAttribute('role', 'tablist');
  modeRail.setAttribute('aria-label', t('auth.equipmentCalibrationMode'));
  const modeButtons = new Map<EquipmentCalibrationMode, HTMLButtonElement>();
  const modeLabels: Record<EquipmentCalibrationMode, string> = {
    position: t('auth.equipmentPosition'),
    rotation: t('auth.equipmentRotation'),
    scale: t('auth.equipmentScale'),
  };
  const modeIcons: Record<EquipmentCalibrationMode, IconName> = {
    position: 'move',
    rotation: 'rotate',
    scale: 'scale',
  };
  for (const mode of ['position', 'rotation', 'scale'] as const) {
    const button = iconButton('ec-mode', modeLabels[mode], modeIcons[mode]);
    button.setAttribute('role', 'tab');
    on(button, 'click', () => {
      selectedMode = mode;
      syncManipulator();
      syncControls();
    });
    modeButtons.set(mode, button);
    modeRail.appendChild(button);
  }
  toolbar.appendChild(modeRail);

  const animationToggle = iconButton(
    'ec-animation-toggle',
    t('auth.equipmentPauseAnimation'),
    'pause',
  );
  on(animationToggle, 'click', () => {
    animationPaused = !animationPaused;
    deps.setAnimationPaused(animationPaused);
    syncControls();
  });
  toolbar.appendChild(animationToggle);
  host.appendChild(toolbar);

  if (deps.animationClips?.length && deps.playAnimation && deps.stopAnimation) {
    const animationControl = element('div', 'ec-clip-control');
    animationControl.appendChild(element('label', 'ec-subject-label', 'Animation'));
    const animationSelect = element('select', 'auth-input ec-clip-select');
    animationSelect.setAttribute('aria-label', 'Animation');
    for (const clip of deps.animationClips) {
      const option = element('option');
      option.value = clip;
      option.textContent = clip;
      animationSelect.appendChild(option);
    }
    on(animationSelect, 'change', () => {
      selectedAnimation = animationSelect.value;
    });
    const play = iconButton('ec-clip-button', 'Play animation', 'play');
    const stop = iconButton('ec-clip-button', 'Stop animation', 'stop');
    on(play, 'click', () => {
      if (!deps.playAnimation?.(selectedAnimation))
        status.textContent = 'Animation is unavailable.';
      else {
        animationPaused = false;
        deps.setAnimationPaused(false);
        status.textContent = '';
        syncControls();
      }
    });
    on(stop, 'click', () => {
      deps.stopAnimation?.();
      animationPaused = false;
      deps.setAnimationPaused(false);
      status.textContent = '';
      syncControls();
    });
    animationControl.append(animationSelect, play, stop);
    host.appendChild(animationControl);
  }

  const controls = element('div', 'ec-controls');
  host.appendChild(controls);

  interface AxisInputPair {
    range: HTMLInputElement;
    number: HTMLInputElement;
  }
  const positionInputs: AxisInputPair[] = [];
  const rotationInputs: AxisInputPair[] = [];

  function buildVectorControls(
    mode: Exclude<EquipmentCalibrationMode, 'scale'>,
    min: number,
    max: number,
    step: number,
  ): { root: HTMLDivElement; inputs: AxisInputPair[] } {
    const root = element('div', 'ec-vector');
    const inputs: AxisInputPair[] = [];
    AXES.forEach((axisName, axis) => {
      const row = element('label', 'ec-axis-row');
      const label = element('span', 'ec-axis-label', axisName);
      const range = element('input', 'ec-range');
      range.type = 'range';
      range.min = String(min);
      range.max = String(max);
      range.step = String(step);
      const number = element('input', 'ec-number');
      number.type = 'number';
      number.min = String(min);
      number.max = String(max);
      number.step = String(step);
      const accessibleName = t('auth.equipmentCalibrationAxis', {
        field: modeLabels[mode],
        axis: axisName,
      });
      range.setAttribute('aria-label', accessibleName);
      number.setAttribute('aria-label', accessibleName);
      const update = (value: string): void => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return;
        const target = activeTarget();
        state[target] = withEquipmentCalibrationAxis(
          state[target],
          mode,
          axis as EquipmentCalibrationAxis,
          parsed,
        );
        deps.apply(target, state[target]);
        syncControls();
        scheduleStore();
      };
      on(range, 'input', () => update(range.value));
      on(number, 'input', () => update(number.value));
      row.append(label, range, number);
      root.appendChild(row);
      inputs.push({ range, number });
    });
    return { root, inputs };
  }

  const position = buildVectorControls('position', -1.5, 1.5, 0.005);
  positionInputs.push(...position.inputs);
  controls.appendChild(position.root);

  const rotation = buildVectorControls('rotation', -180, 180, 1);
  rotationInputs.push(...rotation.inputs);
  controls.appendChild(rotation.root);

  const scaleRoot = element('div', 'ec-scale');
  const scaleRow = element('label', 'ec-axis-row');
  scaleRow.appendChild(element('span', 'ec-axis-label', t('auth.equipmentScale')));
  const scaleRange = element('input', 'ec-range');
  scaleRange.type = 'range';
  scaleRange.min = '0.1';
  scaleRange.max = '2';
  scaleRange.step = '0.005';
  scaleRange.setAttribute('aria-label', t('auth.equipmentScale'));
  const scaleNumber = element('input', 'ec-number');
  scaleNumber.type = 'number';
  scaleNumber.min = '0.01';
  scaleNumber.max = '10';
  scaleNumber.step = '0.005';
  scaleNumber.setAttribute('aria-label', t('auth.equipmentScale'));
  const updateScale = (value: string): void => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const target = activeTarget();
    state[target] = withEquipmentCalibrationScale(state[target], parsed);
    deps.apply(target, state[target]);
    syncControls();
    scheduleStore();
  };
  on(scaleRange, 'input', () => updateScale(scaleRange.value));
  on(scaleNumber, 'input', () => updateScale(scaleNumber.value));
  scaleRow.append(scaleRange, scaleNumber);
  scaleRoot.appendChild(scaleRow);
  controls.appendChild(scaleRoot);

  const outputDetails = element('details', 'ec-output-details');
  outputDetails.appendChild(
    element('summary', 'ec-output-summary', t('auth.equipmentCalibrationValues')),
  );
  const output = element('textarea', 'ec-output');
  output.readOnly = true;
  output.spellcheck = false;
  output.rows = 7;
  output.setAttribute('aria-label', t('auth.equipmentCalibrationValues'));
  outputDetails.appendChild(output);
  host.appendChild(outputDetails);

  const actions = element('div', 'ec-actions');
  const reset = iconButton('ec-action', t('auth.equipmentResetItem'), 'reset');
  const copy = iconButton('ec-action', t('auth.equipmentCopyValues'), 'copy');
  const save = iconButton('ec-action ec-save', t('auth.equipmentSaveProject'), 'save');
  const status = element('div', 'ec-status');
  status.setAttribute('aria-live', 'polite');
  actions.append(reset, copy, save);
  host.append(actions, status);

  function persist(): void {
    if (storeTimer !== null) {
      window.clearTimeout(storeTimer);
      storeTimer = null;
    }
    // Preview-only bodies (unarmed or baked-in weapons) have no fit to save.
    if (availableSlots.length === 0) return;
    try {
      localStorage.setItem(
        equipmentCalibrationStorageKey(visualKey),
        serializeEquipmentCalibration(state, visualKey),
      );
    } catch {
      // Storage can be unavailable in private mode. The live fit remains valid.
    }
    // Keep the same state for visuals assembled after leaving the editor.
    if (deps.fitKey) setRuntimeItemAttachmentFit(visualKey, state);
    else {
      setRuntimeHeldAttachmentFit(visualKey, state);
      setRuntimeCarriedAttachmentFit(visualKey, state);
    }
  }

  function scheduleStore(): void {
    if (storeTimer !== null) window.clearTimeout(storeTimer);
    storeTimer = window.setTimeout(persist, STORE_DELAY_MS);
  }

  function activeTarget(slot = selectedSlot): EquipmentCalibrationSlot {
    return slot === 'mainhand' || slot === 'offhand'
      ? equipmentCalibrationTarget(slot, selectedLocation)
      : slot;
  }

  function applyVisibleWeapons(): void {
    for (const slot of availableSlots) {
      if (slot !== 'mainhand' && slot !== 'offhand') continue;
      const target = activeTarget(slot);
      deps.apply(target, state[target]);
    }
  }

  function syncManipulator(): void {
    if (selectedMode === 'scale' || !availableSlots.includes(selectedSlot)) {
      deps.clearManipulator();
      return;
    }
    const slot = activeTarget();
    deps.setManipulator(slot, selectedMode, (transform) => {
      if (destroyed || slot !== activeTarget()) return;
      state[slot] = normalizeEquipmentCalibrationTransform(transform, state[slot]);
      deps.apply(slot, state[slot]);
      syncControls();
      scheduleStore();
    });
  }

  function syncControls(): void {
    for (const [slot, button] of slotButtons) {
      const selected = slot === selectedSlot;
      button.classList.toggle('sel', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    for (const [mode, button] of modeButtons) {
      const selected = mode === selectedMode;
      button.classList.toggle('sel', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    position.root.hidden = selectedMode !== 'position';
    rotation.root.hidden = selectedMode !== 'rotation';
    scaleRoot.hidden = selectedMode !== 'scale';

    if (locationSelect) locationSelect.value = selectedLocation;
    const transform = state[activeTarget()];
    positionInputs.forEach((pair, axis) => {
      const value = numberText(transform.position[axis], 4);
      pair.range.value = value;
      pair.number.value = value;
    });
    rotationInputs.forEach((pair, axis) => {
      const value = numberText(transform.rotationDeg[axis], 3);
      pair.range.value = value;
      pair.number.value = value;
    });
    const scale = numberText(transform.scale, 4);
    scaleRange.value = scale;
    scaleNumber.value = scale;
    const animationLabel = t(
      animationPaused ? 'auth.equipmentResumeAnimation' : 'auth.equipmentPauseAnimation',
    );
    animationToggle.title = animationLabel;
    animationToggle.setAttribute('aria-label', animationLabel);
    animationToggle.setAttribute('aria-pressed', animationPaused ? 'true' : 'false');
    animationToggle.replaceChildren(svgIcon(animationPaused ? 'play' : 'pause'));
    output.value = serializeEquipmentCalibration(state, visualKey);
  }

  on(reset, 'click', () => {
    const target = activeTarget();
    state[target] = cloneEquipmentCalibrationTransform(defaults[target]);
    deps.apply(target, state[target]);
    status.textContent = '';
    syncControls();
    persist();
  });

  on(copy, 'click', () => {
    persist();
    const text = serializeEquipmentCalibration(state, visualKey);
    const manual = (): void => {
      outputDetails.open = true;
      output.focus();
      output.select();
      status.textContent = t('auth.equipmentCopyManual');
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        status.textContent = t('auth.equipmentValuesCopied');
      }, manual);
    } else {
      manual();
    }
  });

  on(save, 'click', () => {
    persist();
    save.disabled = true;
    save.setAttribute('aria-busy', 'true');
    const saveToProject =
      deps.saveToProject ?? ((value) => saveEquipmentCalibrationToProject(value, visualKey));
    void saveToProject(cloneEquipmentCalibrationState(state))
      .then(
        () => {
          status.textContent = t('auth.equipmentSavedProject');
        },
        () => {
          status.textContent = t('auth.equipmentSaveFailed');
        },
      )
      .finally(() => {
        save.disabled = false;
        save.removeAttribute('aria-busy');
      });
  });

  const flush = (): void => persist();
  window.addEventListener('pagehide', flush);
  cleanups.push(() => window.removeEventListener('pagehide', flush));

  deps.setCarryLocation?.(selectedLocation);
  const hasEditableEquipment = availableSlots.length > 0;
  controls.hidden = !hasEditableEquipment;
  modeRail.hidden = !hasEditableEquipment;
  actions.hidden = !hasEditableEquipment;
  outputDetails.hidden = !hasEditableEquipment;
  if (locationSelect) locationSelect.disabled = !hasEditableEquipment;
  reset.disabled = copy.disabled = save.disabled = !hasEditableEquipment;
  for (const slot of availableSlots) {
    const target = activeTarget(slot);
    deps.apply(target, state[target]);
  }
  syncManipulator();
  syncControls();

  return {
    activate(): void {
      animationPaused = deps.readAnimationPaused();
      deps.clearManipulator();
      deps.setCarryLocation?.(selectedLocation);
      for (const slot of availableSlots) deps.apply(activeTarget(slot), state[activeTarget(slot)]);
      syncManipulator();
      syncControls();
    },
    destroy(): void {
      destroyed = true;
      persist();
      deps.clearManipulator();
      for (const cleanup of cleanups) cleanup();
      host.classList.remove('equipment-calibration');
      host.textContent = '';
    },
  };
}
