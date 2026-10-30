import path from 'node:path';
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { createWaterSurfaceMaterial } from '../src/render/water';
import { applyPhongWaterHullClip } from '../src/render/water_hull_clip';
import { rowboatHullWidth, waterHullContains, waterHullHoles } from '../src/render/water_hull_core';
import { BUILTIN_WORLD, setActiveWorldContent } from '../src/sim/data';
import { WICKHARBOR_VESSELS } from '../src/sim/wickharbor_vessels';
import { waterLevel } from '../src/sim/world';
import { settlementScene } from './helpers/settlement_scene';

afterEach(() => setActiveWorldContent(null));
const wave = () => ({
  uWaveState: { value: new THREE.Texture() },
  uWaveEnabled: { value: 0 },
  uWaveOrigin: { value: new THREE.Vector2() },
  uWaveSize: { value: 1 },
});

describe('water remains outside the rowboat hull', () => {
  it('clips both overlapping shader sheets and their undersides before surface shading', () => {
    for (const underside of [false, true]) {
      const material = createWaterSurfaceMaterial(wave(), { underside });
      expect(material.fragmentShader).toContain('clipWaterHulls(vWPos);');
      expect(material.fragmentShader.indexOf('clipWaterHulls(vWPos);')).toBeLessThan(
        material.fragmentShader.indexOf('float camDist'),
      );
      expect(material.uniforms.uWaterHullPose.value).toHaveLength(2);
      material.dispose();
    }
  });
  it('applies the same clipping to the low tier Phong water', () => {
    const material = new THREE.MeshPhongMaterial();
    applyPhongWaterHullClip(material);
    const shader = {
      vertexShader: THREE.ShaderLib.phong.vertexShader,
      fragmentShader: THREE.ShaderLib.phong.fragmentShader,
      uniforms: {},
    };
    material.onBeforeCompile(
      shader as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    expect(shader.fragmentShader).toContain('clipWaterHulls(vWPos);');
    expect(shader.vertexShader).toContain('vWPos=(modelMatrix*vec4(transformed,1.0)).xyz;');
    expect(material.customProgramCacheKey()).toContain('rowboat-hulls-v1:2');
    material.dispose();
  });
  it('follows placement rotation, scale, draft and displaced water height, leaving the hauled-out boat alone', () => {
    const holes = waterHullHoles(WICKHARBOR_VESSELS);
    expect(holes).toHaveLength(2);
    for (const hole of holes) {
      expect(waterHullContains(hole, hole.x, waterLevel(), hole.z, waterLevel())).toBe(true);
      for (const nativeY of [0.2, 0.3, 0.45, 0.8, 1.3]) {
        const width = rowboatHullWidth(nativeY, 0),
          y = waterLevel() - hole.draft + nativeY * hole.scale;
        const point = (x: number, z: number) => ({
          x: hole.x + (x * hole.cosine + z * hole.sine) * hole.scale,
          z: hole.z + (-x * hole.sine + z * hole.cosine) * hole.scale,
        });
        const inside = point(width - 0.01, 0),
          outside = point(width + 0.03, 0),
          bow = point(0, 2.3);
        expect(waterHullContains(hole, inside.x, y, inside.z, waterLevel())).toBe(true);
        expect(waterHullContains(hole, outside.x, y, outside.z, waterLevel())).toBe(false);
        expect(waterHullContains(hole, bow.x, y, bow.z, waterLevel())).toBe(false);
      }
    }
    expect(rowboatHullWidth(0.3, 0)).toBeGreaterThan(rowboatHullWidth(0.2, 0));
  });
  it('does not punch holes into a custom world without these floating boats', () => {
    setActiveWorldContent({ ...BUILTIN_WORLD, props: { ...BUILTIN_WORLD.props, decorProps: [] } });
    const material = createWaterSurfaceMaterial(wave());
    expect(material.fragmentShader).not.toContain('clipWaterHulls');
    expect(material.uniforms.uWaterHullPose).toBeUndefined();
    const phong = new THREE.MeshPhongMaterial(),
      original = phong.onBeforeCompile;
    applyPhongWaterHullClip(phong);
    expect(phong.onBeforeCompile).toBe(original);
  });
  it('covers the actual shipping model interior with its boundary inside the solid planks', async () => {
    const boat = await settlementScene(
      path.resolve('public/models/wickharbor_vessels/rowboat.glb'),
    );
    boat.rotation.y = Math.PI / 2;
    boat.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(boat);
    const frame = new THREE.Group();
    boat.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    frame.add(boat);
    frame.traverse((o) => {
      if (o instanceof THREE.Mesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          m.side = THREE.DoubleSide;
    });
    frame.updateWorldMatrix(true, true);
    for (const y of [0.201887, 0.25, 0.3, 0.35, 0.4, 0.45])
      for (const z of [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5])
        for (const sign of [-1, 1]) {
          const hits = new THREE.Raycaster(
            new THREE.Vector3(0, y, z),
            new THREE.Vector3(sign, 0, 0),
            0,
            1,
          ).intersectObject(frame, true);
          if (hits.length < 2) continue;
          const inner = hits[0].distance,
            outer = hits.at(-1)?.distance ?? inner,
            width = rowboatHullWidth(y, z);
          expect(width, JSON.stringify({ y, z, sign, inner, outer })).toBeGreaterThanOrEqual(
            inner - 0.008,
          );
          expect(width, JSON.stringify({ y, z, sign, inner, outer })).toBeLessThanOrEqual(
            outer + 0.015,
          );
        }
  });
});
