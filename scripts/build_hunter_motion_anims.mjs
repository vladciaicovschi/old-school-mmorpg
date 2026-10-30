// Native T1 target hierarchy, Longbow motion and Rifle aim with authored recoil.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedup, prune } from '@gltf-transform/functions';
import { Quaternion, Vector3 } from 'three';
import { createHumanoidWorldRetargeter } from './anim/humanoid_world_retarget.mjs';
import { createHunterHipFirePose } from './anim/hunter_hip_fire_pose.mjs';
import {
  bakeClip,
  blendValue,
  createGlbIO,
  indexClip,
  samplePose,
  stripToAnimationsOnly,
} from './anim/pose_blend.mjs';
import { createPoseRig } from './anim/rig_pose.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const io = createGlbIO();
const pack = (await io.read(resolve(ROOT, 'tmp/hunter_motion/donors.glb'))).getRoot();
const doc = await io.read(resolve(ROOT, 'public/models/chars/players/t1_hunter.glb'));
const root = doc.getRoot();
const rig = createPoseRig(root);
const donorRig = createPoseRig(pack);
const template = indexClip(root, 'T1Hunter_Idle');
const keys = [...template.keys()];
const retarget = createHumanoidWorldRetargeter(donorRig, rig, keys);
const approvedJumpRig = createPoseRig(
  (await io.read(resolve(ROOT, 'public/models/chars/players/warlock_t1.glb'))).getRoot(),
);
const approvedJump = indexClip(
  (await io.read(resolve(ROOT, 'public/models/chars/players/warlock_ability_anims.glb'))).getRoot(),
  'WarlockT1_JumpClassic',
);
const retargetJump = createHumanoidWorldRetargeter(approvedJumpRig, rig, keys);
const jumpSeconds = Math.max(...[...approvedJump.values()].map((channel) => channel.times.at(-1)));
const clips = new Map(
  pack.listAnimations().map((a) => [a.getName(), indexClip(pack, a.getName())]),
);
const duration = (name) => Math.max(...[...clips.get(name).values()].map((c) => c.times.at(-1)));
const pose = (name, time) => retarget(samplePose(clips.get(name), time));
const smooth = (v) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, weight) =>
  new Map(keys.map((key) => [key, blendValue(key, a.get(key), b.get(key), weight)]));
