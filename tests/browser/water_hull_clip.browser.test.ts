import { page } from '@vitest/browser/context';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWaterSurfaceMaterial } from '../../src/render/water';
import { applyPhongWaterHullClip } from '../../src/render/water_hull_clip';
import { WICKHARBOR_VESSELS } from '../../src/sim/wickharbor_vessels';
import { waterLevel } from '../../src/sim/world';

describe('dry boat interior on the real water shaders', () => {
  for (const tier of ['shader', 'phong'] as const)
    it(`${tier}: dry floor inside, sea outside`, async () => {
      await page.viewport(800, 600);
      const canvas = document.createElement('canvas');
      document.body.appendChild(canvas);
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        preserveDrawingBuffer: true,
      });
      renderer.setSize(512, 512);
      renderer.setPixelRatio(1);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      scene.fog = new THREE.Fog(0x7a9ab0, 50, 1000);
      const boat = WICKHARBOR_VESSELS.find((p) => p.key === 'wickRowboat' && p.float !== undefined);
      if (!boat) throw new Error('Floating boat missing');
      const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 40);
      camera.position.set(boat.x, 10, boat.z);
      camera.up.set(0, 0, -1);
      camera.lookAt(boat.x, waterLevel(), boat.z);
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
      );
      floor.position.set(boat.x, waterLevel() - 0.6, boat.z);
      scene.add(floor);
      const texture = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
      texture.needsUpdate = true;
      let material: THREE.ShaderMaterial | THREE.MeshPhongMaterial;
      if (tier === 'shader') {
        material = createWaterSurfaceMaterial({
          uWaveState: { value: texture },
          uWaveEnabled: { value: 0 },
          uWaveOrigin: { value: new THREE.Vector2() },
          uWaveSize: { value: 1 },
        });
        for (const key of ['uNorm1', 'uNorm2', 'uNorm3']) material.uniforms[key].value = texture;
        material.uniforms.uSwellAmp.value = 0;
      } else {
        material = new THREE.MeshPhongMaterial({ color: 0x2255ff, transparent: true, opacity: 1 });
        applyPhongWaterHullClip(material);
        scene.add(new THREE.AmbientLight(0xffffff, 2));
      }
      const geometry = new THREE.PlaneGeometry(12, 12, 4, 4).rotateX(-Math.PI / 2),
        count = geometry.getAttribute('position').count;
      for (const [name, value] of [
        ['aShoreDepth', 4],
        ['aShoreSlope', 1],
        ['aSwellW', 0],
        ['aSwellGate', 0],
      ] as const)
        geometry.setAttribute(
          name,
          new THREE.Float32BufferAttribute(new Float32Array(count).fill(value), 1),
        );
      const surface = new THREE.Mesh(geometry, material);
      surface.position.set(boat.x, waterLevel(), boat.z);
      scene.add(surface);
      try {
        await renderer.compileAsync(scene, camera);
        renderer.render(scene, camera);
        const gl = renderer.getContext(),
          pixel = new Uint8Array(4);
        const sample = (x: number, y: number) => {
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          return [...pixel];
        };
        const inside = sample(256, 256),
          outside = sample(440, 256);
        expect(gl.getError()).toBe(gl.NO_ERROR);
        expect(inside[1]).toBeGreaterThan(220);
        expect(inside[0]).toBeLessThan(20);
        expect(inside[2]).toBeLessThan(20);
        expect(outside[2]).toBeGreaterThan(outside[1]);
        await page.screenshot({
          path: `../../docs/screenshots/rowboat-water/${tier}-dry-interior.png`,
        });
      } finally {
        geometry.dispose();
        material.dispose();
        floor.geometry.dispose();
        (floor.material as THREE.Material).dispose();
        texture.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      }
    });
});
