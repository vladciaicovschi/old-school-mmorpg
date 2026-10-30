import { type Node as GltfNode, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';

/** Geometry-only decoder. Embedded KTX2 stays compressed; no browser or GPU. */
export async function settlementScene(file: string): Promise<THREE.Group> {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.read(file);
  const materials = new Map(
    document
      .getRoot()
      .listMaterials()
      .map((source) => {
        const f = source.getBaseColorFactor();
        return [
          source,
          new THREE.MeshStandardMaterial({
            name: source.getName(),
            color: new THREE.Color().setRGB(f[0], f[1], f[2]),
            opacity: f[3],
            transparent: source.getAlphaMode() === 'BLEND',
            side: source.getDoubleSided() ? THREE.DoubleSide : THREE.FrontSide,
          }),
        ] as const;
      }),
  );
  function node(source: GltfNode): THREE.Group {
    const root = new THREE.Group();
    root.name = source.getName();
    root.userData = structuredClone(source.getExtras());
    root.position.fromArray(source.getTranslation());
    root.quaternion.fromArray(source.getRotation());
    root.scale.fromArray(source.getScale());
    for (const primitive of source.getMesh()?.listPrimitives() ?? []) {
      const geometry = new THREE.BufferGeometry();
      for (const [semantic, name] of [
        ['POSITION', 'position'],
        ['NORMAL', 'normal'],
        ['TEXCOORD_0', 'uv'],
        ['COLOR_0', 'color'],
      ]) {
        const a = primitive.getAttribute(semantic);
        if (a)
          geometry.setAttribute(
            name,
            new THREE.BufferAttribute(
              a.getArray()!.slice() as THREE.TypedArray,
              a.getElementSize(),
              a.getNormalized(),
            ),
          );
      }
      const index = primitive.getIndices();
      if (index)
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(index.getArray()!), 1));
      root.add(new THREE.Mesh(geometry, materials.get(primitive.getMaterial()!)!));
    }
    for (const child of source.listChildren()) root.add(node(child));
    return root;
  }
  const scene = document.getRoot().listScenes()[0],
    root = new THREE.Group();
  root.userData = structuredClone(scene.getExtras());
  for (const child of scene.listChildren()) root.add(node(child));
  return root;
}
