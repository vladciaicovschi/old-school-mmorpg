// Bake Warlock's native locomotion, full Playing with Magic and joined release.
// Uses Druid's Locomotion/Pro Magic FBX packs, retargeted onto Warlock's rig.
// First run Blender with scripts/assets/export_warlock_motion_donors.py.
// node scripts/build_warlock_ability_anims.mjs [--preview]
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedup, prune } from '@gltf-transform/functions';
import { Quaternion, Vector3 } from 'three';
import {
  bakeClip,
  blendValue,
  createGlbIO,
  indexClip,
  samplePose,
  stripToAnimationsOnly,
} from './anim/pose_blend.mjs';
import { createPoseRig, retargetPose } from './anim/rig_pose.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const io = createGlbIO();
const doc = await io.read(resolve(ROOT, 'public/models/chars/players/warlock_t1.glb'));
const militia = await io.read(resolve(ROOT, 'public/models/chars/players/warrior_militia.glb'));
const pack = (await io.read(resolve(ROOT, 'tmp/warlock_motion/mixamo_donors.glb'))).getRoot();
const root = doc.getRoot();
const rig = createPoseRig(root);
const donorRig = createPoseRig(militia.getRoot());
const packRig = createPoseRig(pack);
const donors = indexClip(root, 'WarlockT1_Idle');
const keys = [...donors.keys()];
const animations = [];
const smooth = (v) => v * v * (3 - 2 * v);
const duration = (clip) => Math.max(...[...clip.values()].map((ch) => ch.times.at(-1)));
const WINDUP = 0.76;
// Additional physical shoulder spread on top of the baked Mixamo slider.
// This is degrees, not a claimed conversion to Mixamo's Arm Space units.
const IDLE_ARM_SPACE_DEGREES = 8;
// Reduce the previous forward offsets: 1 degree back through the upper
// spine and 2 through each clavicle, relative to the approved arm-guide pose.
const CALM_CHEST_BACK_DEGREES = 1;
const CALM_SHOULDER_BACK_DEGREES = 1;
const packPose = (clip, time) => retargetPose(samplePose(clip, time), packRig.rest, rig.rest);
const mix = (a, b, weight) =>
  new Map(keys.map((key) => [key, blendValue(key, a.get(key), b.get(key), weight)]));

function bake(name, seconds, poseAt, looping = false, source = 'authored') {
  const frames = Math.ceil(seconds * 30);
  const times = new Set(Array.from({ length: frames + 1 }, (_, i) => (i * seconds) / frames));
  if (name.endsWith('_Loop')) times.add(seconds - WINDUP);
  const timeline = [...times]
    .sort((a, b) => a - b)
    .map((time) => {
      const pose = poseAt(time, time / seconds);
      return [time, (key) => pose.get(key) ?? rig.rest.get(key)];
    });
  if (looping) {
    const seam = poseAt(0, 0);
    timeline.at(-1)[1] = (key) => seam.get(key) ?? rig.rest.get(key);
  }
  animations.push(
    bakeClip(doc, {
      clipName: `WarlockT1_${name}`,
      channelKeys: keys,
      timeline,
      donorFor: (key) => donors.get(key),
    }).animation.setExtras({
      motionSource: source,
      ...(name.endsWith('_Loop') ? { nativePreparationSeconds: seconds - WINDUP } : {}),
    }),
  );
}

function turnWorld(bone, axis, degrees) {
  const world = bone
    .getWorldQuaternion(new Quaternion())
    .premultiply(new Quaternion().setFromAxisAngle(axis, (degrees * Math.PI) / 180));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world));
  bone.updateWorldMatrix(false, true);
}

function idlePose(time, calm = false) {
  rig.apply(packPose(indexClip(pack, 'Pack_IdleArmSpace'), time));
  if (calm)
    turnWorld(rig.named.get('mixamorig:Spine1'), new Vector3(1, 0, 0), CALM_CHEST_BACK_DEGREES);
  for (const [side, sign] of [
    ['Left', 1],
    ['Right', -1],
  ]) {
    if (calm)
      turnWorld(
        rig.named.get(`mixamorig:${side}Shoulder`),
        new Vector3(0, 1, 0),
        -sign * CALM_SHOULDER_BACK_DEGREES,
      );
    const arm = rig.named.get(`mixamorig:${side}Arm`);
    const spread = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      (sign * IDLE_ARM_SPACE_DEGREES * Math.PI) / 180,
    );
    const world = arm.getWorldQuaternion(new Quaternion()).premultiply(spread);
    arm.quaternion.copy(arm.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world));
    arm.updateWorldMatrix(false, true);
    if (calm) {
      const fore = rig.named.get(`mixamorig:${side}ForeArm`);
      const hand = rig.named.get(`mixamorig:${side}Hand`);
      const lowerDirection = hand
        .getWorldPosition(new Vector3())
        .sub(fore.getWorldPosition(new Vector3()))
        .normalize();
      // Follow the reviewed front/side guides: keep the elbow clearance from
      // Arm Space, but let the forearm hang almost vertically and slightly
      // forward (+Z, verified from the donor's foot-to-toe direction).
      // Retain the donor's small sway instead of solving a fixed wrist target.
      const desired = lowerDirection.clone();
      desired.x *= 0.1;
      desired.z += 0.18;
      desired.normalize();
      const axis = lowerDirection.clone().cross(desired).normalize();
      turnWorld(fore, axis, (lowerDirection.angleTo(desired) * 180) / Math.PI);
    }
  }
  return rig.capture(keys);
}

