// A small emissive volume inside the authored visor socket. The opaque helmet
// occludes it naturally from the sides/back; no camera-facing halo or light.
import * as THREE from 'three';

export const ELEMENTAL_CORE_COLORS = {
  fire: 0xff7718,
  ice: 0x71d9ff,
  water: 0x35dcff,
  storm: 0x8aa7ff,
  stone: 0xa39d72,
} as const;

export class ElementalHelmetGlow {
  private readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null;
  private disposed = false;

  constructor(model: THREE.Object3D, color: THREE.ColorRepresentation) {
    const socket = model.getObjectByName('vfx_eyes');
    if (!socket) {
      this.mesh = null;
      return;
    }
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 10),
      new THREE.ShaderMaterial({
        uniforms: {
          tint: { value: new THREE.Color(color) },
          clock: { value: 0 },
          strength: { value: 1 },
        },
        vertexShader: `varying vec3 viewNormal; varying vec3 viewDirection;
          void main(){vec4 view=modelViewMatrix*vec4(position,1.);
            viewNormal=normalMatrix*normal;viewDirection=-view.xyz;
            gl_Position=projectionMatrix*view;}`,
        fragmentShader: `uniform vec3 tint;uniform float clock;uniform float strength;
          varying vec3 viewNormal;varying vec3 viewDirection;
          void main(){float face=max(0.,dot(normalize(viewNormal),normalize(viewDirection)));
            float pulse=.95+.05*sin(clock*1.3);
            vec3 color=tint*(.65+.95*face);
            gl_FragColor=vec4(color*pulse,(.5+.45*face*face)*strength);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.mesh.name = 'elemental_helmet_glow';
    // The authored vfx_eyes basis uses X across the visor, Y for its depth and
    // Z vertically. Keep the light volume inside the slit, below the brow.
    this.mesh.position.y = -0.018;
    this.mesh.scale.set(0.043, 0.025, 0.016);
    this.mesh.userData.weaponVfxMesh = true;
    this.mesh.frustumCulled = false;
    socket.add(this.mesh);
  }

  update(clock: number, strength: number, visible: boolean): void {
    if (this.disposed || !this.mesh) return;
    this.mesh.visible = visible && strength > 0;
    this.mesh.material.uniforms.clock.value = clock;
    this.mesh.material.uniforms.strength.value = strength;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh?.removeFromParent();
    this.mesh?.geometry.dispose();
    this.mesh?.material.dispose();
  }
}
