import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_COMPARISONS } from '../src/sim/content/dev_model_comparisons';
import { MOBS } from '../src/sim/data';

const WISPS = {
  glimmerwisp: 'mob_glimmerwisp',
  duskwisp: 'mob_duskwisp',
  ice_wisp: 'mob_ice_wisp',
  lily_wisp: 'mob_lily_wisp',
  gale_wisp: 'mob_gale_wisp',
};

describe('community ghost and unrigged wisp replacement', () => {
  it('replaces every actual wisp explicitly and preserves unrelated families', () => {
    const actual = Object.values(MOBS).filter(
      (m) => !m.id.startsWith('dev_') && /wisp/i.test(m.name),
    );
    expect(actual.map((m) => m.id).sort()).toEqual(Object.keys(WISPS).sort());
    for (const [id, key] of Object.entries(WISPS)) {
      expect(visualKeyFor({ kind: 'mob', templateId: id } as never)).toBe(key);
      expect(VISUALS[key].url).toBe('models/creatures/community_wisp.glb');
      expect(VISUALS[key].spirit).toBeDefined();
      expect(VISUALS[key].atlasDye?.rules).toHaveLength(1);
      expect(MOBS[id].petSpell).toBeUndefined();
    }
    expect(new Set(Object.values(WISPS).map((k) => VISUALS[k].spirit)).size).toBe(5);
    expect(MOBS.duskwisp.venom).toMatchObject({
      chance: 0.25,
      perTick: 4,
      interval: 2,
      duration: 8,
    });
    expect(visualKeyFor({ kind: 'mob', templateId: 'reliquary_ledger_wraith' } as never)).toBe(
      'delve_skel_wraith',
    );
    expect(VISUALS.delve_skel_wraith.url).toBe('models/creatures/community_ghost.glb');
    expect(VISUALS.mob_ghost.url).toBe(VISUALS.delve_skel_wraith.url);
    expect(VISUALS.mob_choir_thrall.url).toBe('models/creatures/ghost.glb');
    expect(MOBS.reliquary_ledger_wraith.petSpell).toBeUndefined();
  });

  it('shows the ghost, Ledger and all wisp variants as installed on the island', () => {
    for (const id of ['ghost', 'delve_skel_wraith', ...Object.keys(WISPS)]) {
      expect(DEV_MODEL_COMPARISONS.find((r) => r.id === id)).toMatchObject({ installed: true });
    }
  });

  it.each(['community_ghost', 'community_wisp'])('%s ships only Meshopt and KTX2', (name) => {
    const bytes = readFileSync(`public/models/creatures/${name}.glb`);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    expect(json.extensionsUsed).not.toContain('KHR_draco_mesh_compression');
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
    for (const node of json.nodes.filter((n: { mesh?: number }) => n.mesh !== undefined)) {
      expect(node.extras?.shadowCaster).toBe(false);
    }
  });

  it('keeps the wisp unrigged with an affordable mesh and real one-shot motion', async () => {
    const root = (await createGlbIO().read('public/models/creatures/community_wisp.glb')).getRoot();
    expect(root.listSkins()).toHaveLength(0);
    expect(root.listMeshes()[0].listPrimitives()[0].getIndices()?.getCount()).toBeLessThanOrEqual(
      72000,
    );
    expect(
      root
        .listAnimations()
        .map((a) => a.getName())
        .sort(),
    ).toEqual(['Wisp_Idle', 'Wisp_Move', 'Wisp_Attack', 'Wisp_Hit', 'Wisp_Death'].sort());
    const death = indexClip(root, 'Wisp_Death');
    const scales = [...death.entries()].filter(([, channel]) => channel.path === 'scale');
    expect(scales).toHaveLength(1);
    expect(Math.max(...samplePose(death, 1.2).get(scales[0][0])!)).toBeLessThan(0.04);
    for (const name of ['Wisp_Idle', 'Wisp_Move']) {
      const clip = indexClip(root, name);
      const duration = Math.max(...[...clip.values()].map((s) => s.times.at(-1) ?? 0));
      const first = samplePose(clip, 0),
        last = samplePose(clip, duration);
      for (const [key, a] of first)
        for (let i = 0; i < a.length; i++) expect(last.get(key)![i]).toBeCloseTo(a[i], 4);
    }
  });

  it('preserves ghost topology and lower-body locals while animating both arms', async () => {
    const root = (
      await createGlbIO().read('public/models/creatures/community_ghost.glb')
    ).getRoot();
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(68);
    expect(root.listMeshes()[0].listPrimitives()[0].getIndices()?.getCount()).toBe(103127 * 3);
    expect(
      root
        .listNodes()
        .find((n) => n.getMesh())
        ?.getExtras().source_sha256,
    ).toBe('f54059d80edc05c036dea96cdf855b09cb13c45591a415809c65c78ffed3d8f2');
    const names = new Set(root.listNodes().map((n) => n.getName()));
    for (const animation of root.listAnimations()) {
      for (const channel of animation.listChannels()) {
        expect(names.has(channel.getTargetNode()!.getName())).toBe(true);
        const bone = channel.getTargetNode()!.getName();
        if (!/^Bone_00[1-9]$|^Bone_010$/.test(bone)) continue;
        const values = channel.getSampler()!.getOutput()!;
        const width = values.getElementSize();
        const a = values.getArray()!;
        for (let i = width; i < a.length; i++) expect(a[i]).toBeCloseTo(a[i % width], 5);
      }
    }
    const attack = root.listAnimations().find((a) => a.getName() === 'Ghost_Attack')!;
    expect(attack).toBeDefined();
    const active = attack.listChannels().filter((c) => {
      const values = c.getSampler()!.getOutput()!,
        a = values.getArray()!,
        width = values.getElementSize();
      return [...a].some((v, i) => Math.abs(v - a[i % width]) > 0.03);
    });
    expect(active.length).toBeGreaterThan(3);
  });
});
