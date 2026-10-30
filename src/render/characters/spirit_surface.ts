import * as THREE from 'three';
import { SPIRIT_APPEARANCE, type SpiritKind } from './spirit_appearance';

/** Applied only to cached derived materials, never the loader's shared source. */
export function applySpiritSurface(material: THREE.Material, kind: SpiritKind): void {
  const style = SPIRIT_APPEARANCE[kind];
  const mat = material as THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  mat.transparent = true;
  mat.opacity = style.opacity;
  mat.depthWrite = false;
  // A single front shell avoids drawing the translucent rear face through it.
  mat.side = THREE.FrontSide;
  if (mat.emissive) {
    mat.emissive.setHex(style.color);
    mat.emissiveMap = null;
    mat.emissiveIntensity = style.glow;
  }
  mat.userData.spiritKind = kind;
}
