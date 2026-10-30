// Repair native wolf muzzle weights; V2 additionally separates fused canines.
// Run after Blender export and before build_assets, or on the compressed GLB:
// node scripts/anim/repair_smart_wolf_muzzle.mjs <wolf.glb>
// V2 uses its original source coordinates, before Blender stance normalization:
// node scripts/anim/repair_smart_wolf_muzzle.mjs <wolf_v2.glb> --v2 --out <fixed.glb>
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Vector3 } from 'three';
import { createGlbIO } from './pose_blend.mjs';
import { createPoseRig } from './rig_pose.mjs';

const REVISION = 1;
const smooth = (v) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * t * (10 + t * (-15 + 6 * t));
};

export function repairWolfMuzzle(root, variant = 'wolf') {
  const v2 = variant === 'wolf_v2';
  if (!v2 && variant !== 'wolf') throw new Error(`Unknown wolf skin profile: ${variant}`);
  const revisionKey = v2 ? 'wolf_v2_muzzle_skin_revision' : 'wolf_muzzle_skin_revision';
  const revision = v2 ? 2 : REVISION;
  if (v2 && root.listNodes().some((n) => n.getExtras().wolf_v2_stance_revision))
    throw new Error('Repair wolf_v2 in original source space before stance normalization');
  const skin = root.listSkins()[0];
  const mesh = root.listMeshes()[0];
  const primitive = root.listMeshes()[0]?.listPrimitives()[0];
  const added =
    v2 && mesh?.getExtras().wolf_v2_teeth_revision === 1
      ? Number(mesh.getExtras().wolf_v2_teeth_added_triangles) * 3
      : 0;
  if (
    skin?.listJoints().length !== (v2 ? 47 : 43) ||
    primitive?.getIndices()?.getCount() !== (v2 ? 312252 + added : 311877)
  )
    throw new Error(`Unexpected ${variant} source topology`);
  if (mesh.getExtras()[revisionKey] === revision) return { alreadyRepaired: true };
  const rig = createPoseRig(root);
  const bones = skin.listJoints();
  const skull = bones.findIndex((b) => b.getName() === (v2 ? 'Bone_025' : 'Bone_022'));
  const moving = new Set(
    v2
      ? ['Bone_042', 'Bone_041']
      : ['Bone_038', 'Bone_037', 'Bone_040', 'Bone_039', 'Bone_042', 'Bone_041'],
  );
  const position = primitive.getAttribute('POSITION');
  const weights = primitive.getAttribute('WEIGHTS_0');
  const joints = primitive.getAttribute('JOINTS_0');
  const inverse = skin.getInverseBindMatrices();
  if (!position || !weights || !joints || !inverse || skull < 0)
    throw new Error('Missing wolf skin');
  const v = [],
    w = [],
    j = [],
    m = [];
  const transforms = bones.map((b, i) => {
    inverse.getElement(i, m);
    return new Matrix4().multiplyMatrices(
      rig.named.get(b.getName()).matrixWorld,
      new Matrix4().fromArray(m),
    );
  });
  let changed = 0;
  for (let i = 0; i < position.getCount(); i++) {
    position.getElement(i, v);
    weights.getElement(i, w);
    joints.getElement(i, j);
    const p = new Vector3();
    for (let k = 0; k < 4; k++)
      p.addScaledVector(new Vector3().fromArray(v).applyMatrix4(transforms[j[k]]), w[k]);
    // The lip rises toward the nose. Feather above it, behind the muzzle and
    // into the cheeks; leave the lower lip, jaw hinge, eyes and ears intact.
    const lip = 1.08 + 0.2 * (p.z - 0.98);
    const upperMuzzle = smooth((p.z - 0.98) / 0.1) * smooth((p.y - lip) / 0.025);
    // The black nose extends below that lip plane. Keep its whole surface
    // rigid, with a separate short feather below the nose rather than through it.
    const noseCap = smooth((p.z - 1.1) / 0.05) * smooth((p.y - 1.095) / 0.015);
    // V2 is repaired BEFORE stance normalization, in its original source space.
    // Its open mouth places the lower lip well below this upper-snout mask.
    // Follow the underside of the entire upper lip, not the muzzle bridge.
    // The old bridge mask left the nose rim and upper lip on the mandible.
    const v2Lip = 1.055 - 0.18 * (p.z - 1.02);
    const v2Upper = smooth((p.z - 0.99) / 0.065) * smooth((p.y - (v2Lip - 0.022)) / 0.015);
    const v2Nose = smooth((p.z - 1.17) / 0.025) * smooth((p.y - 1.005) / 0.015);
    const mask = v2
      ? Math.max(v2Upper, v2Nose) *
        (1 - smooth((p.y - 1.36) / 0.07)) *
        (1 - smooth((Math.abs(p.x - 0.402) - 0.15) / 0.07))
      : Math.max(upperMuzzle, noseCap) *
        (1 - smooth((p.y - 1.43) / 0.07)) *
        (1 - smooth((Math.abs(p.x - 0.1283) - 0.14) / 0.07));
    if (mask < 0.0001) continue;
    const next = new Map();
    let transfer = 0;
    for (let k = 0; k < 4; k++) {
      const amount = moving.has(bones[j[k]].getName()) ? w[k] * mask : 0;
      next.set(j[k], (next.get(j[k]) ?? 0) + w[k] - amount);
      transfer += amount;
    }
    if (transfer < 0.0001) continue;
    next.set(skull, (next.get(skull) ?? 0) + transfer);
    const other = [...next]
      .filter(([id, value]) => id !== skull && value > 0)
      .sort((a, b) => b[1] - a[1]);
    // Keep the existing four-influence format. Tiny overflow goes to the skull.
    const rows = [
      [skull, next.get(skull) + other.slice(3).reduce((s, row) => s + row[1], 0)],
      ...other.slice(0, 3),
    ];
    const sum = rows.reduce((s, row) => s + row[1], 0);
    while (rows.length < 4) rows.push([0, 0]);
    const values = rows.map((row) => row[1] / sum);
    if (weights.getNormalized() && weights.getArray() instanceof Uint8Array) {
      const quantized = values.map((value) => Math.floor(value * 255));
      const order = values
        .map((value, k) => [k, value * 255 - quantized[k]])
        .sort((a, b) => b[1] - a[1]);
      const missing = 255 - quantized.reduce((a, b) => a + b, 0);
      for (let k = 0; k < missing; k++) quantized[order[k][0]]++;
      weights.setElement(
        i,
        quantized.map((value) => value / 255),
      );
    } else weights.setElement(i, values);
    joints.setElement(
      i,
      rows.map((row) => row[0]),
    );
    changed++;
  }
  mesh.setExtras({ ...mesh.getExtras(), [revisionKey]: revision });
  for (const node of root.listNodes())
    if (node.getMesh() === mesh)
      node.setExtras({
        ...node.getExtras(),
        source: v2
          ? 'Owner wolf_v2; native body and PBR maps; local upper-lip skin and canine correction'
          : 'Owner-supplied Meshy Smart Rig wolf; original geometry and PBR maps; local upper-muzzle skin correction',
      });
  return { changed, vertices: position.getCount() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: repair_smart_wolf_muzzle.mjs <wolf.glb>');
  const io = createGlbIO();
  const doc = await io.read(path);
  const variant = process.argv.includes('--v2') ? 'wolf_v2' : 'wolf';
  const output = process.argv.includes('--out')
    ? process.argv[process.argv.indexOf('--out') + 1]
    : path;
  const report = repairWolfMuzzle(doc.getRoot(), variant);
  if (variant === 'wolf_v2') {
    const { repairWolfV2Teeth } = await import('./repair_wolf_v2_teeth.mjs');
    report.teeth = await repairWolfV2Teeth(doc.getRoot());
  }
  if (!report.alreadyRepaired || (report.teeth && !report.teeth.alreadyRepaired) || output !== path)
    await io.write(output, doc);
  console.log(JSON.stringify(report));
}
