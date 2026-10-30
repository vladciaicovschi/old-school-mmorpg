// Fail-safe boot orchestration for the selected player body and the Proving
// Shore Quaternius NPC experiment. Kept out of main.ts so rollback,
// partial-load failure and identity mapping are testable without booting.

import {
  setNpcVisualOverrideProvider,
  setPlayerVisualOverrideProvider,
} from '../render/characters';
import {
  preloadCharacterVisualAssets,
  preloadMeshyTitanWeaponAssets,
  preloadQuaterniusWeaponAssets,
} from '../render/characters/assets';
import {
  MESHY_SENTINEL_VISUAL_KEY,
  quaterniusPlayerVisualKey,
} from '../render/characters/manifest';
import { type ModularAppearance, normalizeAppearance } from '../render/characters/modular';
import { WARRIOR_SUIT_VISUAL_KEYS } from '../render/characters/warrior_suits';
import {
  type CharacterBodyMode,
  characterBodyMode,
  quaterniusCharacterBodyEnabled,
} from '../render/render_dev_flags';
import { isOnProvingShore } from '../sim/content/proving_shore';
import type { Entity } from '../sim/types';
import { loadSpanAsync } from './load_profiler';
import { warriorSuitSelection } from './warrior_suit_selection';

type PlayerVisualOverride = ((entity: Entity) => string | null) | null;

interface QuaterniusCharacterBodyDeps {
  requested: () => boolean;
  playerVisualKeys?: () => readonly string[];
  playerVisualKeyFor?: (entity: Entity) => string | null;
  npcVisualKeys?: () => readonly string[];
  loadVisuals: (visualKeys: readonly string[]) => Promise<void>;
  loadWeapons: () => Promise<void>;
  installPlayerOverride: (provider: PlayerVisualOverride) => void;
  installNpcOverride: (provider: PlayerVisualOverride) => void;
  reportError: (error: unknown) => void;
}

const PROVING_SHORE_NPC_VISUAL_KEYS = Object.freeze({
  instructor_maren: 'npc_quaternius_instructor_maren',
  quartermaster_finch: 'npc_quaternius_quartermaster_finch',
  bursar_wick: 'npc_quaternius_bursar_wick',
  ferryman_odo: 'npc_quaternius_ferryman_odo',
  warden_tam: 'npc_quaternius_warden_tam',
  overseer_pell: 'npc_quaternius_overseer_pell',
  drillmaster_rook: 'npc_quaternius_drillmaster_rook',
  tidewarden_nel: 'npc_quaternius_tidewarden_nel',
});
const PROVING_SHORE_NPC_VISUAL_KEY_LIST = Object.freeze(Object.values(PROVING_SHORE_NPC_VISUAL_KEYS));

/** The Quaternius player body while the entity is physically on the tutorial island. */
export function quaterniusProvingShorePlayerVisualKey(entity: Entity): string | null {
  if (entity.kind !== 'player' || !isOnProvingShore(entity.pos.x, entity.pos.z)) return null;
  return quaterniusPlayerVisualKey(
    normalizeAppearance(entity.modularAppearance as Partial<ModularAppearance> | null | undefined)
      .gender,
  );
}

/** Selected player-body experiment while the entity is physically on the
 * tutorial island. Kept as a developer comparison lane; production players
 * use their selected T1 class body everywhere. */
export function provingShorePlayerVisualKey(
  entity: Entity,
  mode: CharacterBodyMode = characterBodyMode(),
): string | null {
  if (entity.kind !== 'player' || !isOnProvingShore(entity.pos.x, entity.pos.z)) return null;
  if (mode === 'kaykit') return null;
  return mode === 'meshy'
    ? MESHY_SENTINEL_VISUAL_KEY
    : quaterniusProvingShorePlayerVisualKey(entity);
}

export function quaterniusProvingShoreNpcVisualKey(entity: Entity): string | null {
  if (entity.kind !== 'npc' || !isOnProvingShore(entity.pos.x, entity.pos.z)) return null;
  return PROVING_SHORE_NPC_VISUAL_KEYS[entity.templateId as keyof typeof PROVING_SHORE_NPC_VISUAL_KEYS] ?? null;
}

const DEFAULT_DEPS: QuaterniusCharacterBodyDeps = {
  requested: quaterniusCharacterBodyEnabled,
  // Production players always keep their selected T1 class body. The legacy
  // whole-body warrior suits predate that decision and must not replace it;
  // equipment is represented by independently attached held models instead.
  playerVisualKeys: () => [],
  playerVisualKeyFor: () => null,
  npcVisualKeys: () => PROVING_SHORE_NPC_VISUAL_KEY_LIST,
  loadVisuals: (visualKeys) =>
    loadSpanAsync('quaternius-character-assets', () =>
      Promise.all(visualKeys.map((key) => preloadCharacterVisualAssets(key))).then(() => undefined),
    ),
  loadWeapons: () =>
    loadSpanAsync('quaternius-weapon-assets', () =>
      Promise.all([preloadQuaterniusWeaponAssets(), preloadMeshyTitanWeaponAssets()]).then(
        () => undefined,
      ),
    ),
  installPlayerOverride: setPlayerVisualOverrideProvider,
  installNpcOverride: setNpcVisualOverrideProvider,
  reportError: (error) =>
    console.error('Tutorial-island character-body slice failed to preload:', error),
};

/** Clear any prior override, load the complete experiment set, then install
 * the selected player and island-NPC mappings. A rejected body or donor keeps the
 * provider cleared so the normal character stack remains the fallback. */
export async function configureQuaterniusCharacterBodyOverrides(
  deps: QuaterniusCharacterBodyDeps = DEFAULT_DEPS,
): Promise<boolean> {
  deps.installPlayerOverride(null);
  deps.installNpcOverride(null);
  warriorSuitSelection.ready = false;
  if (!deps.requested()) return false;

  const playerVisualKeys = deps.playerVisualKeys?.() ?? [];
  const npcVisualKeys = deps.npcVisualKeys?.() ?? PROVING_SHORE_NPC_VISUAL_KEY_LIST;
  const suitsRequested = WARRIOR_SUIT_VISUAL_KEYS.every((key) => playerVisualKeys.includes(key));
  // Suit assets include their own held-model dependencies. An unrelated island
  // NPC/weapon failure must not strand a successfully loaded inventory choice.
  const suitLoad = suitsRequested
    ? deps.loadVisuals(WARRIOR_SUIT_VISUAL_KEYS).then(
        () => {
          warriorSuitSelection.ready = true;
        },
        (error) => {
          deps.reportError(error);
        },
      )
    : Promise.resolve();
  try {
    await Promise.all([
      deps.loadVisuals([
        ...playerVisualKeys.filter((key) => !WARRIOR_SUIT_VISUAL_KEYS.includes(key)),
        ...npcVisualKeys,
      ]),
      deps.loadWeapons(),
    ]);
  } catch (error) {
    deps.reportError(error);
    await suitLoad;
    if (warriorSuitSelection.ready) {
      deps.installPlayerOverride((entity) => warriorSuitSelection.visualKey(entity));
    }
    return warriorSuitSelection.ready;
  }

  await suitLoad;
  deps.installPlayerOverride(deps.playerVisualKeyFor ?? (() => null));
  deps.installNpcOverride(quaterniusProvingShoreNpcVisualKey);
  return true;
}