for (const [name, source] of [
  ['TravelIdle', 'Pack_IdleArmSpace'],
  ['ReadyIdle', 'Pack_IdleArmSpace'],
  ['TravelWalk', 'Pack_Walk'],
  ['TravelRun', 'Pack_Run'],
]) {
  const clip = indexClip(pack, source);
  bake(
    name,
    duration(clip),
    (time) =>
      source === 'Pack_IdleArmSpace' ? idlePose(time, name === 'TravelIdle') : packPose(clip, time),
    true,
    source === 'Pack_IdleArmSpace'
      ? 'Druid Idle.fbx/Character Arm Space'
      : `Druid Locomotion/${source}`,
  );
}
const staffIdle = indexClip(pack, 'Pack_StaffIdle');
bake(
  'StaffIdle',
  duration(staffIdle),
  (time) => packPose(staffIdle, time),
  true,
  'Druid Pro Melee Axe Pack/standing idle.fbx',
);
const idle = idlePose(0, true);
const playing = indexClip(pack, 'Pack_PlayingWithMagic');
const playingLength = duration(playing);
const playingEnd = packPose(playing, playingLength);
const throwClip = indexClip(pack, 'Pack_ThrowShadow');
const upwardClip = indexClip(pack, 'Pack_ThrowUpward');

for (const kind of ['Shadow', 'Fire', 'Drain', 'Self', 'Ally']) {
  const friendly = kind === 'Self' || kind === 'Ally';
  const attack = friendly ? upwardClip : throwClip;
  // 03's upstroke reaches its high-hand release at 1.05s, later than 01's
  // forward point. Resample that anticipation into the existing shared tail.
  const releaseTime = friendly ? 1.05 : WINDUP;
  const attackLength = duration(attack);
  // Retain the legacy _Loop name for clip-map compatibility, but this now
  // plays ONCE. The full donor is followed by an attack anticipation tail.
  bake(
    `Cast${kind}_Loop`,
    playingLength + WINDUP,
    (time) => {
      if (time <= playingLength) return packPose(playing, time);
      const tail = time - playingLength;
      const sourceTime = friendly ? (tail / WINDUP) * releaseTime : tail;
      return mix(playingEnd, packPose(attack, sourceTime), smooth(Math.min(1, tail / 0.16)));
    },
    false,
    'Pro Magic/Standing Idle 03 (full) + release anticipation',
  );
  const followThrough = attackLength - releaseTime;
  bake(
    `Cast${kind}_Release`,
    followThrough + 0.3,
    (time) => {
      if (time <= followThrough) return packPose(attack, releaseTime + time);
      const end = packPose(attack, attackLength);
      return mix(end, idle, smooth((time - followThrough) / 0.3));
    },
    false,
    friendly
      ? 'Pro Magic/Standing 1H Magic Attack 03 (upward)'
      : 'Pro Magic/Standing 1H Magic Attack 01',
  );
}
const jump = indexClip(militia.getRoot(), 'Warrior_jump');
bake('JumpClassic', duration(jump), (time) => {
  rig.apply(retargetPose(samplePose(jump, time), donorRig.rest, rig.rest));
  return rig.capture(keys);
});
if (process.argv.includes('--preview')) {
  await mkdir(resolve(ROOT, 'tmp/warlock_motion'), { recursive: true });
  await io.write(resolve(ROOT, 'tmp/warlock_motion/preview.glb'), doc);
}
stripToAnimationsOnly(doc, animations);
await doc.transform(prune(), dedup());
await io.write(resolve(ROOT, 'public/models/chars/players/warlock_ability_anims.glb'), doc);
console.log(`Warlock T1: ${animations.length} clips authored on the target rig.`);
