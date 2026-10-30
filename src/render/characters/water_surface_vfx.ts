// One owned, pre-gated caustic draw on the existing skin. Geometry, bones and
// skeleton texture stay shared with the body; only our shader is disposable.
import * as THREE from 'three';
import { primeSkinnedSortSpheres } from './skinned_sort_spheres';

const vertexShader = `
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 surfacePoint;
  varying vec3 viewNormal;
  varying vec3 viewDirection;
  void main() {
    vec3 transformed = position;
    vec3 objectNormal = normal;
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <skinning_vertex>
    surfacePoint = transformed;
    vec4 view = modelViewMatrix * vec4(transformed, 1.);
    viewNormal = normalize(normalMatrix * objectNormal);
    viewDirection = -view.xyz;
    gl_Position = projectionMatrix * view;
  }
`;
const fragmentShader = `
  uniform float clock;
  uniform float strength;
  varying vec3 surfacePoint;
  varying vec3 viewNormal;
  varying vec3 viewDirection;
  void main() {
    vec3 p = surfacePoint * 14.;
    float wave = sin(p.y * 1.7 - clock * 1.9 + sin(p.x * 1.4 + clock * .7))
      + sin(p.z * 2.1 + p.x - clock * 1.1);
    float caustic = pow(1. - smoothstep(.04, .29, abs(wave)), 2.);
    float rim = pow(1. - abs(dot(normalize(viewNormal), normalize(viewDirection))), 3.);
    gl_FragColor = vec4(.2, .75, 1., (caustic * .42 + rim * .28) * strength);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class WaterSurfaceVfx {
  private readonly surfaces: THREE.SkinnedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  private disposed = false;

  constructor(model: THREE.Object3D) {
    const bodies: THREE.SkinnedMesh[] = [];
    model.traverse((node) => {
      if (
        (node as THREE.SkinnedMesh).isSkinnedMesh &&
        !node.userData.weaponVfxMesh &&
        !node.userData.weaponMesh
      )
        bodies.push(node as THREE.SkinnedMesh);
    });
    for (const body of bodies) {
      const surface = new THREE.SkinnedMesh(
        body.geometry,
        new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: { clock: { value: 0 }, strength: { value: 1 } },
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      surface.name = 'elemental_water_surface';
      surface.userData.weaponVfxMesh = true;
      surface.position.copy(body.position);
      surface.quaternion.copy(body.quaternion);
      surface.scale.copy(body.scale);
      surface.layers.mask = body.layers.mask;
      surface.bindMode = body.bindMode;
      surface.bind(body.skeleton, body.bindMatrix);
      surface.boundingSphere = body.boundingSphere?.clone() ?? null;
      primeSkinnedSortSpheres(surface);
      surface.frustumCulled = false;
      body.parent?.add(surface);
      this.surfaces.push(surface);
    }
  }

  update(clock: number, strength: number, visible: boolean): void {
    if (this.disposed) return;
    for (const surface of this.surfaces) {
      surface.visible = visible;
      surface.material.uniforms.clock.value = clock;
      surface.material.uniforms.strength.value = strength;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const surface of this.surfaces) {
      surface.removeFromParent();
      surface.material.dispose();
    }
  }
}
