import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip } from '../scripts/anim/pose_blend.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

describe.each(['storm', 'stone'] as const)('%s rock elemental', (kind) => {
  const title = kind[0].toUpperCase() + kind.slice(1);
  const path = `public/models/creatures/${kind}_elemental_prototype.glb`;
  it('preserves staff-free skin/topology and ships opaque textured rock with Meshopt and KTX2', async () => {
    const root = (await createGlbIO().read(path)).getRoot();
    expect(root.listMeshes()).toHaveLength(1);
    expect(root.listMeshes()[0].listPrimitives()).toHaveLength(1);
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(51);
    const body = root.listMeshes()[0].listPrimitives()[0];
    expect(body.getIndices()?.getCount()).toBe(9712 * 3);
    expect(body.getAttribute('TEXCOORD_0')).not.toBeNull();
    expect(body.getAttribute('WEIGHTS_0')).not.toBeNull();
    const mat = body.getMaterial();
    expect(mat?.getName()).toBe(`${title}Elemental_Rock`);
    expect(mat?.getAlphaMode()).toBe('OPAQUE');
    expect(mat?.getNormalTexture()).not.toBeNull();
    expect(mat?.getRoughnessFactor()).toBe(1);
    expect(mat?.getExtension('KHR_materials_transmission')).toBeNull();
    const bytes = readFileSync(path),
      json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
  });
  it('retains all six complete open-hand clips with finite channels', async () => {
    const root = (await createGlbIO().read(path)).getRoot();
    const source = (
      await createGlbIO().read('public/models/creatures/fire_elemental_prototype.glb')
    ).getRoot();
    expect(
      root
        .listAnimations()
        .map((a) => a.getName())
        .sort(),
    ).toEqual(
      [`${title}_Idle`, `${title}_Move`, 'Cast', 'ChannelStart', 'Channel', 'Death'].sort(),
    );
    for (const animation of root.listAnimations()) {
      const clip = indexClip(root, animation.getName());
      const donor = indexClip(source, animation.getName().replace(`${title}_`, 'Fire_'));
      expect(clip.size).toBe(donor.size);
      for (const [key, channel] of clip) {
        expect([...channel.values].every(Number.isFinite)).toBe(true);
        if (/^f[123][bc]\.r\|rotation$/.test(key))
          expect([...channel.values]).toEqual([...(donor.get(key)?.values ?? [])]);
      }
    }
  });
  it('adds a passive unarmed subject on its own pad without replacing live mobs', () => {
    const id = `dev_${kind}_elemental`;
    expect(DEV_MODEL_LAB_MOBS[id].aggroOnDamageOnly).toBe(true);
    expect(DEV_MODEL_LAB_MOB_LINEUP.filter((m) => m.templateId === id)).toHaveLength(1);
    const key = visualKeyFor({ kind: 'mob', templateId: id } as never);
    expect(key).toBe(`npc_${id}`);
    expect(VISUALS[key].attach).toBeUndefined();
    expect(VISUALS[key].bodyVfx).toBe(kind);
  });
});