// Longbow owns posture and locomotion for both loadouts. Only the arm chains
// borrow Rifle's two-handed carry pose, so the crossbow stays in both palms.
const carryArm = (key) => /mixamorig:(Left|Right)(Shoulder|Arm|ForeArm|Hand)/.test(key);
const locomotionPose = (family, state, time) => {
  const body = pose(`Bow_${state}`, time);
  if (family === 'Bow') return body;
  const grip = pose('Crossbow_Idle', 0);
  return new Map(keys.map((key) => [key, carryArm(key) ? grip.get(key) : body.get(key)]));
};
const authored = [];
function bake(name, seconds, at, loop = false, exactTimes = []) {
  const frames = Math.ceil(seconds * 30);
  const times = [
    ...new Set([
      ...Array.from({ length: frames + 1 }, (_, f) => (seconds * f) / frames),
      ...exactTimes,
    ]),
  ].sort((a, b) => a - b);
  const timeline = times.map((time) => {
    const sampled = at(loop && time === seconds ? 0 : time);
    return [time, (key) => sampled.get(key) ?? rig.rest.get(key)];
  });
  const animation = bakeClip(doc, {
    clipName: name,
    channelKeys: keys,
    timeline,
    donorFor: (key) => template.get(key),
  }).animation;
  animation.setExtras({
    motionSource: name.endsWith('_Jump')
      ? 'Approved WarlockT1_JumpClassic; own T1 Hunter hierarchy and armed carry grips'
      : 'Pro Longbow / Pro Rifle / Magic; own T1 Hunter hierarchy',
  });
  authored.push(animation);
}
for (const family of ['Bow', 'Crossbow']) {
  const idle = locomotionPose(family, 'Idle', 0);
  const aim = pose(`${family}_Aim`, 0);
  for (const state of ['Idle', 'Walk', 'WalkBack', 'Run']) {
    bake(
      `HunterT1_${family}_${state}`,
      duration(`Bow_${state}`),
      (time) => locomotionPose(family, state, time),
      true,
    );
  }
  bake(`HunterT1_${family}_Jump`, jumpSeconds, (time) => {
    const jump = retargetJump(samplePose(approvedJump, time));
    return new Map(keys.map((key) => [key, carryArm(key) ? idle.get(key) : jump.get(key)]));
  });
  bake(
    `HunterT1_${family}_Aim`,
    1,
    (time) => {
      if (time >= 0.6) return aim;
      if (family === 'Crossbow') return mix(idle, aim, smooth(time / 0.35));
      if (time < 0.12) return mix(idle, pose('Bow_Draw', 0.55), smooth(time / 0.12));
      return mix(
        pose('Bow_Draw', Math.min(duration('Bow_Draw'), 0.55 + time - 0.12)),
        aim,
        smooth((time - 0.48) / 0.12),
      );
    },
    false,
    [0.6],
  );
  const recoil = (time, base = aim) => {
    rig.apply(base);
    const amount = time < 0.07 ? smooth(time / 0.07) : 1 - smooth((time - 0.07) / 0.25);
    for (const side of ['Left', 'Right']) {
      const hand = rig.named.get(`mixamorig:${side}Hand`).getWorldPosition(new Vector3());
      const elbow = rig.named.get(`mixamorig:${side}ForeArm`).getWorldPosition(new Vector3());
      const wrist = rig.named.get(`mixamorig:${side}Hand`).getWorldQuaternion(new Quaternion());
      hand.z -= 0.035 * amount;
      rig.hand(side, hand.toArray(), elbow.toArray(), wrist.toArray());
    }
    return rig.capture(keys);
  };
  const releaseDuration = family === 'Bow' ? duration('Bow_Release') : 0.32;
  const release = (time) => (family === 'Bow' ? pose('Bow_Release', time) : recoil(time));
  bake(
    `HunterT1_${family}_Release`,
    releaseDuration + 0.18,
    (time) =>
      time <= releaseDuration
        ? release(time)
        : mix(release(releaseDuration), idle, smooth((time - releaseDuration) / 0.18)),
    false,
    [releaseDuration],
  );
  const hipFire = family === 'Crossbow' ? createHunterHipFirePose(rig, keys, idle, aim) : null;
  // Native Bow release is already anatomical: adding its quaternion deltas to
  // carrying idle folds the draw arm backwards. Keep the source pose/path.
  const quickRelease = (time) => (family === 'Crossbow' ? recoil(time, hipFire) : release(time));
  // Ordinary shots START at launch. No delayed draw/aim ahead of the recoil.
  // Cast-time shots still use the distinct Aim -> Release pair above.
  bake(
    `HunterT1_${family}_Shot`,
    releaseDuration + 0.18,
    (time) => {
      return time <= releaseDuration
        ? quickRelease(time)
        : mix(quickRelease(releaseDuration), idle, smooth((time - releaseDuration) / 0.18));
    },
    false,
    family === 'Bow'
      ? [
          ...new Set(
            [...clips.get('Bow_Release').values()].flatMap((channel) => [...channel.times]),
          ),
        ]
      : [releaseDuration],
  );
}
for (const [source, name, loop] of [
  ['Melee_Punch', 'Hunter_Melee_Gut', false],
  ['Melee_Punch', 'Hunter_Melee_Counter', false],
  ['Melee_Kick', 'Hunter_Melee_Clip', false],
  ['Utility', 'HunterT1_Utility', true],
  ['Buff_Raise', 'Spellcast_Raise', false],
  ['Hit', 'HunterT1_Hit', false],
])
  bake(name, duration(source), (time) => pose(source, time), loop);
for (const animation of [...root.listAnimations()])
  if (!authored.includes(animation)) animation.dispose();
stripToAnimationsOnly(doc, authored);
await doc.transform(prune(), dedup());
const output = resolve(ROOT, 'public/models/chars/players/hunter_t1_motion_anims.glb');
await io.write(output, doc);
console.log(`Wrote ${output}: ${authored.length} clips`);
