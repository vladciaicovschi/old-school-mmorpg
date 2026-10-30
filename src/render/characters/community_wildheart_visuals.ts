// Imported bodies keep their own native rig and baked vocabulary. These
// definitions only replace presentation; production combat data stays in sim.
import { WILDHEART_VISUAL_HEIGHTS } from '../../sim/wildheart_visual_proportions';
import type { ArmorDyeSpec } from './armor_dye';
import { WILDHEART_NATIVE_CLIPS } from './community_wildheart_native_clips';
import type { HeldAttachmentFit } from './held_attachment_fit';
import type { ClipMap, VisualDef } from './manifest';

const tribalPaint: ArmorDyeSpec = {
  rules: [
    {
      ref: 0,
      band: 30,
      sat: [0.15, 0.25, 1.01, 1.02],
      val: [0.18, 0.28, 1.01, 1.02],
      hueMode: 'keep',
      hue: 0,
      satMul: 0.82,
      satAdd: 0,
      valMul: 0.98,
      valAdd: 0,
    },
  ],
};
const ritualPaint: ArmorDyeSpec = {
  rules: [
    {
      ref: 285,
      band: 55,
      sat: [0.14, 0.24, 1.01, 1.02],
      val: [0.15, 0.25, 1.01, 1.02],
      hueMode: 'keep',
      hue: 0,
      satMul: 0.78,
      satAdd: 0,
      valMul: 0.98,
      valAdd: 0,
    },
  ],
};
const ancestralPaint: ArmorDyeSpec = {
  rules: [
    {
      ref: 145,
      band: 45,
      sat: [0.1, 0.2, 1.01, 1.02],
      val: [0.15, 0.25, 1.01, 1.02],
      hueMode: 'keep',
      hue: 0,
      satMul: 0.85,
      satAdd: 0,
      valMul: 0.98,
      valAdd: 0,
    },
  ],
};

const handFits = {
  mob_wildheart_stalker: {
    mainhand: {
      position: [0, 0.045, 0],
      rotationDeg: [-6.61127, -8.39768, -169.20102],
      scale: 0.500005,
    },
  },
  mob_wildheart_ravager: {
    mainhand: {
      position: [0.004657, 0.071094, 0.007007],
      rotationDeg: [-6.6975, -12.34908, -169.67373],
      scale: 0.579994,
    },
  },
  mob_wildheart_beastmaster: {
    mainhand: {
      position: [0.004187, 0.094849, 0.003503],
      rotationDeg: [-6.89905, -18.54155, -170.44122],
      scale: 0.480001,
    },
  },
} satisfies Record<string, HeldAttachmentFit>;

