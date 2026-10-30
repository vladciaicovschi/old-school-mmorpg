// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterPreview } from '../src/render/characters/preview';
import type { EquipmentCalibrationControllerDeps } from '../src/ui/equipment_calibration_controller';
import { createWeaponFitStudio } from '../src/ui/weapon_fit_studio';

const mocks = vi.hoisted(() => ({
  preload: vi.fn(),
  mount: vi.fn(),
  destroy: vi.fn(),
  stale: vi.fn(),
  namePrefix: 'initial',
}));
vi.mock('../src/render/characters/assets', () => ({
  preloadCharacterVisualAssets: mocks.preload,
  preloadMeshyTitanWeaponAssets: () => Promise.resolve(),
}));
vi.mock('../src/ui/equipment_calibration_controller', () => ({
  mountEquipmentCalibrationController: mocks.mount,
}));
vi.mock('../src/ui/appearance_panel_locale', () => ({
  appearancePanelIsStale: mocks.stale,
  forgetAppearancePanel: vi.fn(),
  noteAppearancePanelMounted: vi.fn(),
}));
vi.mock('../src/ui/entity_i18n', () => ({
  tEntity: ({ id }: { id: string }) => `${mocks.namePrefix}:${id}`,
}));
const modelUrl = 'models/weapons/meshy/claymore_sword_1.glb';
function fixture() {
  const preview = {
    setEquipmentCalibrationVisual: vi.fn(),
    equipmentCalibrationAnimationClips: () => ['WarriorT1_TwoHand_Idle'],
  } as unknown as CharacterPreview;
  const host = document.createElement('div');
  const studio = createWeaponFitStudio(() => preview);
  studio.sync('test-panel', host);
  const deps = () => mocks.mount.mock.calls.at(-1)?.[1] as EquipmentCalibrationControllerDeps;
  return { preview, host, studio, deps };
}
beforeEach(() => {
  window.history.replaceState(null, '', '/?weaponfit=1&weaponfitModel=player_warrior');
  mocks.mount.mockReset();
  mocks.destroy.mockReset();
  mocks.preload.mockReset();
  mocks.preload.mockResolvedValue(undefined);
  mocks.stale.mockReset();
  mocks.stale.mockReturnValue(false);
  mocks.namePrefix = 'initial';
  mocks.mount.mockReturnValue({ activate: vi.fn(), destroy: mocks.destroy });
});
describe('weapon-fit studio loadout switching', () => {
  it('switches Paladin maul and starter shield with a body/item-specific save key', async () => {
    window.history.replaceState(null, '', '/?weaponfitModel=player_paladin');
    const f = fixture();
    await f.deps().onLoadoutChange?.('twohand');
    const maulUrl = 'models/weapons/meshy/dwarven_warhammer_2h_1.glb';
    expect(mocks.preload).toHaveBeenLastCalledWith('player_paladin', [maulUrl]);
    expect(f.deps().fitKey).toBe(`player_paladin@${maulUrl}`);
    expect(f.preview.setEquipmentCalibrationVisual).toHaveBeenLastCalledWith('player_paladin', {
      mainhandItemId: 'ironshod_maul',
      offhandItemId: null,
    });
    await f.deps().onLoadoutChange?.('starter');
    expect(f.deps().fitKey).toBeUndefined();
    expect(f.preview.setEquipmentCalibrationVisual).toHaveBeenLastCalledWith(
      'player_paladin',
      undefined,
    );
  });
  it('resolves mob labels again when a language change remounts the panel', () => {
    const f = fixture();
    const label = () =>
      f.deps().subjects?.find((entry) => entry.visualKey === 'npc_dev_meshy_ogre')?.label;
    expect(label()).toBe('initial:dev_meshy_ogre');
    mocks.namePrefix = 'changed';
    mocks.stale.mockReturnValue(true);
    f.studio.sync('test-panel', f.host);
    expect(label()).toBe('changed:dev_meshy_ogre');
  });
  it('switches every imported mob with its own body save key and excludes legacy choices', async () => {
    const f = fixture();
    const mobs = f.deps().subjects?.filter((entry) => entry.visualKey.startsWith('npc_dev_')) ?? [];
    expect(mobs).toHaveLength(15);
    expect(f.deps().subjects?.map((entry) => entry.visualKey)).not.toContain('mob_ogre');
    for (const { visualKey, label } of mobs) {
      expect(label).toBeTruthy();
      await f.deps().onSubjectChange?.(visualKey);
      expect(mocks.preload).toHaveBeenLastCalledWith(visualKey, []);
      expect(f.deps().visualKey).toBe(visualKey);
      expect(f.deps().fitKey).toBeUndefined();
      expect(f.preview.setEquipmentCalibrationVisual).toHaveBeenLastCalledWith(
        visualKey,
        undefined,
      );
    }
    await f.deps().onSubjectChange?.('mob_ogre');
    expect(f.deps().visualKey).toBe('npc_dev_treant_v2');
  });
  it('switches hunter bow/crossbow with separate persisted profiles and no shield', async () => {
    window.history.replaceState(null, '', '/?weaponfitModel=player_hunter&weaponfitWeapon=bow');
    const f = fixture();
    await f.studio.ready();
    expect(f.deps().selectedLoadout).toBe('bow');
    expect(f.deps().fitKey).toBe('player_hunter@models/weapons/meshy/arcane_longbow_1.glb');
    expect(f.deps().loadouts?.map((entry) => entry.id)).toEqual(['crossbow', 'bow']);
    expect(f.preview.setEquipmentCalibrationVisual).toHaveBeenLastCalledWith('player_hunter', {
      mainhandItemId: 'dev_hunter_practice_bow',
      offhandItemId: null,
    });
    await f.deps().onLoadoutChange?.('crossbow');
    expect(mocks.preload).toHaveBeenLastCalledWith('player_hunter', [
      'models/weapons/meshy/test_crossbow_1.glb',
    ]);
    expect(f.deps().fitKey).toBe('player_hunter@models/weapons/meshy/test_crossbow_1.glb');
    mocks.preload.mockRejectedValueOnce(new Error('bow unavailable'));
    await expect(f.deps().onLoadoutChange?.('bow')).rejects.toThrow('bow unavailable');
    expect(f.deps().selectedLoadout).toBe('crossbow');
    expect(f.deps().fitKey).toBe('player_hunter@models/weapons/meshy/test_crossbow_1.glb');
  });
  it('loads the real claymore without a shield and selects an isolated item-fit key', async () => {
    const f = fixture();
    expect(f.deps().fitKey).toBeUndefined();
    expect(f.deps().loadouts?.map((loadout) => loadout.id)).toEqual(['starter', 'claymore']);
    await f.deps().onLoadoutChange?.('claymore');
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.preload).toHaveBeenLastCalledWith('player_warrior', [modelUrl]);
    expect(f.preview.setEquipmentCalibrationVisual).toHaveBeenLastCalledWith('player_warrior', {
      mainhandItemId: 'eastbrook_greatsword',
      offhandItemId: null,
    });
    expect(f.deps().fitKey).toBe(`player_warrior@${modelUrl}`);
    expect(f.deps().selectedLoadout).toBe('claymore');
    expect(window.location.search).toContain('weaponfitWeapon=claymore');
    await f.deps().onLoadoutChange?.('starter');
    expect(f.deps().fitKey).toBeUndefined();
    expect(f.preview.setEquipmentCalibrationVisual).toHaveBeenLastCalledWith(
      'player_warrior',
      undefined,
    );
  });
  it('restores a direct claymore URL and hides this test loadout on other classes', async () => {
    window.history.replaceState(
      null,
      '',
      '/?weaponfitModel=player_warrior&weaponfitWeapon=claymore',
    );
    const f = fixture();
    await f.studio.ready();
    expect(mocks.preload).toHaveBeenLastCalledWith('player_warrior', [modelUrl]);
    expect(f.deps().selectedLoadout).toBe('claymore');
    await f.deps().onSubjectChange?.('player_mage');
    expect(f.deps().visualKey).toBe('player_mage');
    expect(f.deps().loadouts).toBeUndefined();
    expect(f.deps().fitKey).toBeUndefined();
  });
  it('ignores stale async completions and rolls back a failed asset load', async () => {
    const f = fixture();
    let resolveOld: (() => void) | undefined;
    mocks.preload.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveOld = resolve;
      }),
    );
    const oldDeps = f.deps();
    const pending = oldDeps.onLoadoutChange?.('claymore');
    await oldDeps.onSubjectChange?.('player_mage');
    resolveOld?.();
    await pending;
    expect(f.deps().visualKey).toBe('player_mage');
    await f.deps().onSubjectChange?.('player_warrior');
    mocks.preload.mockRejectedValueOnce(new Error('test asset unavailable'));
    await expect(f.deps().onLoadoutChange?.('claymore')).rejects.toThrow('test asset unavailable');
    expect(f.deps().selectedLoadout).toBe('starter');
    expect(f.deps().fitKey).toBeUndefined();
    expect(window.location.search).toContain('weaponfitWeapon=starter');
  });
});
