import * as THREE from 'three';
import type { EastbrookRoofVisibilityTarget } from '../eastbrook_town_visibility_core';
import { makeShadowOnlyMaterial } from '../shadow_only_material';
import { type CutawayGeometryCache, partitionCutawayGeometry } from './geometry';
import { type CutawayBounds, type CutawayShape, cutawayBlocksView } from './visibility_core';

const KEEP_VISIBLE = new Set([
  'interior',
  'chapel-interior',
  'tower-stair',
  'tower-landing',
  'furniture',
  'bell',
  'spiral-tread',
  'spiral-rail',
  'stairwell-guard',
  'beacon-lamp',
]);
function roleOf(object: THREE.Object3D, root: THREE.Object3D): string {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    const data = node.userData;
    if (data.innSection || data.civicRole || data.role || data.section)
      return data.innSection || data.civicRole || data.role || data.section;
    if (node === root) break;
  }
  return '';
}
function protectedPart(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (
      node.userData.terrainProp ||
      ['ground-furniture', 'upper-furniture', 'stairs', 'upper-rail'].includes(
        node.userData.section,
      ) ||
      [node.userData.innSection, node.userData.civicRole, node.userData.role].some((role) =>
        KEEP_VISIBLE.has(role),
      )
    )
      return true;
    if (node === root) break;
  }
  return false;
}

function buildingShape(
  root: THREE.Group,
  f: EastbrookRoofVisibilityTarget,
  inverse: THREE.Matrix4,
): CutawayShape {
  const shape: CutawayShape = {
    radial: false,
    wings: [
      {
        id: 'main',
        x: 0,
        z: 0,
        halfWidth: f.halfWidth,
        halfDepth: f.halfDepth,
        roofY: Infinity,
        storeyHeight: 4.5,
      },
    ],
  };
  let metadata: THREE.Object3D | undefined;
  root.traverse((node) => {
    if (node.userData.role === 'circular-shell') shape.radial = true;
    if (!metadata && node.userData.footprint && node.userData.facades) metadata = node;
  });
  if (!metadata) return shape;
  const data = metadata.userData,
    matrix = inverse.clone().multiply(metadata.matrixWorld),
    e = matrix.elements;
  const sx = Math.hypot(e[0], e[1], e[2]),
    sy = Math.hypot(e[4], e[5], e[6]),
    sz = Math.hypot(e[8], e[9], e[10]);
  const levels = Math.max(0, ...data.facades.map((facade: { level: number }) => facade.level)) + 1;
  const storeyHeight = (data.storeyHeight ?? 3) * sy;
  const wings = [
    {
      id: 'main',
      x: e[12],
      z: e[14],
      halfWidth: (data.footprint.width * sx) / 2,
      halfDepth: (data.footprint.depth * sz) / 2,
      roofY: e[13] + levels * storeyHeight,
      storeyHeight,
    },
  ];
  if (data.bellTower) {
    const tower = data.bellTower;
    wings.push({
      id: 'tower',
      x: e[12],
      z: e[14] + tower.centerZ * sz,
      halfWidth: (tower.width * sx) / 2,
      halfDepth: (tower.depth * sz) / 2,
      roofY: e[13] + tower.levels * storeyHeight,
      storeyHeight,
    });
  }
  shape.wings = wings;
  return shape;
}

interface CutawayPart {
  mesh: THREE.Mesh;
  bounds: CutawayBounds;
  floor: boolean;
  original: THREE.Material | THREE.Material[];
  hiddenMaterial: THREE.Material | THREE.Material[];
  hidden: boolean;
}

