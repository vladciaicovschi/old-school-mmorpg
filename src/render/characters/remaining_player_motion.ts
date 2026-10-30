// Fixed T1 migration only. Legacy composed/KayKit definitions stay separate.
import type { ClipMap, VisualDef } from './manifest';
import { WARRIOR_TRAVEL_CLIPS } from './warrior_travel_names';
import type { WeaponMotionSet } from './weapon_motion_core';

export const REMAINING_T1_CLASSES = ['mage', 'priest', 'druid', 'shaman', 'rogue'] as const;
export type RemainingT1Class = (typeof REMAINING_T1_CLASSES)[number];

export function remainingPlayerMotion(cls: RemainingT1Class, native: VisualDef): VisualDef {
  const p = `T1${cls[0].toUpperCase()}${cls.slice(1)}Motion_`;
  const armed = cls === 'shaman' || cls === 'rogue';
  const clips: ClipMap = {
    idle: armed ? WARRIOR_TRAVEL_CLIPS.idle : `${p}TravelIdle`,
    combatIdle: `${p}ReadyIdle`,
    walk: armed ? WARRIOR_TRAVEL_CLIPS.walk : `${p}TravelWalk`,
    run: armed ? WARRIOR_TRAVEL_CLIPS.run : `${p}TravelRun`,
    jump: `${p}Jump`,
    fall: `${p}Jump`,
    jumpClampAtEnd: true,
    death: native.clips.death,
    hit: [`${p}Hit`],
    attack: [`${p}MagicAttack`],
    // Keep the deferred water lane explicitly, not the incompatible fall clip.
    swim: native.clips.swim,
    swimSurface: native.clips.swimSurface,
    swimIdle: native.clips.swimIdle,
    wade: native.clips.wade,
  };
  if (armed) clips.travel = { ...WARRIOR_TRAVEL_CLIPS, jump: `${p}Jump` };
  if (cls === 'rogue') {
    clips.attack = ['StabA', 'StabB', 'StabC'].map((name) => p + name);
    clips.cast = `${p}Utility`;
    clips.attackByAbility = Object.fromEntries(
      Object.keys(native.clips.attackByAbility ?? {}).map((id) => [
        id,
        p +
          (id === 'kick'
            ? 'Kick'
            : [
                  'blind',
                  'evasion',
                  'slice_and_dice',
                  'vanish',
                  'adrenaline_rush',
                  'stealth',
                ].includes(id)
              ? 'Utility'
              : ['ambush', 'eviscerate', 'rupture', 'expose_armor'].includes(id)
                ? 'StabC'
                : ['backstab', 'garrote', 'cheap_shot', 'kidney_shot'].includes(id)
                  ? 'StabB'
                  : 'StabA'),
      ]),
    );
    const daggers: WeaponMotionSet = {
      idle: `${p}ReadyIdle`,
      walk: clips.walk,
      run: clips.run,
      jump: `${p}ArmedJump`,
      attack: [...clips.attack],
      hit: [`${p}Hit`],
    };
    clips.weaponMotions = {
      onehand: daggers,
      dualwield: daggers,
      unarmed: {
        ...daggers,
        idle: clips.idle,
        jump: `${p}Jump`,
      },
    };
  } else {
    if (cls !== 'shaman') clips.locomotionShotClips = [`${p}CastShadow_Release`];
    if (cls !== 'shaman') clips.drawnIdle = `${p}StaffIdle`;
    clips.cast = `${p}CastShadow_Loop`;
    clips.castDurationFit = {
      tailSeconds: 0.76,
      tailPlaybackSeconds: 0.3,
      maxPreparationSpeed: 1.35,
    };
    clips.castByTarget = {
      hostile: `${p}CastShadow_Loop`,
      self: `${p}CastSelf_Loop`,
      ally: `${p}CastAlly_Loop`,
    };
    clips.castReleaseByTarget = {
      hostile: `${p}CastShadow_Release`,
      self: `${p}CastSelf_Release`,
      ally: `${p}CastAlly_Release`,
    };
    const families: Record<string, string> = {
      Cast_Fire: 'Fire',
      Cast_Nurture: 'Ally',
      Cast_Heal: 'Ally',
      Spellcast_Raise: 'Self',
      Block: 'Self',
    };
    const abilities = Object.entries(native.clips.attackByAbility ?? {}).filter(
      ([id]) => id !== 'stormstrike',
    );
    clips.castByAbility = Object.fromEntries(
      abilities.map(([id, clip]) => [id, `${p}Cast${families[clip] ?? 'Shadow'}_Loop`]),
    );
    clips.attackByAbility = Object.fromEntries(
      abilities.map(([id, clip]) => [id, `${p}Cast${families[clip] ?? 'Shadow'}_Release`]),
    );
    if (cls === 'shaman') {
      const motion = (family: string): WeaponMotionSet => ({
        idle: `${p}${family}_Idle`,
        walk: `${p}${family}_Walk`,
        run: `${p}${family}_Run`,
        jump: `${p}${family}_Jump`,
        hit: [`${p}${family}_Hit`],
        attack: (family === 'OneHand'
          ? ['AttackA', 'AttackB']
          : ['AttackA', 'AttackB', 'AttackC']
        ).map((name) => `${p}${family}_${name}`),
        ...(family === 'Shield' ? { attackWeights: [0.65, 0.175, 0.175] } : {}),
        // No cast override: all equipment families use the joined free-hand spell lane.
        // Stormstrike deliberately uses a weapon strike fallback, not a magic override.
      });
      const onehand = motion('OneHand');
      clips.weaponMotions = {
        onehand,
        shield: motion('Shield'),
        twohand: motion('TwoHand'),
        dualwield: onehand,
      };
      clips.attack = [...onehand.attack];
    }
  }
  return {
    ...native,
    // Old KayKit accessory names are not an allowlist for these whole T1 bodies.
    show: undefined,
    clips,
    stowHeldPropsWhileCasting: cls !== 'rogue',
    animUrls: [
      `models/chars/players/${cls}_t1_motion_anims.glb`,
      // Imported water clips remain a separate, deferred migration.
      ...(native.animUrls ?? []).filter((url) => url.endsWith('/swim_anims.glb')),
    ],
  };
}
