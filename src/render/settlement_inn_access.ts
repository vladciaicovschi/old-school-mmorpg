import * as THREE from 'three';
import { SETTLEMENT_ACCESS } from '../sim/settlements_layout';

/** Move the native open leaf clear of the full character body, with its UVs intact. */
export function adaptSettlementInnDoor(model: THREE.Group): void {
  model.updateWorldMatrix(true, true);
  const { innDoorBounds: bounds, innDoorShiftX: shift } = SETTLEMENT_ACCESS;
  const box = new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max));
  box.expandByScalar(0.005);
  let vertexCount = 0;
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    let parent: THREE.Object3D | null = object;
    while (parent && parent !== model && parent.userData.innSection !== 'wall-front')
      parent = parent.parent;
    if (parent?.userData.innSection !== 'wall-front') return;
    const source = object.geometry.getAttribute('position');
    const index = object.geometry.index;
    const points = Array.from({ length: source.count }, (_, i) =>
      new THREE.Vector3().fromBufferAttribute(source, i).applyMatrix4(object.matrixWorld),
    );
    const selected = new Set<number>();
    const count = index?.count ?? source.count;
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map((offset) => (index ? index.getX(i + offset) : i + offset));
      if (ids.every((id) => box.containsPoint(points[id]))) for (const id of ids) selected.add(id);
    }
    if (!selected.size) return;
    const inverse = object.matrixWorld.clone().invert();
    const values = new Float32Array(source.count * 3);
    points.forEach((point, i) => {
      if (selected.has(i)) point.x += shift;
      point.applyMatrix4(inverse);
      values.set([point.x, point.y, point.z], i * 3);
    });
    object.geometry = object.geometry.clone();
    object.geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
    vertexCount += selected.size;
  });
  if (!vertexCount) throw new Error('Native settlement inn door could not be isolated');
  model.userData.innDoorAdaptation = { shift, vertexCount };
}
