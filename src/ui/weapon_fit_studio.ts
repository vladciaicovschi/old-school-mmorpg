// Cold weapon-fit composition, extracted from main so loadout switching and
// asynchronous rebuild ownership have one home outside the client bootstrap.
import {
  itemEquipmentFitKey,
  MOB_EQUIPMENT_FIT_SUBJECTS,
} from '../../scripts/lib/equipment_fit_payload.mjs';
import {
  preloadCharacterVisualAssets,
  preloadMeshyTitanWeaponAssets,
} from '../render/characters/assets';
import { itemWeaponModelUrl, MESHY_SENTINEL_VISUAL_KEY } from '../render/characters/manifest';
import type { CharacterPreview } from '../render/characters/preview';
import {
  appearancePanelIsStale,
  forgetAppearancePanel,
  noteAppearancePanelMounted,
} from './appearance_panel_locale';
import { tEntity } from './entity_i18n';
import {
  type EquipmentCalibrationController,
  mountEquipmentCalibrationController,
} from './equipment_calibration_controller';
import { WEAPON_CALIBRATION_TARGETS } from './equipment_calibration_core';
import { t } from './i18n';
import { weaponFitLoadouts, weaponFitSelection } from './weapon_fit_loadouts_core';

const PLAYER_SUBJECTS = [
  { visualKey: 'player_warrior', label: 'Warrior T1' },
  { visualKey: 'player_paladin', label: 'Paladin T1' },
  { visualKey: 'player_hunter', label: 'Hunter T1' },
  { visualKey: 'player_rogue', label: 'Rogue T1' },
  { visualKey: 'player_priest', label: 'Priest T1' },
  { visualKey: 'player_shaman', label: 'Shaman T1' },
  { visualKey: 'player_mage', label: 'Mage T1' },
  { visualKey: 'player_warlock', label: 'Warlock T1' },
  { visualKey: 'player_druid', label: 'Druid T1' },
  { visualKey: MESHY_SENTINEL_VISUAL_KEY, label: 'Warrior Sentinel' },
];

export function createWeaponFitStudio(getPreview: () => CharacterPreview | null) {
  // Resolve names at mount time in the current locale, using the island's mob IDs.
  const subjects = () => [
    ...PLAYER_SUBJECTS,
    ...MOB_EQUIPMENT_FIT_SUBJECTS.map(({ visualKey, templateId }) => ({
      visualKey,
      label: tEntity({ kind: 'mob', id: templateId, field: 'name' }),
    })),
  ];
  const query = new URLSearchParams(window.location.search);
  let visualKey =
    subjects().find((subject) => subject.visualKey === query.get('weaponfitModel'))?.visualKey ??
    'player_warrior';
  let loadout = weaponFitSelection(visualKey, query.get('weaponfitWeapon')).id;
  let revision = 0;
  let pendingRevision: number | null = null;
  let committedSelection = { visualKey, loadout };
  const controllers = new Map<string, EquipmentCalibrationController>();
  const selection = () => {
    const selected = weaponFitSelection(visualKey, loadout);
    return { ...selected, modelUrl: selected.itemId ? itemWeaponModelUrl(selected.itemId) : null };
  };

  function preview(): void {
    const itemId = selection().itemId;
    getPreview()?.setEquipmentCalibrationVisual(
      visualKey,
      itemId ? { mainhandItemId: itemId, offhandItemId: null } : undefined,
    );
  }
  async function ready(): Promise<void> {
    const modelUrl = selection().modelUrl;
    await Promise.all([
      preloadCharacterVisualAssets(visualKey, modelUrl ? [modelUrl] : []),
      preloadMeshyTitanWeaponAssets(),
    ]);
  }
  async function change(
    panelId: string,
    host: HTMLElement,
    subject: string,
    weapon: string,
  ): Promise<void> {
    if (!subjects().some((entry) => entry.visualKey === subject)) return;
    if (!weaponFitLoadouts(subject).some((entry) => entry.id === weapon)) return;
    const token = ++revision;
    pendingRevision = token;
    const previous = committedSelection;
    for (const [id, controller] of controllers) {
      controller.destroy();
      forgetAppearancePanel(id);
    }
    controllers.clear();
    visualKey = subject;
    loadout = weapon;
    const url = new URL(window.location.href);
    url.searchParams.set('weaponfitModel', visualKey);
    url.searchParams.set('weaponfitWeapon', loadout);
    window.history.replaceState(null, '', url);
    try {
      await ready();
    } catch (error) {
      if (revision === token) {
        pendingRevision = null;
        visualKey = previous.visualKey;
        loadout = previous.loadout;
        url.searchParams.set('weaponfitModel', visualKey);
        url.searchParams.set('weaponfitWeapon', loadout);
        window.history.replaceState(null, '', url);
        sync(panelId, host);
      }
      throw error;
    }
    if (revision === token) {
      pendingRevision = null;
      committedSelection = { visualKey, loadout };
      sync(panelId, host);
    }
  }
  function sync(panelId: string, host: HTMLElement): void {
    if (pendingRevision !== null) return;
    const current = getPreview();
    const existing = controllers.get(panelId);
    if (!current) {
      existing?.destroy();
      controllers.delete(panelId);
      forgetAppearancePanel(panelId);
      host.hidden = true;
      return;
    }
    host.hidden = false;
    preview();
    if (existing && !appearancePanelIsStale(panelId)) {
      existing.activate();
      return;
    }
    existing?.destroy();
    const modelUrl = selection().modelUrl;
    const controller = mountEquipmentCalibrationController(host, {
      visualKey,
      fitKey: modelUrl ? itemEquipmentFitKey(visualKey, modelUrl) : undefined,
      targets: WEAPON_CALIBRATION_TARGETS,
      subjects: subjects(),
      selectedSubject: visualKey,
      onSubjectChange: (subject) =>
        change(panelId, host, subject, weaponFitSelection(subject, null).id),
      loadouts:
        weaponFitLoadouts(visualKey).length > 1
          ? weaponFitLoadouts(visualKey).map((entry) => ({
              id: entry.id,
              label: entry.itemId
                ? tEntity({ kind: 'item', id: entry.itemId, field: 'name' })
                : `${t('auth.equipmentSword')} + ${t('auth.equipmentShield')}`,
            }))
          : undefined,
      selectedLoadout: loadout,
      onLoadoutChange: (weapon) => change(panelId, host, visualKey, weapon),
      readDefault: (slot) => getPreview()?.equipmentCalibrationTransform(slot, true) ?? null,
      apply: (slot, transform) =>
        getPreview()?.setEquipmentCalibrationTransform(slot, transform) ?? false,
      readAnimationPaused: () => getPreview()?.equipmentCalibrationAnimationPaused() ?? false,
      setAnimationPaused: (paused) => getPreview()?.setEquipmentCalibrationAnimationPaused(paused),
      animationClips: current.equipmentCalibrationAnimationClips(),
      playAnimation: (clip) => getPreview()?.playEquipmentCalibrationAnimation(clip) ?? false,
      stopAnimation: () => getPreview()?.stopEquipmentCalibrationAnimation(),
      setManipulator: (slot, mode, onChange) =>
        getPreview()?.setEquipmentCalibrationManipulator(slot, mode, onChange) ?? false,
      clearManipulator: () => getPreview()?.clearEquipmentCalibrationManipulator(),
      setCarryLocation: (location) => getPreview()?.setEquipmentCalibrationCarryLocation(location),
    });
    controllers.set(panelId, controller);
    noteAppearancePanelMounted(panelId, () => sync(panelId, host));
  }
  return { ready, preview, sync };
}
