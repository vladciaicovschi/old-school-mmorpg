import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip } from '../scripts/anim/pose_blend.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const path = 'public/models/creatures/water_elemental_prototype.glb';
describe('translucent water elemental', () => {
  it('keeps body topology and rig, removes stone PBR maps and uses blended water without transmission', async () => {
    const root = (await createGlbIO().read(path)).getRoot();
    expect(root.listMeshes()).toHaveLength(1);
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(51);
    const body = root.listMeshes()[0].listPrimitives()[0];
    expect(body.getIndices()?.getCount()).toBe(9712 * 3);
    expect(body.getAttribute('TEXCOORD_0')).not.toBeNull();
    const material = body.getMaterial();
    expect(material?.getName()).toBe('WaterElemental_Surface');
    expect(material?.getAlphaMode()).toBe('BLEND');
    expect(material?.getBaseColorFactor()[3]).toBeCloseTo(0.72);
    expect(material?.getNormalTexture()).toBeNull();
    expect(material?.getMetallicRoughnessTexture()).toBeNull();
    expect(material?.getOcclusionTexture()).toBeNull();
    expect(material?.getExtension('KHR_materials_clearcoat')).not.toBeNull();
    expect(material?.getExtension('KHR_materials_transmission')).toBeNull();
    const normal = body.getAttribute('NORMAL');
    if (!normal) throw Error('Missing water normals');
    for (let i = 0; i < normal.getCount(); i++)
      // Meshopt pipeline stores 8-bit normalized components; the vector is
      // normalized again in the shader (sqrt(3) / 254 component error bound).
      expect(Math.abs(Math.hypot(...normal.getElement(i, [])) - 1)).toBeLessThan(0.008);
    const bytes = readFileSync(path),
      json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
  });

  it('inherits the open-hand animation vocabulary with finite complete channels', async () => {
    const water = (await createGlbIO().read(path)).getRoot();
    const fire = (
      await createGlbIO().read('public/models/creatures/fire_elemental_prototype.glb')
    ).getRoot();
    expect(
      water
        .listAnimations()
        .map((a) => a.getName())
        .sort(),
    ).toEqual(['Water_Idle', 'Water_Move', 'Cast', 'ChannelStart', 'Channel', 'Death'].sort());
    for (const animation of water.listAnimations()) {
      const clip = indexClip(water, animation.getName());
      const source = indexClip(fire, animation.getName().replace(/^Water_/, 'Fire_'));
      expect(clip.size).toBe(source.size);
      for (const [key, channel] of clip) {
        expect([...channel.values].every(Number.isFinite), key).toBe(true);
        if (/^f[123][bc]\.r\|rotation$/.test(key))
          expect([...channel.values]).toEqual([...(source.get(key)?.values ?? [])]);
      }
    }
  });

  it('has one passive unarmed island subject, a stable studio key and water effects', () => {
    expect(DEV_MODEL_LAB_MOBS.dev_water_elemental.aggroOnDamageOnly).toBe(true);
    expect(
      DEV_MODEL_LAB_MOB_LINEUP.filter((m) => m.templateId === 'dev_water_elemental'),
    ).toHaveLength(1);
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_water_elemental' } as never)).toBe(
      'npc_dev_water_elemental',
    );
    expect(VISUALS.npc_dev_water_elemental.bodyVfx).toBe('water');
    expect(VISUALS.npc_dev_water_elemental.attach).toBeUndefined();
  });
});
