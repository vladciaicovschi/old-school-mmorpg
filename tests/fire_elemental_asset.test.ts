import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOB_LINEUP, DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const source = 'public/models/creatures/ignivar_ashcaller.glb';
const file = 'public/models/creatures/fire_elemental_prototype.glb';
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing elemental pose component');
  return value;
}

describe('staff-free fire elemental prototype', () => {
  it('removes only staff geometry and retains the original source and 51-joint rig', async () => {
    expect(createHash('sha256').update(readFileSync(source)).digest('hex')).toBe(
      '0f92aa55d5f031cc2ae1c9368102edde96a3345827592cb3c56351d1b4fd4396',
    );
    const root = (await createGlbIO().read(file)).getRoot();
    expect(root.listMeshes()).toHaveLength(1);
    expect(root.listMeshes()[0].listPrimitives()).toHaveLength(1);
    expect(root.listMeshes()[0].listPrimitives()[0].getIndices()?.getCount()).toBe(9712 * 3);
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(51);
    expect(root.listMaterials()).toHaveLength(1);
    const material = root.listMaterials()[0];
    expect(material.getName()).toBe('FireElemental_Basalt');
    expect(material.getEmissiveTexture()).not.toBeNull();
    expect(material.getBaseColorTexture()).not.toBe(material.getEmissiveTexture());
    expect(material.getMetallicFactor()).toBe(0);
    const bytes = readFileSync(file);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsRequired).toContain('KHR_texture_basisu');
    expect(json.extensionsRequired).not.toContain('KHR_draco_mesh_compression');
    for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
  });

  it('keeps finite, closed locomotion with a relaxed right arm throughout each loop', async () => {
    const root = (await createGlbIO().read(file)).getRoot();
    const rig = createPoseRig(root);
    expect(
      root
        .listAnimations()
        .map((a) => a.getName())
        .sort(),
    ).toEqual(['Fire_Idle', 'Fire_Move', 'Cast', 'ChannelStart', 'Channel', 'Death'].sort());
    for (const name of ['Fire_Idle', 'Fire_Move']) {
      const clip = indexClip(root, name);
      const duration = Math.max(...[...clip.values()].map((c) => c.times.at(-1) ?? 0));
      for (const channel of clip.values()) {
        expect(
          [...channel.values].every(Number.isFinite),
          `${name} ${channel.node.getName()}`,
        ).toBe(true);
      }
      const start = samplePose(clip, 0);
      const end = samplePose(clip, duration);
      for (const [key, value] of start) {
        const other = required(end.get(key));
        if (key.endsWith('|rotation')) {
          expect(Math.abs(value.reduce((sum, v, i) => sum + v * other[i], 0))).toBeCloseTo(1, 3);
        } else
          value.forEach((v, i) => {
            expect(v).toBeCloseTo(other[i], 4);
          });
      }
      for (let i = 0; i <= 8; i++) {
        rig.apply(samplePose(clip, (duration * i) / 8));
        const position = (bone: string) =>
          required(rig.named.get(bone)).getWorldPosition(new Vector3());
        expect(position('hand.r').y).toBeLessThan(position('forearm.r').y - 0.03);
        expect(position('hand.r').y).toBeCloseTo(position('hand.l').y, 1);
      }
    }
  });

  it('adds one passive, unarmed test subject without redirecting the raid model', () => {
    const subject = DEV_MODEL_LAB_MOBS.dev_fire_elemental;
    expect(subject.aggroOnDamageOnly).toBe(true);
    expect(DEV_MODEL_LAB_MOB_LINEUP.filter((e) => e.templateId === subject.id)).toHaveLength(1);
    expect(visualKeyFor({ kind: 'mob', templateId: subject.id } as never)).toBe(
      'npc_dev_fire_elemental',
    );
    expect(VISUALS.npc_dev_fire_elemental.bodyVfx).toBe('fire');
    expect(VISUALS.npc_dev_fire_elemental.attach).toBeUndefined();
    expect(VISUALS.mob_ignivar_heart_of_the_end.url).toBe('models/creatures/ignivar_ashcaller.glb');
  });

  it('opens the former staff fingers in every clip, including casting and death', async () => {
    const root = (await createGlbIO().read(file)).getRoot();
    for (const animation of root.listAnimations()) {
      const clip = indexClip(root, animation.getName());
      for (const finger of ['f1', 'f2', 'f3']) {
        for (const [joint, degrees] of [
          ['b', 6],
          ['c', 4],
        ] as const) {
          const channel = required(clip.get(`${finger}${joint}.r|rotation`));
          const expected = new Quaternion().setFromAxisAngle(
            new Vector3(1, 0, 0),
            (degrees * Math.PI) / 180,
          );
          for (let i = 0; i < channel.values.length; i += 4) {
            const actual = new Quaternion().fromArray(channel.values, i).normalize();
            expect(actual.angleTo(expected), animation.getName()).toBeLessThan(0.001);
          }
        }
      }
    }
  });
});
