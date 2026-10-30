import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import {
  FINGERPRINT_INPUTS,
  sourceFingerprint,
} from '../scripts/assets/wickharbor_vessels/source_contract.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { propPreloadInternalsForTest } from '../src/render/props';
import { WICKHARBOR_ROWBOAT, WICKHARBOR_SAILSHIP } from '../src/sim/wickharbor_vessels';

const root = path.resolve(import.meta.dirname, '..');
const upstream = JSON.parse(
  readFileSync(path.join(root, 'scripts/assets/wickharbor_vessels/upstream.json'), 'utf8'),
);
const refinement = JSON.parse(
  readFileSync(path.join(root, 'scripts/assets/wickharbor_vessels/rig_refinement.json'), 'utf8'),
);
const fingerprint = sourceFingerprint(
  FINGERPRINT_INPUTS.map((name) => [name, readFileSync(path.join(root, name))]),
);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const rows = [
  { kind: 'sailship', key: 'wickSailingShip', profile: WICKHARBOR_SAILSHIP },
  { kind: 'rowboat', key: 'wickRowboat', profile: WICKHARBOR_ROWBOAT },
] as const;

describe('Wickharbor shipping vessels', () => {
  it('uses the accepted modular sailship and the owner-confirmed boats-folder dinghy', () => {
    expect(upstream.sailship.source).toBe(
      'Accepted owner-approved modular sailship, hawse-chain-v20',
    );
    expect(upstream.rowboat.source).toBe(
      'Meshy_AI_Create_a_wooden_raft_which_is_textured_20260105_texture_fbx.zip',
    );
  });

  for (const row of rows) {
    it(`ships ${row.kind} through the manifest and both prop preparation profiles`, async () => {
      const logical = `models/wickharbor_vessels/${row.kind}.glb`;
      expect(propPreloadInternalsForTest.propAssetUrl[row.key]).toBe(`/${logical}`);
      expect(propPreloadInternalsForTest.propAssetYaw(row.key)).toBe(Math.PI / 2);
      expect(propPreloadInternalsForTest.lowTierPropKeys).toContain(row.key);
      for (const standard of [true, false])
        expect(propPreloadInternalsForTest.preloadPropKeys(standard).has(row.key)).toBe(true);
      expect(MEDIA_ASSETS[logical]).toMatch(/^\/media\//);
      const file = path.join(root, 'public', logical);
      const doc = await io.read(file);
      const scene = doc.getRoot().listScenes()[0];
      expect(scene.getExtras().sourceFingerprint).toBe(fingerprint);
      expect(scene.getExtras().sourceSha256).toBe(upstream[row.kind].sourceSha256);
      expect(scene.getExtras().vessel).toBe(row.kind);
      const triangles = doc
        .getRoot()
        .listMeshes()
        .flatMap((m) => m.listPrimitives())
        .reduce((sum, p) => {
          const indices = p.getIndices();
          if (!indices) throw new Error('A vessel primitive requires indexed geometry');
          return sum + indices.getCount() / 3;
        }, 0);
      expect(triangles).toBe(
        row.kind === 'sailship' ? refinement.triangles : upstream.rowboat.triangles,
      );
      if (row.kind === 'sailship') {
        expect(scene.getExtras().rigRevision).toBe(refinement.revision);
        expect(scene.getExtras().rigPatchSha256).toBe(refinement.patchSha256);
      }
      const bounds = getBounds(scene);
      expect(bounds.min[1]).toBeCloseTo(-row.profile.nativeDraft, 2);
      const bytes = readFileSync(file);
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
      expect(json.extensionsUsed).toContain('EXT_meshopt_compression');
      expect(json.extensionsUsed).toContain('KHR_texture_basisu');
      expect(json.extensionsUsed).not.toContain('KHR_draco_mesh_compression');
      expect(json.images.length).toBeGreaterThan(0);
      for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
      if (row.kind === 'rowboat') {
        expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(4.5, 2);
        for (const material of doc.getRoot().listMaterials()) {
          expect(material.getMetallicFactor()).toBe(0);
          expect(material.getRoughnessFactor()).toBeGreaterThanOrEqual(0.95);
          expect(material.getMetallicRoughnessTexture()).toBeNull();
          expect(material.getBaseColorFactor()).toEqual(upstream.rowboat.baseColorFactor);
          expect(material.getNormalScale()).toBeCloseTo(0.25, 5);
        }
        for (const texture of doc.getRoot().listTextures()) {
          const pixels = texture.getImage();
          if (!pixels) throw new Error('A vessel texture requires an embedded image');
          const image = Buffer.from(pixels);
          expect(image.readUInt32LE(20)).toBeLessThanOrEqual(1024);
          expect(image.readUInt32LE(24)).toBeLessThanOrEqual(1024);
        }
      } else {
        const roles = doc
          .getRoot()
          .listNodes()
          .map((n) => n.getExtras().role);
        for (const role of ['hull', 'sails', 'cabin', 'helm']) expect(roles).toContain(role);
        const hullWood = doc
          .getRoot()
          .listMaterials()
          .find((m) => m.getName() === 'Native_Wood_Light_Hull_Tint');
        expect(hullWood?.getNormalScale()).toBeCloseTo(0.25, 5);
      }
    });
  }
});