/** Build under the town's existing reveal gate, then switch only render state. */
export function buildingCutaway() {
  const targets: {
    root: THREE.Group;
    footprint: EastbrookRoofVisibilityTarget;
    inverse: THREE.Matrix4;
    parts: CutawayPart[];
  }[] = [];
  const cache: CutawayGeometryCache = new WeakMap();
  const materialCache = new WeakMap<THREE.Material, THREE.Material>(),
    materials = new Set<THREE.Material>(),
    geometries = new Set<THREE.BufferGeometry>();
  const replacements: { original: THREE.Mesh; holder: THREE.Group; children: THREE.Object3D[] }[] =
    [];
  const eyeLocal = new THREE.Vector3(),
    cameraLocal = new THREE.Vector3();
  let disposed = false;
  function inert(source: THREE.Material): THREE.Material {
    const material = makeShadowOnlyMaterial(source, materialCache);
    materials.add(material);
    return material;
  }
  return {
    register(root: THREE.Group, footprint: EastbrookRoofVisibilityTarget): void {
      if (disposed) return;
      root.updateWorldMatrix(true, true);
      const inverse = root.matrixWorld.clone().invert(),
        shape = buildingShape(root, footprint, inverse),
        parts: CutawayPart[] = [],
        meshes: THREE.Mesh[] = [];
      root.traverse((node) => {
        if (
          node instanceof THREE.Mesh &&
          !protectedPart(node, root) &&
          !('isSkinnedMesh' in node) &&
          !('isInstancedMesh' in node) &&
          node.geometry.getAttribute('position')
        )
          meshes.push(node);
      });
      for (const original of meshes) {
        const relative = inverse.clone().multiply(original.matrixWorld);
        const templates = partitionCutawayGeometry(
          original.geometry,
          relative,
          shape,
          roleOf(original, root),
          cache,
        );
        let holder: THREE.Group | undefined;
        if (templates.length > 1) {
          holder = new THREE.Group();
          holder.copy(original, false);
          holder.name = original.name;
          replacements.push({ original, holder, children: [...original.children] });
          original.parent!.add(holder);
          original.removeFromParent();
          for (const child of [...original.children]) holder.add(child);
        }
        for (const template of templates) {
          const mesh = holder ? original.clone(false) : original;
          if (holder) {
            mesh.position.set(0, 0, 0);
            mesh.quaternion.identity();
            mesh.scale.set(1, 1, 1);
            mesh.updateMatrix();
            mesh.geometry = template.geometry;
            mesh.name = `${original.name}:cutaway:${template.key}`;
            mesh.onBeforeRender = original.onBeforeRender;
            mesh.onAfterRender = original.onAfterRender;
            holder.add(mesh);
          }
          mesh.userData.cutawayPart = template.key;
          mesh.userData.cutawayHidden = false;
          if (template.geometry !== original.geometry) geometries.add(template.geometry);
          const hiddenMaterial = Array.isArray(mesh.material)
            ? mesh.material.map(inert)
            : inert(mesh.material);
          parts.push({
            mesh,
            bounds: template.bounds,
            floor: template.key.includes(':floor:'),
            original: mesh.material,
            hiddenMaterial,
            hidden: false,
          });
        }
      }
      targets.push({ root, footprint, inverse, parts });
    },
    update(camera: THREE.Vector3, eye: THREE.Vector3, _dt: number, _reducedMotion = false): void {
      if (disposed) return;
      for (const target of targets) {
        const f = target.footprint,
          near = Math.hypot(camera.x - f.x, camera.z - f.z) <= 90 + f.cullRadius;
        if (near) {
          target.root.updateWorldMatrix(true, false);
          target.inverse.copy(target.root.matrixWorld).invert();
          eyeLocal.copy(eye).applyMatrix4(target.inverse);
          cameraLocal.copy(camera).applyMatrix4(target.inverse);
        }
        for (const part of target.parts) {
          const hidden =
            near &&
            cutawayBlocksView(
              part.bounds,
              part.floor,
              eyeLocal.x,
              eyeLocal.y,
              eyeLocal.z,
              cameraLocal.x,
              cameraLocal.y,
              cameraLocal.z,
              part.hidden,
            );
          if (hidden === part.hidden) continue;
          part.hidden = hidden;
          part.mesh.userData.cutawayHidden = hidden;
          // No alpha/program change. The existing inert twin keeps casting shadows.
          part.mesh.material = hidden ? part.hiddenMaterial : part.original;
        }
      }
    },
    dispose(): void {
      if (!disposed) {
        disposed = true;
        for (const target of targets)
          for (const part of target.parts) {
            part.mesh.material = part.original;
            part.mesh.userData.cutawayHidden = false;
          }
        for (const { original, holder, children } of replacements) {
          holder.parent?.add(original);
          for (const child of children) original.add(child);
          holder.removeFromParent();
        }
        targets.length = 0;
        replacements.length = 0;
      }
      const errors: unknown[] = [];
      for (const material of materials) {
        try {
          material.dispose();
          materials.delete(material);
        } catch (error) {
          errors.push(error);
        }
      }
      for (const geometry of geometries) {
        try {
          geometry.dispose();
          geometries.delete(geometry);
        } catch (error) {
          errors.push(error);
        }
      }
      // Surface errors without preventing the town owner from releasing its other resources.
      // Failed entries remain retryable; late register/update stay inert.
      if (errors.length)
        console.error(new AggregateError(errors, 'Building cutaway cleanup failed'));
    },
  };
}
