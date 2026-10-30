// Developer comparison snapshots of NPC appearances before their named bodies.
// Values come from the original NPC_LOOKS roster. Aldric deliberately has no
// modular entry: his legacy appearance is the fixed pre-v0.7 npc_aldric rig.
import {
  type ArmorLoadout,
  type ArmorSetId,
  type BodyShape,
  type FaceShape,
  fullSet,
  type ModularLook,
  NEUTRAL_BODY,
  NEUTRAL_FACE,
  normalizeAppearance,
} from './modular';
import type { NpcLookDef, NpcPropSet } from './npc_looks';

const face = (o: Partial<FaceShape>): FaceShape => ({ ...NEUTRAL_FACE, ...o });
const body = (o: Partial<BodyShape>): BodyShape => ({ ...NEUTRAL_BODY, ...o });
const skin = (h: number, s: number, l: number) => ({ skinHue: h, skinSat: s, skinLight: l });
const hair = (h: number, s: number, l: number) => ({
  hairHue: h,
  hairSat: s,
  hairLight: l,
  lashHue: h,
  lashSat: s,
  lashLight: l,
});
const eyes = (h: number, s: number, l: number) => ({ eyeHue: h, eyeSat: s, eyeLight: l });
const kit = (set: ArmorSetId, over: Partial<ArmorLoadout> = {}): ArmorLoadout => ({
  ...fullSet(set),
  head: null,
  ...over,
});

export const DEV_MODEL_LEGACY_NPC_LOOK_DEFS: Readonly<Record<string, NpcLookDef>> = {
  apothecary_lin: {
    app: {
      gender: 'female',
      hair: 'lowbun',
      ...hair(20, 0.4, 0.06),
      brows: 'thin',
      eyeShape: 'doe',
      ...eyes(30, 0.4, 0.2),
      ...skin(30, 0.35, 0.62),
      mouth: 'lips',
      body: body({ shoulders: -0.15, hands: -0.1 }),
      outfit: 'forest',
    },
    worn: kit('druid'),
    props: 'none',
  },
  fisherman_brandt: {
    app: {
      gender: 'male',
      hair: 'crew',
      ...hair(30, 0.05, 0.6),
      beard: 'full',
      brows: 'bushy',
      eyeShape: 'droopy',
      ...eyes(190, 0.4, 0.4),
      ...skin(24, 0.5, 0.48),
      mouth: 'grin',
      face: face({ cheeks: -0.2, nose: 0.3 }),
      outfit: 'teal',
    },
    worn: kit('rogue', { arms: null }),
    props: 'spear',
  },
  trader_wilkes: {
    app: {
      gender: 'male',
      hair: 'sidepart',
      ...hair(28, 0.5, 0.4),
      beard: 'scruff',
      brows: 'soft',
      eyeShape: 'round',
      ...eyes(140, 0.35, 0.3),
      ...skin(26, 0.5, 0.62),
      mouth: 'smile',
      face: face({ cheeks: 0.35 }),
      body: body({ chest: 0.15, hips: 0.1 }),
    },
    worn: kit('rogue', { arms: null }),
    props: 'none',
  },
  smith_haldren: {
    app: {
      gender: 'male',
      hair: 'crew',
      ...hair(22, 0.45, 0.15),
      beard: 'horseshoe',
      brows: 'bushy',
      eyeShape: 'almond',
      ...eyes(28, 0.45, 0.25),
      ...skin(24, 0.5, 0.5),
      face: face({ jaw: 0.3 }),
      body: body({ shoulders: 0.35, chest: 0.3, hands: 0.2 }),
      outfit: 'ember',
    },
    worn: kit('barbarian'),
    props: 'hammer',
  },
  marshal_redbrook: {
    app: {
      gender: 'male',
      hair: 'crewcut',
      ...hair(20, 0.15, 0.35),
      beard: 'shortbox',
      brows: 'angled',
      eyeShape: 'sharp',
      ...eyes(200, 0.35, 0.3),
      ...skin(25, 0.45, 0.55),
      face: face({ jaw: 0.4, brow: 0.2 }),
      body: body({ shoulders: 0.2 }),
      outfit: 'crimson',
    },
    worn: kit('knight'),
    props: 'sword_shield',
  },
  foreman_odell: {
    app: {
      gender: 'male',
      hair: 'buzz',
      ...hair(24, 0.3, 0.25),
      beard: 'mutton',
      brows: 'thick',
      eyeShape: 'sharp',
      ...eyes(30, 0.4, 0.35),
      ...skin(26, 0.45, 0.45),
      mouth: 'frown',
      face: face({ jaw: 0.5, brow: 0.3, nose: 0.2 }),
      body: body({ shoulders: 0.25, chest: 0.2 }),
      outfit: 'onyx',
    },
    worn: kit('barbarian'),
    props: 'hammer',
  },
};

const resolved = new Map<string, ModularLook>();

/** The old authored appearance, keyed by the original NPC template id. */
export function devModelLegacyNpcLookFor(templateId: string): ModularLook | null {
  const def = DEV_MODEL_LEGACY_NPC_LOOK_DEFS[templateId];
  if (!def) return null;
  let look = resolved.get(templateId);
  if (!look) {
    look = { app: normalizeAppearance(def.app), worn: def.worn };
    resolved.set(templateId, look);
  }
  return look;
}

/** Matching legacy held props; null means the original NPC keeps a fixed rig. */
export function devModelLegacyNpcPropSetFor(templateId: string): NpcPropSet | null {
  return DEV_MODEL_LEGACY_NPC_LOOK_DEFS[templateId]?.props ?? null;
}
