// Owned billboards built inside CharacterVisual's compile gate. No textures,
// lights, timers, global material mutation, or per-frame geometry allocation.
import * as THREE from 'three';
import type { ElementalVfxHandle } from './elemental_body_vfx';
import { SPIRIT_APPEARANCE, type SpiritKind } from './spirit_appearance';

export class SpiritBodyVfx implements ElementalVfxHandle {
  readonly root = new THREE.Group();
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly material: THREE.ShaderMaterial;
  private elapsed = 0;
  private strength = 1;
  private disposed = false;

  constructor(parent: THREE.Object3D, height: number, hover: number, kind: SpiritKind) {
    const ghost = kind === 'ghost';
    this.root.name = 'spirit_body_vfx';
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        clock: { value: 0 },
        strength: { value: 1 },
        tint: { value: new THREE.Color(SPIRIT_APPEARANCE[kind].color) },
        ghost: { value: ghost ? 1 : 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 center = modelViewMatrix * vec4(0., 0., 0., 1.);
          vec2 size = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
          center.xy += position.xy * size;
          gl_Position = projectionMatrix * center;
        }`,
      fragmentShader: `
        uniform float clock;
        uniform float strength;
        uniform float ghost;
        uniform vec3 tint;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3. - 2. * f);
          return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
                     mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
        }
        void main() {
          vec2 q = vUv * 2. - 1.;
          float edge = 1. - smoothstep(.12, 1., length(q));
          float mist = noise(q * 3.5 + vec2(clock * .13, -clock * .19));
          mist = mix(mist, noise(q * 7. + vec2(-clock * .11, clock * .09)), .3);
          float halo = exp(-dot(q, q) * 6.);
          float alpha = (edge * mist * .19 + halo * .07) * strength;
          alpha *= mix(1., .62, ghost);
          gl_FragColor = vec4(tint * 1.25, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 3; i++) {
      const mist = new THREE.Mesh(this.geometry, this.material);
      mist.name = `spirit_mist_${i}`;
      mist.position.set((i - 1) * height * 0.12, hover + height * (0.27 + i * 0.22), 0);
      mist.scale.set(height * (ghost ? 0.72 : 0.8), height * 0.65, 1);
      mist.userData.weaponVfxMesh = true;
      mist.userData.shadowCaster = false;
      this.root.add(mist);
    }
    parent.add(this.root);
  }

  update(dt: number, dead: boolean, visible: boolean, reducedMotion: boolean): void {
    if (this.disposed) return;
    this.strength = dead ? Math.max(0, this.strength - dt * 1.6) : 1;
    if (visible && !reducedMotion) this.elapsed += dt;
    this.root.visible = visible && this.strength > 0;
    this.material.uniforms.clock.value = this.elapsed;
    this.material.uniforms.strength.value = this.strength;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
