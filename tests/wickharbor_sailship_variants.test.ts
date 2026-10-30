import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, type Node, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  VARIANT_FINGERPRINT_INPUTS,
  variantFingerprint,
} from '../scripts/assets/wickharbor_vessels/variant_contract.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { propPreloadInternalsForTest } from '../src/render/props';
import { WICKHARBOR_SAILSHIP_KEYS, wickharborShipProfile } from '../src/sim/wickharbor_vessels';

const root = path.resolve(import.meta.dirname, '..');
const loadJson = (relative: string) => JSON.parse(readFileSync(path.join(root, relative), 'utf8'));
const config = loadJson('scripts/assets/wickharbor_vessels/sailship_variants.json');
const fleet = loadJson('scripts/assets/wickharbor_vessels/fleet_compositions.json');
const rigs = loadJson('scripts/assets/wickharbor_vessels/fleet_rigs.json');
const sources = loadJson('scripts/assets/wickharbor_vessels/variant_sources.json');
const upstream = loadJson('scripts/assets/wickharbor_vessels/upstream.json');
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const fingerprint = variantFingerprint(
  VARIANT_FINGERPRINT_INPUTS.map((name) => [name, readFileSync(path.join(root, name))] as const),
);

function meshSignature(node: Node): string[] {
  return (
    node
      .getMesh()
      ?.listPrimitives()
      .map((primitive) => {
        const hash = createHash('sha256');
        for (const accessor of [primitive.getIndices(), ...primitive.listAttributes()]) {
          const array = accessor?.getArray();
          if (!array) throw new Error('Missing vessel geometry');
          hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
        }
        return hash.digest('hex');
      })
      .sort() ?? []
  );
}

