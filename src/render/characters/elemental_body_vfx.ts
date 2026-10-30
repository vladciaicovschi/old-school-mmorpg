// Owned, texture-free elemental effects attached before the visual compile gate.
// No point lights, shared material writes, or per-frame geometry allocation.
import * as THREE from 'three';
import { ELEMENTAL_CORE_COLORS, ElementalHelmetGlow } from './elemental_helmet_glow';
import { StormBodyVfx } from './storm_body_vfx';

const vertexShader = `
  uniform float cold;
  uniform float flow;
  uniform float dust;
  varying vec2 flameUv;
  void main() {
    flameUv = uv;
    vec4 center = modelViewMatrix * vec4(0., 0., 0., 1.);
    vec2 scale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
    center.xy += vec2(position.x, position.y + ((cold > .5 || flow > .5 || dust > .5) ? 0. : .27)) * scale;
    gl_Position = projectionMatrix * center;
  }
`;
const fragmentShader = `
  uniform float clock;
  uniform float strength;
  uniform float seed;
  uniform float cold;
  uniform float flow;
  uniform float dust;
  varying vec2 flameUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
      mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
  }
  void main() {
    vec2 p = flameUv;
    if (cold > .5 || flow > .5 || dust > .5) {
      vec2 q = p * 2. - 1.;
      float fog = noise(q * 3. + vec2(clock * .22 + seed, -clock * .16));
      fog = mix(fog, noise(q * 6. + vec2(-clock * .3, seed)), .35);
      float edge = 1. - smoothstep(.15, 1., length(q * vec2(1., .85)));
      vec3 tint = dust > .5 ? vec3(.42, .38, .29) : (flow > .5 ? vec3(.32, .66, .77) : vec3(.48, .76, .96));
      gl_FragColor = vec4(tint, pow(fog, .9) * edge * strength * (dust > .5 ? .3 : flow > .5 ? .38 : .58));
    } else {
    float flicker = noise(vec2(p.x * 6. + seed, p.y * 5. - clock * 2.8));
    float x = p.x - .5 + sin(p.y * 9. - clock * 4. + seed) * .065 * p.y;
    float width = (.48 - p.y * .39) * (.78 + flicker * .22);
    float edge = 1. - smoothstep(width * .3, width, abs(x));
    float alpha = edge * smoothstep(0., .14, p.y) * (1. - smoothstep(.55, 1., p.y));
    alpha *= smoothstep(.2, .7, flicker + (1. - p.y) * .3);
    vec3 color = mix(vec3(1., .025, .001), vec3(1., .32, .018), edge * (1. - p.y));
    gl_FragColor = vec4(color, alpha * strength * .85);
    }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class ElementalBodyVfx {
  readonly root = new THREE.Group();
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly flames: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  private readonly embers: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly helmet: ElementalHelmetGlow;
  private elapsed = 0;
  private strength = 1;
  private disposed = false;

  constructor(model: THREE.Object3D, element: 'fire' | 'ice' | 'water' | 'stone' = 'fire') {
    const cold = element === 'ice' ? 1 : 0;
    const flow = element === 'water' ? 1 : 0;
    const dust = element === 'stone' ? 1 : 0;
    this.helmet = new ElementalHelmetGlow(model, ELEMENTAL_CORE_COLORS[element]);
    this.root.name = 'elemental_body_vfx';
    // Parent each billboard directly to its animated bone. The shader faces the
    // camera while preserving the model's authored size through normalization.
    const sockets = [
      ['vfx_core', 0.19, 0.32],
      ['head', 0.18, 0.31],
      ['hand.l', 0.12, 0.24],
      ['vfx_hand.r', 0.12, 0.24],
      ['hips', 0.21, 0.35],
      ['upperarm.l', 0.16, 0.3],
      ['upperarm.r', 0.16, 0.3],
      ['rock_low1', 0.14, 0.26],
      ['rock_low11', 0.14, 0.26],
    ] as const;
    for (const [i, [name, width, height]] of sockets.entries()) {
      const parent =
        model.getObjectByName(name) ?? model.getObjectByName(name.replace(/[[\].:/]/g, ''));
      if (!parent) continue;
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          clock: { value: 0 },
          strength: { value: 1 },
          seed: { value: i * 2.7 },
          cold: { value: cold },
          flow: { value: flow },
          dust: { value: dust },
        },
        transparent: true,
        blending: cold || flow || dust ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const flame = new THREE.Mesh(this.geometry, material);
      flame.name = `elemental_${dust ? 'dust' : (flow || cold) ? 'mist' : 'flame'}_${name}`;
      flame.scale.set(
        width * (dust ? 1.4 : cold ? 2.6 : flow ? 2.5 : 1.25),
        height * (dust ? 0.7 : cold ? 1.3 : flow ? 1.2 : 1.25),
        1,
      );
      flame.frustumCulled = false;
      // Existing contract excludes owned VFX from tint and shadow sweeps.
      flame.userData.weaponVfxMesh = true;
      parent.add(flame);
      this.flames.push(flame);
    }
    const count = cold ? 112 : flow ? 24 : dust ? 24 : 128;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = Math.sin(i * 2.399) * (0.26 + (i % 7) * 0.025);
      positions[i * 3 + 1] = i / count;
      positions[i * 3 + 2] = Math.cos(i * 2.399) * (0.2 + (i % 5) * 0.025);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.embers = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: {
          clock: { value: 0 },
          strength: { value: 1 },
          cold: { value: cold },
          flow: { value: flow },
          dust: { value: dust },
        },
        vertexShader: `
        uniform float clock;
        uniform float cold;
        uniform float flow;
        uniform float dust;
        varying float life;
        void main() {
          life = fract(position.y + clock * .28);
          vec3 p = vec3(position.x + sin(clock + position.y * 21.) * .08, life * 1.25 - .45, position.z);
          if (cold > .5) {
            life = fract(position.y + clock * .13);
            p = vec3(position.x + sin(clock * .45 + position.y * 21.) * .09, (1. - life) * 1.25 - .55, position.z);
          }
          if (flow > .5) {
            life = fract(position.y + clock * .16);
            p = vec3(position.x + sin(clock * .35 + position.y * 21.) * .05, (1. - life) * .95 - .45, position.z);
          }
          if (dust > .5) {
            life = fract(position.y + clock * .32);
            float angle = position.y * 35. + clock * .25;
            float radius = .18 + life * .3;
            p = vec3(cos(angle) * radius, .05 + sin(life * 3.14159) * .25 - life * .45, sin(angle) * radius);
          }
          vec4 view = modelViewMatrix * vec4(p, 1.);
          gl_PointSize = clamp((flow > .5 ? 14. : cold > .5 ? 24. : dust > .5 ? 24. : 28.) / max(.5, -view.z), 2., 8.);
          gl_Position = projectionMatrix * view;
        }
      `,
        fragmentShader: `
        uniform float strength;
        uniform float cold;
        uniform float flow;
        uniform float dust;
        varying float life;
        void main() {
          float a = (1. - smoothstep(.1, .5, length(gl_PointCoord - .5))) * sin(life * 3.14159);
          if (cold > .5) a = (1. - smoothstep(.12, .5, abs(gl_PointCoord.x - .5) + abs(gl_PointCoord.y - .5))) * sin(life * 3.14159);
          if (flow > .5) a = (1. - smoothstep(.1, .5, length((gl_PointCoord - .5) * vec2(1.1, .65)))) * sin(life * 3.14159);
          vec3 color = mix(vec3(1., .42, .04), vec3(.4, .85, 1.), max(cold, flow));
          if (dust > .5) {
            a = (1. - smoothstep(.25, .48, max(abs(gl_PointCoord.x - .5), abs(gl_PointCoord.y - .5)))) * sin(life * 3.14159);
            color = vec3(.43, .37, .25);
          }
          gl_FragColor = vec4(color, a * strength * (flow > .5 ? .5 : 1.));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
        transparent: true,
        depthWrite: false,
        blending: cold || flow || dust ? THREE.NormalBlending : THREE.AdditiveBlending,
      }),
    );
    this.embers.name = `elemental_${element}_particles`;
    this.embers.frustumCulled = false;
    this.root.add(this.embers);
    (model.getObjectByName('hips') ?? model).add(this.root);
  }

  update(dt: number, dead: boolean, visible: boolean, reducedMotion: boolean): void {
    if (this.disposed) return;
    this.strength = dead ? Math.max(0, this.strength - dt * 1.5) : 1;
    if (visible && !reducedMotion) this.elapsed += dt;
    this.root.visible = visible && this.strength > 0;
    this.helmet.update(this.elapsed, this.strength, this.root.visible);
    for (const flame of this.flames) {
      flame.visible = this.root.visible;
      flame.material.uniforms.clock.value = this.elapsed;
      flame.material.uniforms.strength.value = this.strength;
    }
    this.embers.material.uniforms.clock.value = this.elapsed;
    this.embers.material.uniforms.strength.value = this.strength;
    this.embers.visible = !reducedMotion;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.helmet.dispose();
    for (const flame of this.flames) {
      flame.removeFromParent();
      flame.material.dispose();
    }
    this.geometry.dispose();
    this.embers.geometry.dispose();
    this.embers.material.dispose();
    this.root.removeFromParent();
  }
}

export interface ElementalVfxHandle {
  update(dt: number, dead: boolean, visible: boolean, reducedMotion: boolean): void;
  dispose(): void;
}

export function createElementalBodyVfx(
  model: THREE.Object3D,
  kind: 'fire' | 'ice' | 'water' | 'storm' | 'stone',
): ElementalVfxHandle {
  return kind === 'storm' ? new StormBodyVfx(model) : new ElementalBodyVfx(model, kind);
}
