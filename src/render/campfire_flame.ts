import * as THREE from 'three';
import { sharedUniforms } from './gfx';

// Five upright flame cards in one draw. Broad, warm shapes suit the painted
// world; flowing edges and independently breathing tips do the animation.
// No textures, lights, per-frame allocations, or additive white-hot stacking.
const TONGUES = [
  [-0.19, -0.1, 0.55, 1.02, 0.8],
  [0.18, -0.12, 0.52, 1.12, 2.7],
  [0, 0.07, 0.62, 1.38, 4.3],
  [-0.16, 0.16, 0.43, 0.83, 6.1],
  [0.19, 0.14, 0.46, 0.91, 8.4],
] as const;

const TORCH_TONGUES = [
  [-0.045, -0.025, 0.23, 0.49, 1.2],
  [0.025, 0.01, 0.28, 0.67, 3.5],
  [0.065, 0.04, 0.2, 0.43, 6.7],
] as const;

const VERTEX_DECLARATIONS = `
uniform float uCampfireTime;
attribute vec3 aFlameRoot;
attribute vec3 aFlameShape;
varying vec2 vFireUv;
varying float vFirePhase;
`;

const VERTEX_SHAPE = `
vFireUv = vec2(position.x + 0.5, position.y);
vFirePhase = aFlameShape.z + dot(modelMatrix[3].xz, vec2(0.73, 0.39));
float fireTime = uCampfireTime * 2.4 + vFirePhase;
float fireHeight = aFlameShape.y * (0.90 + 0.10 * sin(fireTime));
// Cylindrical billboards stay rooted and upright as the camera orbits.
vec3 fireRight = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
vec3 fireLocalRight = vec3(
  dot(fireRight, normalize(modelMatrix[0].xyz)),
  dot(fireRight, normalize(modelMatrix[1].xyz)),
  dot(fireRight, normalize(modelMatrix[2].xyz))
);
vec3 transformed = aFlameRoot + fireLocalRight * position.x * aFlameShape.x;
transformed.y += position.y * fireHeight;
`;

const FRAGMENT_DECLARATIONS = `
uniform float uCampfireTime;
varying vec2 vFireUv;
varying float vFirePhase;
float fireHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float fireNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fireHash(cell), fireHash(cell + vec2(1.0, 0.0)), f.x),
             mix(fireHash(cell + vec2(0.0, 1.0)), fireHash(cell + 1.0), f.x), f.y);
}
`;

const FRAGMENT_FLAME = `
float fireY = vFireUv.y;
float fireT = uCampfireTime * 1.55 + vFirePhase;
vec2 flow = vec2(vFireUv.x * 3.0 + vFirePhase, fireY * 3.5 - fireT);
float turbulence = fireNoise(flow) * 0.7 + fireNoise(flow * 2.1) * 0.3;
float bend = sin(fireY * 5.5 - fireT * 2.0) * 0.10 * fireY
           + (turbulence - 0.5) * 0.30 * fireY;
float fireX = abs(vFireUv.x - 0.5 - bend);
float width = (0.34 + 0.10 * sin(fireY * 3.14159)) * pow(1.0 - fireY, 0.72);
float edge = width - fireX + (turbulence - 0.5) * 0.19 * fireY;
float silhouette = smoothstep(-0.015, 0.045, edge);
silhouette *= smoothstep(0.0, 0.065, fireY) * (1.0 - smoothstep(0.83, 1.0, fireY));
// Eroding upper tips create small breaks as hot tongues peel upward.
silhouette *= 1.0 - smoothstep(0.55, 0.90, fireY) * smoothstep(0.52, 0.76, turbulence);
float core = smoothstep(0.02, 0.22, edge) * (1.0 - smoothstep(0.15, 0.78, fireY));
// The fixture's authored colour also supports the cold dungeon palettes.
vec3 body = diffuse / max(0.001, max(diffuse.r, max(diffuse.g, diffuse.b)));
vec3 fireColor = mix(body * body, body, smoothstep(0.0, 0.12, edge));
fireColor = mix(fireColor, mix(body, vec3(1.0), 0.48), core);
diffuseColor.rgb = fireColor * (0.94 + 0.06 * sin(fireT * 3.0));
diffuseColor.a *= silhouette;
if (diffuseColor.a < 0.004) discard;
`;

