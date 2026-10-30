import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createGlbIO, indexClip, samplePose } from '../scripts/anim/pose_blend.mjs';
import { createPoseRig } from '../scripts/anim/rig_pose.mjs';

describe('native wolf muzzle skin', () => {
  it.each(['Wolf_BiteLeft', 'Wolf_BiteRight', 'Wolf_Lunge'])(
    '%s opens the lower jaw without bending the upper nose',
    async (name) => {
      const root = (await createGlbIO().read('public/models/creatures/smart_wolf.glb')).getRoot();
      const rig = createPoseRig(root);
      const skin = root.listSkins()[0];
      const primitive = root.listMeshes()[0].listPrimitives()[0];
      const position = primitive.getAttribute('POSITION');
      const weights = primitive.getAttribute('WEIGHTS_0');
      const joints = primitive.getAttribute('JOINTS_0');
      const inverse = skin.getInverseBindMatrices();
      if (!position || !weights || !joints || !inverse) throw new Error('Missing wolf skin');
      const v: number[] = [],
        w: number[] = [],
        j: number[] = [],
        m: number[] = [];
      const matrices = () =>
        skin.listJoints().map((bone, i) => {
          const node = rig.named.get(bone.getName());
          if (!node) throw new Error('Missing joint');
          inverse.getElement(i, m);
          return new Matrix4().multiplyMatrices(node.matrixWorld, new Matrix4().fromArray(m));
        });
      const point = (index: number, transforms: Matrix4[]) => {
        position.getElement(index, v);
        weights.getElement(index, w);
        joints.getElement(index, j);
        const out = new Vector3();
        for (let k = 0; k < 4; k++)
          out.addScaledVector(new Vector3().fromArray(v).applyMatrix4(transforms[j[k]]), w[k]);
        return out;
      };
      const bind = matrices();
      const vertices = Array.from({ length: position.getCount() }, (_, i) => ({
        i,
        p: point(i, bind),
      }));
      const nose = vertices.filter(({ p }) => p.z > 1.16 && p.y > 1.115 && p.y < 1.32);
      const lowerLip = vertices.filter(
        ({ p }) => p.z > 1.06 && p.z < 1.15 && p.y > 1.03 && p.y < 1.08,
      );
      expect(lowerLip.length).toBeGreaterThan(10);
      const head = rig.named.get('Bone_022');
      if (!head) throw new Error('Missing skull');
      const headBindInverse = head.matrixWorld.clone().invert();
      expect(nose.length, 'must inspect the actual nose surface').toBeGreaterThan(60);
      const pairs: [number, number, number][] = [];
      for (let a = 0; a < nose.length; a++)
        for (let b = a + 1; b < nose.length; b++) {
          const distance = nose[a].p.distanceTo(nose[b].p);
          if (distance > 0.04) pairs.push([a, b, distance]);
        }
      const clip = indexClip(root, name);
      const seconds = Math.max(...[...clip.values()].map((ch) => ch.times.at(-1) ?? 0));
      let strain = 0;
      for (let frame = 0; frame <= 40; frame++) {
        rig.apply(samplePose(clip, (seconds * frame) / 40));
        const transforms = matrices();
        const posed = nose.map(({ i }) => point(i, transforms));
        for (const [a, b, distance] of pairs)
          strain = Math.max(strain, Math.abs(posed[a].distanceTo(posed[b]) / distance - 1));
      }
      expect(strain, 'nose stretches or folds during the bite').toBeLessThan(0.02);
      rig.apply(samplePose(clip, seconds * 0.32));
      const opened = matrices();
      const lipTravel =
        lowerLip.reduce(
          (sum, { i, p }) =>
            sum +
            point(i, opened).distanceTo(
              p.clone().applyMatrix4(headBindInverse).applyMatrix4(head.matrixWorld),
            ),
          0,
        ) / lowerLip.length;
      expect(lipTravel, 'lower lip must move independently of the rigid nose').toBeGreaterThan(
        0.02,
      );
      const jaw = rig.named.get('Bone_038');
      const rest = rig.rest.get('Bone_038|rotation');
      if (!jaw || !rest) throw new Error('Missing jaw');
      expect(
        jaw.quaternion.angleTo(jaw.quaternion.clone().fromArray(rest)),
        'jaw opening was lost',
      ).toBeGreaterThan(0.4);
    },
  );
});
