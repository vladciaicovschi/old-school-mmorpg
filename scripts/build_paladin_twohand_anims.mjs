// Transfer inspected Warrior two-hand motion onto the T1 Paladin offline.
// No runtime retarget, mesh/texture changes or edits to its original 1H clips.
import { dedup, prune } from '@gltf-transform/functions';
import {
  bakeClip,
  createGlbIO,
  indexClip,
  samplePose,
  stripToAnimationsOnly,
} from './anim/pose_blend.mjs';
import { createPoseRig, retargetPose } from './anim/rig_pose.mjs';

const io = createGlbIO();
const doc = await io.read('public/models/chars/players/t1_paladin.glb');
const rig = createPoseRig(doc.getRoot());
const donorRig = createPoseRig(
  (await io.read('public/models/chars/players/t1_warrior.glb')).getRoot(),
);
const source = (await io.read('public/models/chars/players/warrior_t1_motion_anims.glb')).getRoot();
const target = indexClip(doc.getRoot(), 'T1Paladin_Idle');
const animations = [];
const twohandSuffixes = [
  'Idle',
  'Walk',
  'Run',
  'Jump',
  'AttackA',
  'AttackB',
  'AttackC',
  'AttackSpin',
  'Cast',
  'Hit',
  'Block',
];
const transfers = [
  ...twohandSuffixes.map((suffix) => [
    `WarriorT1_TwoHand_${suffix}`,
    `PaladinT1_TwoHand_${suffix}`,
    ['Idle', 'Walk', 'Run'].includes(suffix),
  ]),
  // Shared travel names let the existing carry-gesture generator preserve the
  // authored gaits instead of substituting its old procedural arm prototype.
  ...['Idle', 'Walk', 'Run'].map((suffix) => [
    `Warrior_Travel${suffix}`,
    `Warrior_Travel${suffix}`,
    true,
  ]),
  ['WarriorT1_Unarmed_Jump', 'PaladinT1_Unarmed_Jump', false],
];
for (const [name, outputName, loop] of transfers) {
  const clip = indexClip(source, name);
  const duration = Math.max(...[...clip.values()].map((channel) => channel.times.at(-1)));
  const frames = Math.ceil(duration * 30);
  const timeline = Array.from({ length: frames + 1 }, (_, frame) => {
    const time = (duration * frame) / frames;
    const pose = retargetPose(
      samplePose(clip, loop && frame === frames ? 0 : time),
      donorRig.rest,
      rig.rest,
    );
    return [time, (key) => pose.get(key) ?? rig.rest.get(key)];
  });
  animations.push(
    bakeClip(doc, {
      clipName: outputName,
      channelKeys: target.keys(),
      timeline,
      donorFor: (key) => target.get(key),
    }).animation.setExtras({ motionSource: name, nativeSeconds: duration }),
  );
}
stripToAnimationsOnly(doc, animations);
await doc.transform(prune(), dedup());
await io.write('public/models/chars/players/paladin_twohand_motion_anims.glb', doc);
console.log(`Paladin T1: ${animations.length} target-rig two-hand and free-hand clips.`);