function replaceChunk(source: string, chunk: string, replacement: string): string {
  if (!source.includes(chunk)) throw new Error(`Campfire shader missing ${chunk}`);
  return source.replace(chunk, replacement);
}

// Material.clone() constructs this subclass before copy(), so the prop
// occluder clones retain the shader and shared clock without per-fire hooks.
class CampfireFlameMaterial extends THREE.MeshBasicMaterial {
  constructor() {
    super({ color: 0xffaa33, transparent: true, opacity: 0.9, depthWrite: false });
    this.name = 'campfire-flame';
    this.toneMapped = false;
    this.onBeforeCompile = (shader) => {
      shader.uniforms.uCampfireTime = sharedUniforms.uTime;
      shader.vertexShader = replaceChunk(
        shader.vertexShader,
        '#include <common>',
        `#include <common>\n${VERTEX_DECLARATIONS}`,
      );
      shader.vertexShader = replaceChunk(
        shader.vertexShader,
        '#include <begin_vertex>',
        VERTEX_SHAPE,
      );
      shader.fragmentShader = replaceChunk(
        shader.fragmentShader,
        '#include <common>',
        `#include <common>\n${FRAGMENT_DECLARATIONS}`,
      );
      shader.fragmentShader = replaceChunk(
        shader.fragmentShader,
        '#include <color_fragment>',
        `#include <color_fragment>\n${FRAGMENT_FLAME}`,
      );
    };
  }

  override customProgramCacheKey(): string {
    return 'campfire-flame-v1';
  }
}

function buildFlameGeometry(tongues: readonly (readonly number[])[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const roots: number[] = [];
  const shapes: number[] = [];
  const indices: number[] = [];
  for (const [x, z, width, height, phase] of tongues) {
    const base = positions.length / 3;
    for (const [u, v] of [
      [-0.5, 0],
      [0.5, 0],
      [-0.5, 1],
      [0.5, 1],
    ]) {
      positions.push(u, v, 0);
      roots.push(x, 0, z);
      shapes.push(width, height, phase);
    }
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aFlameRoot', new THREE.Float32BufferAttribute(roots, 3));
  geometry.setAttribute('aFlameShape', new THREE.Float32BufferAttribute(shapes, 3));
  geometry.setIndex(indices);
  // Bounds include every billboard orientation and the shader's full height.
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(-0.6, 0, -0.6),
    new THREE.Vector3(0.6, 1.4, 0.6),
  );
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.7, 0), 1.1);
  return geometry;
}

function flameMesh(geometry: THREE.BufferGeometry, color = 0xffaa33): THREE.Mesh {
  const material = new CampfireFlameMaterial();
  material.color.setHex(color);
  const flame = new THREE.Mesh(geometry, material);
  flame.userData.shaderSceneryFlame = true;
  return flame;
}

/** Same factory for live fires and the props.material-variants prewarm twin. */
export function createCampfireFlame(): THREE.Mesh {
  const flame = flameMesh(buildFlameGeometry(TONGUES));
  flame.name = 'campfire-flame';
  return flame;
}

/** A narrower three-tongue shape for torch heads, rooted at local Y = 0. */
export function buildTorchFlameGeometry(): THREE.BufferGeometry {
  return buildFlameGeometry(TORCH_TONGUES);
}

export function createTorchFlame(
  options: { geometry?: THREE.BufferGeometry; color?: number } = {},
): THREE.Mesh {
  const flame = flameMesh(options.geometry ?? buildTorchFlameGeometry(), options.color);
  flame.name = 'torch-flame';
  return flame;
}
