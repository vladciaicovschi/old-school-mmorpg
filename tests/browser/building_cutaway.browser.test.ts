import { page } from '@vitest/browser/context';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildingCutaway } from '../../src/render/building_cutaway';

// A deterministic rendering fixture, not a full-game capture or FPS benchmark.
describe('selective cutaway on a real WebGL driver', () => {
  for (const [width, height] of [
    [800, 600],
    [420, 760],
  ])
    it(`reveals the indoor character at ${width}x${height} without ghost walls or new programs`, async () => {
      await page.viewport(width, height);
      const canvas = document.createElement('canvas');
      document.body.appendChild(canvas);
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(1);
      renderer.setSize(width - 24, height - 40);
      renderer.debug.checkShaderErrors = true;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#9baaa3');
      const camera = new THREE.PerspectiveCamera(42, (width - 24) / (height - 40), 0.1, 100);
      camera.position.set(0, 6, 13);
      camera.lookAt(0, 1.7, 0);
      const shell = new THREE.Group();
      shell.userData = {
        footprint: { width: 6, depth: 8 },
        facades: [{ level: 0 }],
        storeyHeight: 3,
      };
      const wall = new THREE.MeshBasicMaterial({ color: '#967956' }),
        roof = new THREE.MeshBasicMaterial({ color: '#805442' }),
        floor = new THREE.MeshBasicMaterial({ color: '#66513b' });
      for (const [w, h, d, x, y, z] of [
        [6, 3, 0.2, 0, 1.5, 4],
        [6, 3, 0.2, 0, 1.5, -4],
        [0.2, 3, 8, 3, 1.5, 0],
        [0.2, 3, 8, -3, 1.5, 0],
      ]) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
        mesh.position.set(x, y, z);
        shell.add(mesh);
      }
      const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 0.04, 8), floor);
      shell.add(floorMesh);
      const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, 8), roof);
      roofMesh.position.y = 3.4;
      roofMesh.userData.role = 'roof';
      shell.add(roofMesh);
      scene.add(shell);
      const character = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.28, 2.04, 5, 10),
        new THREE.MeshBasicMaterial({ color: '#23ff4b' }),
      );
      character.position.set(0, 1.3, 0);
      scene.add(character);
      const view = buildingCutaway();
      try {
        // The previous whole-shell appearance, included only as a visual control.
        for (const material of [wall, roof]) {
          material.transparent = true;
          material.opacity = 0.2;
          material.needsUpdate = true;
        }
        await renderer.compileAsync(scene, camera);
        renderer.render(scene, camera);
        await page.screenshot({
          path: `../../docs/screenshots/building-cutaway/before-${width}x${height}.png`,
        });
        for (const material of [wall, roof]) {
          material.transparent = false;
          material.opacity = 1;
          material.needsUpdate = true;
        }
        await renderer.compileAsync(scene, camera);
        renderer.render(scene, camera);
        const programs = renderer.info.programs!.length;
        view.register(shell, {
          x: 0,
          z: 0,
          halfWidth: 3,
          halfDepth: 4,
          cosine: 1,
          sine: 0,
          topY: 4,
          cullRadius: 6,
        });
        view.update(camera.position, new THREE.Vector3(0, 1.7, 0), 0.016);
        renderer.render(scene, camera);
        expect(renderer.info.programs!.length).toBe(programs);
        const gl = renderer.getContext(),
          pixels = new Uint8Array((width - 24) * (height - 40) * 4);
        gl.readPixels(0, 0, width - 24, height - 40, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        expect(gl.getError()).toBe(gl.NO_ERROR);
        let green = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] < 100 && pixels[i + 1] > 180 && pixels[i + 2] < 140) green++;
        expect(green).toBeGreaterThan(80);
        shell.visible = false;
        renderer.render(scene, camera);
        gl.readPixels(0, 0, width - 24, height - 40, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let unobstructed = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] < 100 && pixels[i + 1] > 180 && pixels[i + 2] < 140) unobstructed++;
        shell.visible = true;
        renderer.render(scene, camera);
        expect(green).toBeGreaterThanOrEqual(unobstructed * 0.97);
        let back = 0,
          cut = 0;
        shell.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          if (o.userData.cutawayHidden) cut++;
          if (o.userData.cutawayPart?.includes(':wall:back:')) {
            expect((o.material as THREE.Material).colorWrite).toBe(true);
            back++;
          }
          expect((o.material as THREE.Material).opacity).toBe(1);
          expect((o.material as THREE.Material).transparent).toBe(false);
        });
        expect(back).toBeGreaterThan(0);
        expect(cut).toBeGreaterThan(0);
        await page.screenshot({
          path: `../../docs/screenshots/building-cutaway/after-${width}x${height}.png`,
        });
      } finally {
        view.dispose();
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            for (const material of Array.isArray(o.material) ? o.material : [o.material])
              material.dispose();
          }
        });
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      }
    });
});
