import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip } from '../scripts/anim/pose_blend.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const path = 'public/models/creatures/ice_elemental_prototype.glb';
describe('frosted ice elemental derivative', () => {
  it('retains the staff-free body and skin, with three small bone-mounted crystal clusters', async () => {
    const root = (await createGlbIO().read(path)).getRoot();
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(51);
    const skinned = root.listNodes().filter((n) => n.getSkin());
    expect(skinned).toHaveLength(1);
    expect(skinned[0].getMesh()?.listPrimitives()[0].getIndices()?.getCount()).toBe(9712 * 3);
    const crystals = root.listNodes().filter((n) => n.getName().startsWith('IceCrystal_'));
    expect(crystals).toHaveLength(3);
    expect(crystals.map((n) => n.getParentNode()?.getName()).sort()).toEqual([
      'head',
      'upperarm.l',
      'upperarm.r',
    ]);
    let triangles = 0;
    for (const node of crystals) {
      const primitive = node.getMesh()?.listPrimitives()[0];
      expect(primitive?.getIndices()).not.toBeNull();
      expect(primitive?.getAttribute('TEXCOORD_0')?.getCount()).toBe(
        primitive?.getAttribute('POSITION')?.getCount(),
      );
      triangles +=
        (primitive?.getIndices()?.getCount() ??
          primitive?.getAttribute('POSITION')?.getCount() ??
          0) / 3;
      expect(primitive?.getMaterial()?.getName()).toBe('IceElemental_Crystal');
    }
    expect(triangles).toBe(84);
    expect(
      root
        .listMaterials()
        .map((m) => m.getName())
        .sort(),
    ).toEqual(['IceElemental_Crystal', 'IceElemental_Frost']);
    const material = root.listMaterials().find((m) => m.getName() === 'IceElemental_Frost');
    expect(material?.getExtension('KHR_materials_clearcoat')).not.toBeNull();
    expect(material?.getExtension('KHR_materials_ior')).not.toBeNull();
    expect(material?.getExtension('KHR_materials_transmission')).toBeNull();
    const original = (
      await createGlbIO().read('public/models/creatures/fire_elemental_prototype.glb')
    )
      .getRoot()
      .listMaterials()[0];
    const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
    expect(hash(material?.getBaseColorTexture()?.getImage() ?? new Uint8Array())).not.toBe(
      hash(original.getBaseColorTexture()?.getImage() ?? new Uint8Array()),
    );
    const bytes = readFileSync(path);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
  });

  it('shares open-hand poses with fire and preserves finite casting/death channels', async () => {
    const ice = (await createGlbIO().read(path)).getRoot();
    const fire = (
      await createGlbIO().read('public/models/creatures/fire_elemental_prototype.glb')
    ).getRoot();
    expect(
      ice
        .listAnimations()
        .map((a) => a.getName())
        .sort(),
    ).toEqual(['Ice_Idle', 'Ice_Move', 'Cast', 'ChannelStart', 'Channel', 'Death'].sort());
    for (const animation of ice.listAnimations()) {
      const clip = indexClip(ice, animation.getName());
      const donor = indexClip(fire, animation.getName().replace(/^Ice_/, 'Fire_'));
      expect(clip.size).toBe(donor.size);
      for (const [key, channel] of clip) {
        expect([...channel.values].every(Number.isFinite), key).toBe(true);
        if (/^f[123][bc]\.r\|rotation$/.test(key)) {
          const other = donor.get(key);
          expect(other).toBeDefined();
          expect([...channel.values]).toEqual([...(other?.values ?? [])]);
        }
      }
    }
  });

  it('has a distinct passive island subject and cold effects', () => {
    expect(DEV_MODEL_LAB_MOBS.dev_ice_elemental.aggroOnDamageOnly).toBe(true);
    expect(
      DEV_MODEL_LAB_MOB_LINEUP.filter((e) => e.templateId === 'dev_ice_elemental'),
    ).toHaveLength(1);
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_ice_elemental' } as never)).toBe(
      'npc_dev_ice_elemental',
    );
    expect(VISUALS.npc_dev_ice_elemental.bodyVfx).toBe('ice');
    expect(VISUALS.npc_dev_ice_elemental.attach).toBeUndefined();
  });
});