describe('Wickharbor sailship cosmetic derivatives', () => {
  it('uses distinct muted palettes, rail combinations and cargo manifests', () => {
    expect(sources.acceptedBlendSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(config.variants.map((v: { key: string }) => v.key)).toEqual(
      WICKHARBOR_SAILSHIP_KEYS.slice(1, 4),
    );
    for (const field of ['sailTint', 'cargo']) {
      expect(
        new Set(config.variants.map((v: Record<string, unknown>) => JSON.stringify(v[field]))).size,
      ).toBe(3);
    }
    expect(
      config.variants.map((v: { foreRail: string; aftRail: string }) => [v.foreRail, v.aftRail]),
    ).toEqual([
      ['simple', 'simple'],
      ['cross', 'cross'],
      ['simple', 'simple'],
    ]);
    for (const source of sources.variants) {
      expect(source.retainedPosts).toBe(8);
      expect(source.foreRail).toBe(source.aftRail);
      const panel =
        source.foreRail === 'simple' ? 'Balcony_Simple_Straight' : 'Balcony_Cross_Straight';
      expect(source.panelSourcesByZone).toEqual({ fore: [panel], aft: [panel] });
      for (const item of source.cargo) {
        expect(item.routeClearanceM).toBeGreaterThan(0.3);
        expect(item.min[2]).toBeCloseTo(3.43, 4);
        expect(item.max[0] < -1.8 || item.min[0] > 7.1).toBe(true);
      }
    }
  });

  it('uses every registered ship exactly once and checks both approved rigs', () => {
    expect(fleet.ships.map((s: { key: string }) => s.key)).toEqual([...WICKHARBOR_SAILSHIP_KEYS]);
    for (const rig of rigs.rigs) {
      expect(rig.checks.canvasCount).toBe(rig.id === 'ketch' ? 4 : 7);
      expect(rig.checks.canvasIntersections).toEqual([]);
      expect(rig.checks.ropeIntersections).toEqual([]);
      expect(rig.checks.minimumCrewHeadGapM).toBeGreaterThan(0.12);
      expect(rig.checks.foredeckClearPoses).toBeGreaterThan(100);
      expect(rig.checks.helmClear).toBe(true);
    }
  });

  it('keeps shared rig geometry and uniform railing patches identical across colors', async () => {
    const load = (file: string) =>
      io.read(path.join(root, `public/models/wickharbor_vessels/${file}.glb`));
    for (const [first, second, roles] of [
      ['ketch-blue', 'ketch-ochre', ['masts', 'rigging', 'sails', 'fittings', 'framing']],
      ['brig', 'sailship-ochre', ['masts', 'rigging', 'sails', 'fittings', 'framing']],
      ['sailship-blue', 'ketch-blue', ['railings']],
      ['sailship-ochre', 'ketch-ochre', ['railings']],
      ['sailship', 'brig', ['railings']],
    ] as const) {
      const a = await load(first),
        b = await load(second);
      for (const role of roles) {
        const na = a
          .getRoot()
          .listNodes()
          .find((n) => n.getExtras().role === role);
        const nb = b
          .getRoot()
          .listNodes()
          .find((n) => n.getExtras().role === role);
        if (!na || !nb) throw new Error(`Missing shared ${role}`);
        expect(meshSignature(na), `${first}/${second}: ${role}`).toEqual(meshSignature(nb));
      }
    }
  });

  for (const variant of fleet.ships.filter((s: { id: string }) => s.id !== 'linen')) {
    it(`${variant.id} preserves accepted geometry and ships through both preload profiles`, async () => {
      const logical = `models/wickharbor_vessels/${variant.file}.glb`;
      expect(propPreloadInternalsForTest.propAssetUrl[variant.key]).toBe(`/${logical}`);
      expect(propPreloadInternalsForTest.propAssetYaw(variant.key)).toBe(Math.PI / 2);
      expect(propPreloadInternalsForTest.lowTierPropKeys).toContain(variant.key);
      for (const standard of [false, true])
        expect(propPreloadInternalsForTest.preloadPropKeys(standard).has(variant.key)).toBe(true);
      expect(MEDIA_ASSETS[logical as keyof typeof MEDIA_ASSETS]).toMatch(/^\/media\//);
      const base = await io.read(path.join(root, 'public/models/wickharbor_vessels/sailship.glb'));
      const file = path.join(root, 'public', logical);
      const doc = await io.read(file);
      const scene = doc.getRoot().listScenes()[0];
      const style = config.variants.find((v: { id: string }) => v.id === variant.style);
      const source = sources.variants.find((v: { id: string }) => v.id === variant.id);
      expect(scene.getExtras()).toMatchObject({
        variant: variant.id,
        sourceSha256: upstream.sailship.sourceSha256,
        sourceFingerprint: fingerprint,
        patchSha256: source.patchSha256,
        foreRail: source.foreRail,
        aftRail: source.aftRail,
        panelSourcesByZone: source.panelSourcesByZone,
        cargoSources: style?.cargo.map((v: unknown[]) => v[1]) ?? ['accepted-v20'],
        draftM: upstream.sailship.draftM,
        rigType: variant.rig,
        rigRevision: variant.rig === 'brigantine' ? 'rig-refinement-v21' : 'fleet-rigs-v1',
      });
      if (variant.rig !== 'brigantine') {
        const rig = rigs.rigs.find((row: { id: string }) => row.id === variant.rig);
        expect(scene.getExtras()).toMatchObject({
          rigPatchSha256: rig.patchSha256,
          rigChecks: rig.checks,
        });
        for (const role of rig.roles) {
          const node = doc
            .getRoot()
            .listNodes()
            .find((n) => n.getExtras().role === role);
          expect(
            node
              ?.getMesh()
              ?.listPrimitives()
              .reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? 0) / 3, 0),
            role,
          ).toBe(rig.roleTriangles[role]);
        }
      }
      const bounds = getBounds(scene);
      expect(bounds.min[1]).toBeCloseTo(-wickharborShipProfile(variant.key).nativeDraft, 3);
      expect(bounds.max[1]).toBeCloseTo(wickharborShipProfile(variant.key).mastHeightAboveWater, 2);
      const nodes = doc.getRoot().listNodes();
      for (const original of base.getRoot().listNodes()) {
        const role = original.getExtras().role;
        if (
          !role ||
          [
            'cargo',
            'railings',
            ...(variant.rig === 'brigantine'
              ? []
              : ['masts', 'rigging', 'sails', 'fittings', 'framing']),
          ].includes(role as string)
        )
          continue;
        const replacement = nodes.find((node) => node.getExtras().role === role);
        expect(replacement, `Missing accepted ${role}`).toBeDefined();
        if (!replacement) throw new Error('Missing accepted role');
        expect(replacement.getMatrix()).toEqual(original.getMatrix());
        expect(meshSignature(replacement), `Changed accepted ${role} geometry`).toEqual(
          meshSignature(original),
        );
      }
      const hull = nodes.find((n) => n.getExtras().role === 'hull');
      if (!hull) throw new Error('Missing hull');
      const hb = getBounds(hull),
        center = (bounds.min[0] + bounds.max[0]) / 2;
      expect(
        Math.max(Math.abs(hb.min[0] - center), Math.abs(hb.max[0] - center)),
      ).toBeLessThanOrEqual(wickharborShipProfile(variant.key).hullHalfDepth);
      const sails = nodes.find((n) => n.getExtras().role === 'sails');
      if (!sails) throw new Error('Missing sails');
      const cloth = sails
        .getMesh()
        ?.listPrimitives()
        .filter((p) => p.getMaterial()?.getName() === 'Native_Light_Linen');
      const foredeckHeights: number[] = [];
      const sailMatrix = new Matrix4().fromArray(sails.getWorldMatrix());
      for (const p of cloth ?? []) {
        const position = p.getAttribute('POSITION');
        if (!position) throw new Error('Missing cloth vertices');
        const v: number[] = [];
        for (let i = 0; i < position.getCount(); i++) {
          position.getElement(i, v);
          const world = new Vector3(v[0], v[1], v[2]).applyMatrix4(sailMatrix);
          if (world.x >= -6.6 && world.x <= -1.8 && Math.abs(world.z) < 0.25)
            foredeckHeights.push(world.y);
        }
      }
      expect(foredeckHeights.length).toBeGreaterThan(20);
      expect(Math.min(...foredeckHeights)).toBeGreaterThan(3.42 + 1.8 + 0.12);
      const linen = doc
        .getRoot()
        .listMaterials()
        .find((m) => m.getName() === 'Native_Light_Linen');
      expect(linen?.getBaseColorFactor()).toEqual(style?.sailTint ?? [1, 1, 1, 1]);
      expect(linen?.getBaseColorTexture()).not.toBeNull();
      expect(linen?.getNormalScale()).toBeCloseTo(0.45, 5);
      const triangleCount = doc
        .getRoot()
        .listMeshes()
        .flatMap((m) => m.listPrimitives())
        .reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? 0) / 3, 0);
      expect(triangleCount).toBe(source.triangles);
      const bytes = readFileSync(file);
      expect(bytes.length).toBeLessThan(12 * 1024 * 1024);
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
      expect(json.extensionsUsed).toContain('EXT_meshopt_compression');
      expect(json.extensionsUsed).toContain('KHR_texture_basisu');
      expect(json.extensionsUsed).not.toContain('KHR_draco_mesh_compression');
      expect(json.images.length).toBeGreaterThan(0);
      for (const image of json.images) expect(image.mimeType).toBe('image/ktx2');
      const textures = doc.getRoot().listTextures();
      const names = textures.map((texture) => texture.getName());
      expect(new Set(names).size, 'Do not duplicate pack atlas maps').toBe(names.length);
      const acceptedMaps = new Set(
        base
          .getRoot()
          .listTextures()
          .map((texture) => texture.getName()),
      );
      for (const texture of doc.getRoot().listTextures()) {
        const image = Buffer.from(texture.getImage() ?? []);
        const cap = acceptedMaps.has(texture.getName()) ? 2048 : 1024;
        expect(image.readUInt32LE(20)).toBeLessThanOrEqual(cap);
        expect(image.readUInt32LE(24)).toBeLessThanOrEqual(cap);
      }
    });
  }
});
