import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGlbIO } from '../scripts/anim/pose_blend.mjs';
import {
  MOB_EQUIPMENT_FIT_SUBJECTS,
  validEquipmentFitTransform,
} from '../scripts/lib/equipment_fit_payload.mjs';
import { isAuthoredHeldModelUrl, VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_IMPORTED_HUMANOIDS } from '../src/sim/content/dev_imported_humanoids';
import { DEV_MODEL_COMPARISONS } from '../src/sim/content/dev_model_comparisons';
import { MOBS } from '../src/sim/data';

const pins = {
  ancient_ram_spear: 'fb55e1186c302da1863b4c6f0793cd061fc33243063131b4375231ebe9bcf30e',
  arcanum_axe: 'f96133f1eda210e93d3d2a564627af1b0c125c0735bd0bf8aa09215dbf6eac80',
  primitive_spear: '744b5aced4989156bfa8373a4cff49be175678501d113690fb2e4a2b111c040e',
  savage_axe: '0ed7b1ea949041b9cbd83f7a3e42274ebae402cba14d6eb375f7b42af741c08e',
  stone_axe: '64bf122015eed9eccf1d938e8a850353d7106507a92cc577073adeeb028f7fcc',
  stone_tipped_spear: '1e448d52ca0060ea1e2db504c71bf166b3a1c4e939b932851ac9e45860b1d9cf',
  wooden_club: 'a5818bcf415ff0f980b929fca41f29f82b65c814db309e33ba8343cebe6f5fca',
};

describe('community tribal weapon import and replacement wiring', () => {
  it.each(Object.entries(pins))(
    '%s retains original PBR maps in a bounded static shipping mesh',
    async (name, sha) => {
      const url = `models/weapons/community_tribal/${name}.glb`,
        bytes = readFileSync(`public/${url}`);
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      expect(json.extensionsRequired).toEqual(
        expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
      );
      expect(json.images.length).toBeGreaterThan(0);
      for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
      const root = (await createGlbIO().read(`public/${url}`)).getRoot();
      expect(root.listSkins()).toHaveLength(0);
      expect(root.listAnimations()).toHaveLength(0);
      const triangles = root
        .listMeshes()
        .flatMap((m) => m.listPrimitives())
        .reduce(
          (n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3,
          0,
        );
      expect(triangles).toBeGreaterThan(300);
      expect(triangles).toBeLessThanOrEqual(12020);
      expect(
        root
          .listNodes()
          .find((n) => n.getMesh())
          ?.getExtras().source_sha256,
      ).toBe(sha);
      expect(isAuthoredHeldModelUrl(url)).toBe(true);
    },
  );
  it.each(['stalker', 'ravager', 'hexcaller', 'beastmaster', 'high_priest'])(
    'replaces %s in production and provides a passive combat copy',
    (role) => {
      const source = `wildheart_${role}`,
        key = `mob_${source}`,
        dev = `dev_${source}`;
      expect(visualKeyFor({ kind: 'mob', templateId: source } as never)).toBe(key);
      expect(visualKeyFor({ kind: 'mob', templateId: dev } as never)).toBe(key);
      expect(VISUALS[key].url).not.toBe(VISUALS[`dev_legacy_${source}`].url);
      expect(VISUALS[`dev_legacy_${source}`].lazyPreload).toBe(true);
      expect(VISUALS[key].matte).toBe(true);
      expect(VISUALS[key].authoredAtlas).toBe(true);
      expect(VISUALS[key].animUrls).toBeUndefined();
      expect(VISUALS[key].tint).toBeUndefined();
      const copy = DEV_IMPORTED_HUMANOIDS[dev];
      expect(copy.aggroRadius).toBe(0);
      expect(copy.aggroOnDamageOnly).toBe(true);
      for (const field of [
        'scale',
        'moveSpeed',
        'petSpell',
        'mendAlly',
        'wardAllies',
        'stomp',
        'aoePulse',
        'warcry',
      ] as const)
        expect(copy[field]).toEqual(MOBS[source][field]);
      expect(DEV_MODEL_COMPARISONS.find((r) => r.id === key)).toMatchObject({
        newVisual: key,
        installed: true,
        combatMobId: dev,
      });
    },
  );
  it.each(['stalker', 'ravager', 'beastmaster'])(
    'fits %s weapon to a real native hand and enables editor saving',
    (role) => {
      const key = `mob_wildheart_${role}`,
        def = VISUALS[key];
      expect(def.attach).toHaveLength(1);
      expect(def.attach![0].bone).toBe('mixamorig:RightHand');
      expect(def.attach![0].calibrationSlot).toBe('mainhand');
      expect(validEquipmentFitTransform(def.heldAttachmentFit?.mainhand)).toBe(true);
      expect(MOB_EQUIPMENT_FIT_SUBJECTS).toContainEqual({
        templateId: `dev_wildheart_${role}`,
        visualKey: key,
      });
    },
  );
});
