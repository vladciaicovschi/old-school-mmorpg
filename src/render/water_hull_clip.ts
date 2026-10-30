import * as THREE from 'three';
import { getActiveWorldContent } from '../sim/data';
import { waterLevel } from '../sim/world';
import {
  ROWBOAT_HULL_HEIGHTS,
  ROWBOAT_HULL_STATIONS,
  ROWBOAT_HULL_WIDTHS,
  waterHullHoles,
} from './water_hull_core';

const number = (v: number) => (Number.isInteger(v) ? `${v}.0` : `${v}`);
function widthExpression(row: readonly number[]) {
  let expression = number(row[0]);
  for (let i = 1; i < row.length; i++) {
    const a = ROWBOAT_HULL_STATIONS[i - 1],
      b = ROWBOAT_HULL_STATIONS[i];
    expression = `mix(${expression}, ${number(row[i])}, clamp((az-${number(a)})/${number(b - a)},0.0,1.0))`;
  }
  return expression;
}

/** Small shared clip, evaluated before shading, on every overlapping water sheet. */
export function createWaterHullClip() {
  const holes = waterHullHoles(getActiveWorldContent().props.decorProps ?? []);
  if (!holes.length) return { declarations: '', fragment: '', uniforms: {}, key: 'no-hulls' };
  const extent = 3;
  const bounds = new THREE.Vector4(
    Math.min(...holes.map((p) => p.x - extent * p.scale)),
    Math.min(...holes.map((p) => p.z - extent * p.scale)),
    Math.max(...holes.map((p) => p.x + extent * p.scale)),
    Math.max(...holes.map((p) => p.z + extent * p.scale)),
  );
  const uniforms = {
    uWaterHullBounds: { value: bounds },
    uWaterHullPose: { value: holes.map((p) => new THREE.Vector4(p.x, p.z, p.cosine, p.sine)) },
    uWaterHullFrame: {
      value: holes.map((p) => new THREE.Vector2(p.scale, waterLevel() - p.draft)),
    },
  };
  const rows = ROWBOAT_HULL_WIDTHS.map((row, i) => `float width${i}=${widthExpression(row)};`).join(
    '\n',
  );
  const lerps = ROWBOAT_HULL_HEIGHTS.slice(1)
    .map((b, i) => {
      const a = ROWBOAT_HULL_HEIGHTS[i];
      return `w=mix(w,width${i + 1},clamp((p.y-${number(a)})/${number(b - a)},0.0,1.0));`;
    })
    .join('\n');
  return {
    uniforms,
    key: `rowboat-hulls-v1:${holes.length}`,
    fragment: 'clipWaterHulls(vWPos);',
    declarations: /*glsl*/ `
uniform vec4 uWaterHullBounds;
uniform vec4 uWaterHullPose[${holes.length}];
uniform vec2 uWaterHullFrame[${holes.length}];
void clipWaterHulls(vec3 world) {
  if(world.x<uWaterHullBounds.x||world.z<uWaterHullBounds.y||world.x>uWaterHullBounds.z||world.z>uWaterHullBounds.w)return;
  for(int i=0;i<${holes.length};i++) {
    vec4 pose=uWaterHullPose[i];
    vec2 d=world.xz-pose.xy;
    vec3 p=vec3(d.x*pose.z-d.y*pose.w,world.y-uWaterHullFrame[i].y,d.x*pose.w+d.y*pose.z)/uWaterHullFrame[i].x;
    float az=abs(p.z);
    if(az>=${number(ROWBOAT_HULL_STATIONS.at(-1) ?? 0)}||abs(p.x)>.79)continue;
    ${rows}
    float w=width0;
    ${lerps}
    if(w>0.0&&abs(p.x)<w)discard;
  }
}
`,
  };
}

/** The low tier needs the same hole; stencil/depth masks would hide boat floors. */
export function applyPhongWaterHullClip(material: THREE.MeshPhongMaterial) {
  const clip = createWaterHullClip();
  if (!clip.fragment) return;
  const original = material.onBeforeCompile,
    key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    original.call(material, shader, renderer);
    Object.assign(shader.uniforms, clip.uniforms);
    shader.vertexShader = `varying vec3 vWPos;\n${shader.vertexShader}`.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.0)).xyz;',
    );
    shader.fragmentShader =
      `varying vec3 vWPos;\n${clip.declarations}\n${shader.fragmentShader}`.replace(
        'void main() {',
        `void main() {\n${clip.fragment}`,
      );
  };
  material.customProgramCacheKey = () => `${key}|${clip.key}`;
}
