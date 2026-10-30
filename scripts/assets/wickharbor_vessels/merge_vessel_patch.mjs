import assert from 'node:assert/strict';
import { mergeDocuments } from '@gltf-transform/functions';
import sharp from 'sharp';

/** Replace named role groups, retaining the accepted atlas bytes for native parts. */
export async function mergeVesselPatch(doc, patch, roles) {
  const scene = doc.getRoot().listScenes()[0];
  const patchScene = patch.getRoot().listScenes()[0];
  const children = patchScene.listChildren();
  assert.deepEqual(children.map((node) => node.getExtras().role).sort(), [...roles].sort());
  const textures = new Map(
    doc
      .getRoot()
      .listTextures()
      .map((texture) => [texture.getName(), texture]),
  );
  const removed = doc
    .getRoot()
    .listNodes()
    .filter((node) => roles.includes(node.getExtras().role));
  assert.equal(removed.length, roles.length);
  for (const node of removed) node.dispose();
  const mapping = mergeDocuments(doc, patch);
  const slots = [
    ['getBaseColorTexture', 'setBaseColorTexture'],
    ['getNormalTexture', 'setNormalTexture'],
    ['getMetallicRoughnessTexture', 'setMetallicRoughnessTexture'],
    ['getOcclusionTexture', 'setOcclusionTexture'],
    ['getEmissiveTexture', 'setEmissiveTexture'],
  ];
  const resized = new Set();
  for (const material of patch.getRoot().listMaterials()) {
    const target = mapping.get(material);
    for (const [get, set] of slots) {
      const texture = target[get]();
      if (!texture) continue;
      const shared = textures.get(texture.getName());
      if (shared) target[set](shared);
      else if (!resized.has(texture)) {
        const bytes = await sharp(Buffer.from(texture.getImage()))
          .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();
        texture.setImage(bytes).setMimeType('image/png');
        resized.add(texture);
      }
    }
  }
  for (const node of children) scene.addChild(mapping.get(node));
  mapping.get(patchScene).dispose();
}
