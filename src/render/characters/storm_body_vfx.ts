import * as THREE from 'three';
import { ELEMENTAL_CORE_COLORS, ElementalHelmetGlow } from './elemental_helmet_glow';
import { ARC_FLOATS_PER_LINK, writeStormArcs } from './storm_arc_core';

const links = [
  ['vfx_core', 'head'],
  ['vfx_core', 'forearm.l'],
  ['vfx_core', 'forearm.r'],
  ['forearm.l', 'hand.l'],
  ['forearm.r', 'hand.r'],
  ['vfx_core', 'vfx_belt'],
  ['rock_bod.l', 'rock_low1'],
  ['rock_bod.r', 'rock_low11'],
  ['rock_low1', 'rock_low4'],
  ['rock_low11', 'rock_low8'],
  ['rock_low4', 'rock_low5'],
  ['rock_low8', 'rock_low7'],
  ['rock_low5', 'rock_low6'],
  ['rock_low7', 'rock_low6'],
  // Surface paths sit forward/back from the bone centers, so they crawl over
  // the rock faces instead of disappearing inside the opaque armor.
  ['head', 'upperarm.l', 0.09],
  ['head', 'upperarm.r', 0.09],
  ['upperarm.l', 'forearm.l', 0.09],
  ['upperarm.r', 'forearm.r', 0.09],
  ['forearm.l', 'hand.l', 0.07],
  ['forearm.r', 'hand.r', 0.07],
  ['rock_bod.l', 'rock_low1', 0.1],
  ['rock_bod.r', 'rock_low11', 0.1],
  ['rock_low1', 'rock_low5', 0.08],
  ['rock_low11', 'rock_low7', 0.08],
  ['rock_bod.l', 'rock_bod.r', 0.12],
  ['rock_low1', 'rock_low11', 0.1],
  ['head', 'upperarm.l', -0.09],
  ['head', 'upperarm.r', -0.09],
  ['upperarm.l', 'forearm.l', -0.08],
  ['upperarm.r', 'forearm.r', -0.08],
  ['rock_bod.l', 'rock_low5', -0.09],
  ['rock_bod.r', 'rock_low7', -0.09],
] as const;

// Three owned draws (arcs, core, visor), created before the visual compile gate. No lights,
// texture uploads, shared geometry, or allocation in the live update path.
export class StormBodyVfx {
  readonly root = new THREE.Group();
  private readonly anchors: THREE.Object3D[];
  private readonly endpoints: Float32Array;
  private readonly surfaceOffsets: Float32Array;
  private readonly arcs: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly glow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly helmet: ElementalHelmetGlow;
  private readonly inverse = new THREE.Matrix4();
  private readonly point = new THREE.Vector3();
  private elapsed = 0;
  private strength = 1;
  private disposed = false;

  constructor(private readonly model: THREE.Object3D) {
    this.helmet = new ElementalHelmetGlow(model, ELEMENTAL_CORE_COLORS.storm);
    const find = (name: string) =>
      model.getObjectByName(name) ?? model.getObjectByName(name.replace(/[[\].:/]/g, ''));
    const resolved = links.flatMap(([a, b, offset = 0]) => {
      const start = find(a),
        end = find(b);
      return start && end ? [{ start, end, offset }] : [];
    });
    this.anchors = resolved.flatMap(({ start, end }) => [start, end]);
    this.surfaceOffsets = Float32Array.from(resolved.flatMap(({ offset }) => [offset, offset]));
    this.endpoints = new Float32Array(this.anchors.length * 3);
    const count = this.anchors.length / 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(count * ARC_FLOATS_PER_LINK), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const edge = new Float32Array((count * ARC_FLOATS_PER_LINK) / 3);
    for (let i = 0; i < edge.length; i++) {
      const v = i % 6;
      edge[i] = v === 0 || v === 3 || v === 5 ? -1 : 1;
    }
    geometry.setAttribute('edge', new THREE.BufferAttribute(edge, 1));
    geometry.setAttribute(
      'gain',
      new THREE.BufferAttribute(new Float32Array(edge.length), 1).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 2);
    this.arcs = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { clock: { value: 0 }, strength: { value: 1 } },
        vertexShader: `attribute float edge;attribute float gain;varying float across;varying float flash;
          void main(){across=edge;flash=gain;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform float strength;varying float across;varying float flash;
          void main(){float center=pow(1.-abs(across),2.);if(flash<.01)discard;
            gl_FragColor=vec4(mix(vec3(.18,.32,1.),vec3(.9,.97,1.),center),(1.-abs(across))*flash*strength);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.arcs.name = 'elemental_storm_arcs';
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.38),
      new THREE.ShaderMaterial({
        uniforms: { clock: { value: 0 }, strength: { value: 1 } },
        vertexShader: `varying vec2 q;void main(){q=uv*2.-1.;vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);
        center.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));gl_Position=projectionMatrix*center;}`,
        fragmentShader: `uniform float clock;uniform float strength;varying vec2 q;
        void main(){float radial=pow(max(0.,1.-length(q)),3.);float pulse=.9+.1*sin(clock*.8);
          gl_FragColor=vec4(.3,.48,1.,radial*.65*pulse*strength);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.glow.name = 'elemental_storm_core';
    for (const mesh of [this.arcs, this.glow]) {
      mesh.userData.weaponVfxMesh = true;
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
    this.root.name = 'elemental_storm_vfx';
    model.add(this.root);
    this.update(0, false, true, false);
  }

  update(dt: number, dead: boolean, visible: boolean, reducedMotion: boolean): void {
    if (this.disposed) return;
    this.strength = dead ? Math.max(0, this.strength - dt * 1.5) : 1;
    this.root.visible = visible && this.strength > 0;
    if (!visible || reducedMotion) dt = 0;
    this.elapsed += dt;
    this.helmet.update(this.elapsed, this.strength, this.root.visible);
    if (!this.root.visible) return;
    this.model.updateWorldMatrix(true, true);
    this.inverse.copy(this.model.matrixWorld).invert();
    for (let i = 0; i < this.anchors.length; i++) {
      this.point.setFromMatrixPosition(this.anchors[i].matrixWorld).applyMatrix4(this.inverse);
      this.point.z += this.surfaceOffsets[i];
      this.point.toArray(this.endpoints, i * 3);
    }
    const position = this.arcs.geometry.getAttribute('position') as THREE.BufferAttribute;
    const gain = this.arcs.geometry.getAttribute('gain') as THREE.BufferAttribute;
    writeStormArcs(
      position.array as Float32Array,
      this.endpoints,
      this.elapsed,
      gain.array as Float32Array,
      reducedMotion,
    );
    gain.needsUpdate = true;
    position.needsUpdate = true;
    // First link starts at vfx_core. Its model-local coordinates also place glow.
    if (this.endpoints.length) this.glow.position.fromArray(this.endpoints);
    this.arcs.material.uniforms.clock.value = this.elapsed;
    this.arcs.material.uniforms.strength.value = this.strength;
    this.glow.material.uniforms.clock.value = this.elapsed;
    this.glow.material.uniforms.strength.value = this.strength;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.helmet.dispose();
    this.arcs.geometry.dispose();
    this.arcs.material.dispose();
    this.glow.geometry.dispose();
    this.glow.material.dispose();
  }
}