const clips: ClipMap = {
  idle: 'Wildheart_Idle',
  combatIdle: 'Wildheart_CombatIdle',
  walk: 'Wildheart_Walk',
  run: 'Wildheart_Run',
  attack: ['Wildheart_Attack'],
  hit: ['Wildheart_Hit'],
  death: 'Wildheart_Death',
};
function motion(asset: string, extras: string[] = []): ClipMap {
  return {
    ...clips,
    studioClips: [...WILDHEART_NATIVE_CLIPS[asset], 'Wildheart_Attack', ...extras],
  };
}
function body(asset: string, height: number, atlasDye: ArmorDyeSpec): VisualDef {
  return {
    url: `models/creatures/community_wildheart_${asset}.glb`,
    height,
    clips: motion(asset),
    authoredAtlas: true,
    matte: true,
    atlasDye,
    attackTimeScale: 1,
    gait: { runEnter: 3.5, runExit: 3.0 },
  };
}
export const COMMUNITY_WILDHEART_VISUALS: Record<string, VisualDef> = {
  mob_wildheart_stalker: {
    ...body('silent8', WILDHEART_VISUAL_HEIGHTS.wildheart_stalker, tribalPaint),
    walkRef: 3.3098965926,
    runRef: 7.3649223856,
    heldAttachmentFit: handFits.mob_wildheart_stalker,
    equipmentFitKey: 'mob_wildheart_stalker',
    attach: [
      {
        url: 'models/weapons/community_tribal/stone_tipped_spear.glb',
        bone: 'mixamorig:RightHand',
        calibrationSlot: 'mainhand',
      },
    ],
    clips: { ...motion('silent8'), attack: ['Wildheart_SpearThrow'] },
  },
  mob_wildheart_ravager: {
    ...body('silent1', WILDHEART_VISUAL_HEIGHTS.wildheart_ravager, tribalPaint),
    walkRef: 3.2608230279,
    runRef: 7.5598253199,
    heldAttachmentFit: handFits.mob_wildheart_ravager,
    equipmentFitKey: 'mob_wildheart_ravager',
    attach: [
      {
        url: 'models/weapons/community_tribal/savage_axe.glb',
        bone: 'mixamorig:RightHand',
        calibrationSlot: 'mainhand',
      },
    ],
    clips: motion('silent1', ['Wildheart_AxeThrow']),
  },
  mob_wildheart_hexcaller: {
    ...body('silent4', WILDHEART_VISUAL_HEIGHTS.wildheart_hexcaller, ritualPaint),
    walkRef: 3.3396760257,
    runRef: 7.5466372696,
    clips: {
      ...motion('silent4', ['Wildheart_Slam']),
      cast: 'Wildheart_Cast',
      attack: ['Wildheart_Cast'],
      attackByAbility: { wildheart_ancestral_sap: 'Wildheart_Heal' },
    },
  },
  mob_wildheart_beastmaster: {
    ...body('silent6', WILDHEART_VISUAL_HEIGHTS.wildheart_beastmaster, tribalPaint),
    walkRef: 3.2896509412,
    runRef: 7.5482573171,
    heldAttachmentFit: handFits.mob_wildheart_beastmaster,
    equipmentFitKey: 'mob_wildheart_beastmaster',
    attach: [
      {
        url: 'models/weapons/community_tribal/ancient_ram_spear.glb',
        bone: 'mixamorig:RightHand',
        calibrationSlot: 'mainhand',
      },
    ],
    clips: {
      ...motion('silent6'),
      attackByAbility: {
        wildheart_beast_pit_quake: 'Wildheart_Release',
        wildheart_thickhide_ward: 'Wildheart_Heal',
        wildheart_call_of_the_hunt: 'Wildheart_Cast',
      },
    },
  },
  mob_wildheart_high_priest: {
    ...body('cycle8', WILDHEART_VISUAL_HEIGHTS.wildheart_high_priest, ancestralPaint),
    walkRef: 3.3175729423,
    runRef: 7.4014961775,
    clips: {
      ...motion('cycle8', ['Wildheart_Heal']),
      cast: 'Wildheart_Cast',
      attackByAbility: { wildheart_pulse: 'Wildheart_Release' },
    },
  },
};

export const COMMUNITY_MOGGER_VISUAL: VisualDef = {
  url: 'models/creatures/community_mogger.glb',
  height: 2.4,
  authoredAtlas: true,
  matte: true,
  attackTimeScale: 1,
  walkRef: 2.5428300745,
  runRef: 5.0050379949,
  gait: { runEnter: 3.5, runExit: 3.0 },
  clips: {
    studioClips: ['Mogger_GroundPound'],
    idle: 'Mogger_Idle',
    combatIdle: 'Mogger_CombatIdle',
    walk: 'Mogger_Walk',
    run: 'Mogger_Run',
    attack: ['Mogger_Attack'],
    hit: ['Mogger_Hit'],
    death: 'Mogger_Death',
    cast: 'Mogger_Cast',
    attackByAbility: {
      mogger_ground_pound: 'Mogger_GroundPoundRelease',
      mogger_bracing_order: 'Mogger_Order',
    },
  },
};
