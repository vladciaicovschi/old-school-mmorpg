// Derive a staff-free fire elemental from the shipped Ignivar rig. Preserve
// its floating stones, skin weights and casting/death clips; lower the staff
// arm in locomotion using its own relaxed left-arm pose. Authoring only.
// node scripts/anim/build_fire_elemental.mjs [path/to/ktx.exe]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';
import { Quaternion, Vector3 } from 'three';
import { groundElementalDeath } from './elemental_death.mjs';
import { bakeClip, createGlbIO, indexClip, samplePose } from './pose_blend.mjs';
import { createPoseRig } from './rig_pose.mjs';

const source = 'public/models/creatures/ignivar_ashcaller.glb';
const sha = createHash('sha256')
  .update(await readFile(source))
  .digest('hex');
assert.equal(sha, '0f92aa55d5f031cc2ae1c9368102edde96a3345827592cb3c56351d1b4fd4396');
const work = 'tmp/asset_src/elementals';
await mkdir(work, { recursive: true });
const io = createGlbIO();
const doc = await io.read(source);
const root = doc.getRoot();
const mesh = root.listMeshes()[0];
const [body, staff] = mesh.listPrimitives();
assert.equal(mesh.listPrimitives().length, 2);
assert.equal(body.getIndices().getCount() / 3, 9712);
assert.equal(staff.getIndices().getCount() / 3, 958);
assert.equal(root.listSkins()[0].listJoints().length, 51);
mesh.removePrimitive(staff);
staff.dispose();
mesh.setName('FireElementalBody');

// Convert the existing painted atlas, retaining its shading and UVs. Red-orange
// fissures get a separate emissive mask; brown/gold ornament becomes basalt.
const material = body.getMaterial();
const texture = material.getBaseColorTexture();
await writeFile(`${work}/source.ktx2`, texture.getImage());
execFileSync(process.argv[2] ?? 'tmp/ktx-software-4.4.2/bin/ktx.exe', [
  'extract',
  '--transcode',
  'rgba8',
  `${work}/source.ktx2`,
  `${work}/source.png`,
]);
const { data, info } = await sharp(`${work}/source.png`)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const emission = Buffer.alloc(data.length);
for (let i = 0; i < data.length; i += 4) {
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  const heat = Math.max(0, Math.min(1, (r - 1.65 * g - 20) / 75)) * Math.min(1, r / 130);
  const stone = Math.min(125, (r * 0.3 + g * 0.55 + b * 0.15) * 0.72);
  data[i] = stone * (1 - heat) + r * heat;
  data[i + 1] = stone * 0.98 * (1 - heat) + g * 0.88 * heat;
  data[i + 2] = stone * 1.02 * (1 - heat) + b * 0.6 * heat;
  emission[i] = Math.round(255 * heat);
  emission[i + 1] = Math.round(96 * heat);
  emission[i + 2] = Math.round(12 * heat);
  emission[i + 3] = 255;
}
const png = async (pixels) =>
  sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
texture
  .setImage(await png(data))
  .setMimeType('image/png')
  .setName('FireElemental_Basalt');
// Replaced KTX image is now PNG, so drop the texture's old Basis extension.
texture.setExtension('KHR_texture_basisu', null);
const emissive = doc
  .createTexture('FireElemental_Fissures')
  .setImage(await png(emission))
  .setMimeType('image/png');
material
  .setName('FireElemental_Basalt')
  .setBaseColorFactor([1, 1, 1, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.94)
  .setEmissiveTexture(emissive)
  .setEmissiveFactor([1, 1, 1]);

const rig = createPoseRig(root);
const pos = (name) => rig.named.get(name).getWorldPosition(new Vector3());
function aim(boneName, childName, target) {
  const bone = rig.named.get(boneName);
  const current = pos(childName).sub(pos(boneName)).normalize();
  const desired = target.clone().sub(pos(boneName)).normalize();
  const world = bone
    .getWorldQuaternion(new Quaternion())
    .premultiply(new Quaternion().setFromUnitVectors(current, desired));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world));
  bone.updateWorldMatrix(true, true);
}
for (const [donorName, newName, duration] of [
  ['Idle', 'Fire_Idle', 4],
  ['Move', 'Fire_Move', 2],
  ['Cast', 'Cast', 2],
  ['ChannelStart', 'ChannelStart', 1],
  ['Channel', 'Channel', 3],
  ['Death', 'Death', 100 / 30],
]) {
  const donor = indexClip(root, donorName);
  const original = root.listAnimations().find((a) => a.getName() === donorName);
  const keys = [...donor.keys()];
  const loop = donorName === 'Idle' || donorName === 'Move';
  const timeline = [];
  for (let f = 0; f <= duration * 30; f++) {
    const t = f / 30;
    rig.apply(samplePose(donor, loop && f === duration * 30 ? 0 : t));
    if (loop) {
      const center = pos('chest').x;
      const elbow = pos('forearm.l');
      elbow.x = center * 2 - elbow.x;
      const wrist = pos('hand.l');
      wrist.x = center * 2 - wrist.x;
      aim('upperarm.r', 'forearm.r', elbow);
      aim('forearm.r', 'hand.r', wrist);
      rig.named.get('hand.r').quaternion.fromArray(rig.rest.get('hand.r|rotation'));
    }
    // Bind pose itself grips the staff. Keep the knuckle fan and thumb, but
    // open the middle/tip joints in every clip so the fist never snaps back.
    for (const name of rig.named.keys()) {
      if (/^f[123][bc]\.r$/.test(name)) {
        const degrees = name.includes('b.') ? 6 : 4;
        rig.named
          .get(name)
          .quaternion.setFromAxisAngle(new Vector3(1, 0, 0), (degrees * Math.PI) / 180);
      }
    }
    const pose = rig.capture(keys);
    timeline.push([t, (key) => pose.get(key)]);
  }
  bakeClip(doc, {
    clipName: newName,
    channelKeys: keys,
    timeline,
    donorFor: (key) => donor.get(key),
  });
  for (const c of original.listChannels()) c.dispose();
  for (const s of original.listSamplers()) s.dispose();
  original.dispose();
}
root.setExtras({ elementalVariant: 'fire', source, sourceSha256: sha, staffRemoved: true });
groundElementalDeath(doc);
await doc.transform(prune({ keepLeaves: true }));
await io.write(`${work}/fire_elemental.glb`, doc);
console.log(
  `Built ${work}/fire_elemental.glb; preserved ${root.listSkins()[0].listJoints().length} joints.`,
);
