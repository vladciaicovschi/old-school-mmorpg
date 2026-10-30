// Cold fitting-studio adapter. Reparents the existing payloads, so switching
// anchors never strands TransformControls on a disposed weapon clone.
import * as THREE from 'three';
import type {
  EquipmentCalibrationLocation,
  EquipmentCalibrationTarget,
  EquipmentCalibrationTransform,
} from '../../ui/equipment_calibration_core';
import { backGripFor, hipGripFor } from './back_grips';
import { type CarriedAttachmentFit, carriedAttachmentFitFor } from './carried_attachment_fit';
import { itemAttachmentFitFor } from './item_attachment_fit';

function transformOf(node: THREE.Object3D): EquipmentCalibrationTransform {
  return {
    position: node.position.toArray(),
    rotationDeg: [node.rotation.x, node.rotation.y, node.rotation.z].map(
      THREE.MathUtils.radToDeg,
    ) as [number, number, number],
    scale: node.scale.x,
  };
}
function apply(node: THREE.Object3D, t: EquipmentCalibrationTransform): void {
  node.position.set(...t.position);
  node.rotation.set(...(t.rotationDeg.map(THREE.MathUtils.degToRad) as [number, number, number]));
  node.scale.setScalar(t.scale);
  node.updateWorldMatrix(true, true);
}
function clone(t: EquipmentCalibrationTransform): EquipmentCalibrationTransform {
  return { position: [...t.position], rotationDeg: [...t.rotationDeg], scale: t.scale };
}

export class EquipmentCarryPreview {
  private readonly payloads = new Map<'mainhand' | 'offhand', THREE.Object3D>();
  private readonly handParents = new Map<'mainhand' | 'offhand', THREE.Object3D>();
  private readonly defaults = new Map<EquipmentCalibrationTarget, EquipmentCalibrationTransform>();
  private readonly hip: THREE.Object3D | undefined;
  private readonly back: THREE.Object3D | undefined;

  constructor(root: THREE.Object3D, authored: CarriedAttachmentFit = {}, visualKey?: string) {
    const bone = (names: string[]) => names.map((name) => root.getObjectByName(name)).find(Boolean);
    this.hip = bone(['mixamorigHips', 'hips', 'pelvis']);
    this.back = bone(['mixamorigSpine2', 'chest', 'spine_03']);
    root.traverse((node) => {
      if (!node.parent || (node.userData.heldSlot !== 0 && node.userData.heldSlot !== 1)) return;
      const slot = node.userData.heldSlot === 0 ? 'mainhand' : 'offhand';
      if (this.payloads.has(slot)) return;
      this.payloads.set(slot, node);
      this.handParents.set(slot, node.parent);
      this.defaults.set(slot, transformOf(node));
      for (const location of ['hip', 'back'] as const) {
        const target = `${slot}_${location}` as const;
        const fitted =
          itemAttachmentFitFor(visualKey, node.userData.heldModelUrl)?.[target] ??
          (visualKey ? carriedAttachmentFitFor(visualKey)[target] : undefined) ??
          authored[target];
        const grip =
          location === 'hip'
            ? hipGripFor(slot === 'mainhand' ? 'r' : 'l')
            : backGripFor(node.userData.heldAccessory ?? null, slot === 'mainhand' ? 'r' : 'l');
        const euler = new THREE.Euler().setFromQuaternion(
          new THREE.Quaternion().fromArray(grip.quaternion),
          'XYZ',
        );
        this.defaults.set(
          target,
          fitted
            ? {
                position: [...fitted.position],
                rotationDeg: [...fitted.rotationDeg],
                scale: fitted.scale,
              }
            : {
                position: [...grip.position],
                rotationDeg: [euler.x, euler.y, euler.z].map(THREE.MathUtils.radToDeg) as [
                  number,
                  number,
                  number,
                ],
                scale: node.scale.x,
              },
        );
      }
    });
  }

  defaultTransform(target: EquipmentCalibrationTarget): EquipmentCalibrationTransform | null {
    const t = this.defaults.get(target);
    if (!t || (target.endsWith('_hip') && !this.hip) || (target.endsWith('_back') && !this.back))
      return null;
    return clone(t);
  }

  setLocation(location: EquipmentCalibrationLocation): boolean {
    const parent = location === 'hip' ? this.hip : location === 'back' ? this.back : null;
    if (location !== 'hand' && !parent) return false;
    for (const [slot, payload] of this.payloads) {
      const target = location === 'hand' ? slot : (`${slot}_${location}` as const);
      const handParent = this.handParents.get(slot);
      const transform = this.defaults.get(target);
      if (!transform || (!parent && !handParent)) continue;
      (parent ?? handParent)?.add(payload);
      apply(payload, transform);
    }
    return true;
  }
}
