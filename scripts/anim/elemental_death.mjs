// Offline contact correction for the separated pieces of the Ashcaller rig.
// Rotations/weights/topology stay authored; each rigid assembly gets its own
// world-Y landing, with inherited parent translations explicitly compensated.
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { bakeClip, indexClip, samplePose } from './pose_blend.mjs';
import { createPoseRig } from './rig_pose.mjs';

export function groundElementalDeath(doc) {
  const root = doc.getRoot(),
    skin = root.listSkins()[0],
    joints = skin.listJoints();
  const rig = createPoseRig(root);
  rig.apply(new Map());
  const jointSet = new Set(joints.map((j) => j.getName()));
  const groups = new Map();
  const group = (name) => {
    if (!groups.has(name)) groups.set(name, { skin: [], rigid: [] });
    return groups.get(name);
  };
  const body = root
    .listNodes()
    .find((n) => n.getSkin() === skin)
    .getMesh()
    .listPrimitives()[0];
  const positions = body.getAttribute('POSITION'),
    weights = body.getAttribute('WEIGHTS_0'),
    indices = body.getAttribute('JOINTS_0');
  const vertices = [];
  for (let i = 0; i < positions.getCount(); i++) {
    const w = weights.getElement(i, []),
      ids = indices.getElement(i, []);
    let name = joints[ids[w.indexOf(Math.max(...w))]].getName();
    // Fingers and thumbs form one connected hand, so never drop them apart.
    let ancestor = rig.named.get(name);
    while (ancestor && ancestor.name !== 'hand.r' && ancestor.name !== 'hand.l')
      ancestor = ancestor.parent;
    if (ancestor) name = ancestor.name;
    const v = { p: new Vector3().fromArray(positions.getElement(i, [])), w, ids };
    group(name).skin.push(v);
    vertices.push(v);
  }
  assert.equal(vertices.length, 11794);
  for (const node of root.listNodes()) {
    if (!node.getMesh() || node.getSkin()) continue;
    let parent = node.getParentNode();
    while (parent && !jointSet.has(parent.getName())) parent = parent.getParentNode();
    if (!parent) continue;
    for (const primitive of node.getMesh().listPrimitives()) {
      const pos = primitive.getAttribute('POSITION');
      for (let i = 0; i < pos.getCount(); i++)
        group(parent.getName()).rigid.push({
          p: new Vector3().fromArray(pos.getElement(i, [])),
          node: rig.named.get(node.getName()),
        });
    }
  }
  const bind = joints.map((_, i) =>
    new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i, [])),
  );
  const matrices = joints.map(() => new Matrix4());
  const sample = new Vector3(),
    point = new Vector3();
  function mins(includeRigid = true) {
    joints.forEach((joint, i) => {
      matrices[i].multiplyMatrices(rig.named.get(joint.getName()).matrixWorld, bind[i]);
    });
    const result = new Map();
    for (const [name, assembly] of groups) {
      let min = Infinity;
      for (const v of assembly.skin) {
        sample.set(0, 0, 0);
        for (let k = 0; k < 4; k++)
          if (v.w[k])
            sample.addScaledVector(point.copy(v.p).applyMatrix4(matrices[v.ids[k]]), v.w[k]);
        min = Math.min(min, sample.y);
      }
      if (includeRigid)
        for (const v of assembly.rigid)
          min = Math.min(min, point.copy(v.p).applyMatrix4(v.node.matrixWorld).y);
      result.set(name, min);
    }
    return result;
  }
  // prepareVisual measures the skinned body at min(.5, idle.duration*.5).
  // Its normalized ground anchor is that posed minimum, not the bind-pose min.
  const idleName = root
    .listAnimations()
    .find((a) => /(?:^|_)Idle$/.test(a.getName()))
    .getName();
  const idle = indexClip(root, idleName);
  const idleDuration = Math.max(...[...idle.values()].map((c) => c.times.at(-1)));
  rig.apply(samplePose(idle, Math.min(0.5, idleDuration * 0.5)));
  const floor = Math.min(...mins(false).values());
  const donor = indexClip(root, 'Death'),
    keys = [...donor.keys()];
  const duration = Math.max(...[...donor.values()].map((c) => c.times.at(-1)));
  const depth = (o) => (o.parent ? 1 + depth(o.parent) : 0);
  const ordered = joints.map((j) => rig.named.get(j.getName())).sort((a, b) => depth(a) - depth(b));
  const inverse = new Matrix4(),
    zero = new Vector3(),
    delta = new Vector3();
  const timeline = [];
  for (let frame = 0; frame <= Math.round(duration * 30); frame++) {
    const t = Math.min(duration, frame / 30);
    rig.apply(samplePose(donor, t));
    const u = Math.max(0, Math.min(1, (t - 0.9) / 1.6));
    const blend = u * u * (3 - 2 * u);
    const contact = mins(),
      inherited = new Map();
    for (const bone of ordered) {
      let parent = bone.parent;
      while (parent && !inherited.has(parent)) parent = parent.parent;
      const parentDrop = inherited.get(parent) ?? 0;
      const ownDrop = contact.has(bone.name)
        ? (floor - contact.get(bone.name)) * blend
        : parentDrop;
      inverse.copy(bone.parent.matrixWorld).invert();
      delta
        .set(0, ownDrop - parentDrop, 0)
        .applyMatrix4(inverse)
        .sub(zero.set(0, 0, 0).applyMatrix4(inverse));
      bone.position.add(delta);
      bone.updateWorldMatrix(true, true);
      inherited.set(bone, ownDrop);
    }
    const pose = rig.capture(keys);
    timeline.push([t, (key) => pose.get(key)]);
  }
  const original = root.listAnimations().find((a) => a.getName() === 'Death');
  bakeClip(doc, {
    clipName: 'Death',
    channelKeys: keys,
    timeline,
    donorFor: (key) => donor.get(key),
  });
  for (const channel of original.listChannels()) channel.dispose();
  for (const sampler of original.listSamplers()) sampler.dispose();
  original.dispose();
  console.log(`Grounded Death: ${groups.size} assemblies, floor ${floor.toFixed(6)}.`);
}
