// Native T1 Warrior unarmed travel and equipment-specific combat motion.
// Run export_warrior_motion_donors.py first, then this script [--preview].
// Keeps target bind lengths and PBR body intact; no runtime retarget/arm override.
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedup, prune } from '@gltf-transform/functions';
import {
  bakeClip,
  createGlbIO,
  indexClip,
  samplePose,
  stripToAnimationsOnly,
} from './anim/pose_blend.mjs';
import { createPoseRig, retargetPose } from './anim/rig_pose.mjs';
import { UPRIGHT_SPIN_WINDOW, uprightWeaponSpinTimeline } from './anim/upright_weapon_spin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const io = createGlbIO();
const doc = await io.read(resolve(ROOT, 'public/models/chars/players/t1_warrior.glb'));
const root = doc.getRoot();
const rig = createPoseRig(root);
const pack = (await io.read(resolve(ROOT, 'tmp/warrior_motion/mixamo_donors.glb'))).getRoot();
const packRig = createPoseRig(pack);
const warlock = (
  await io.read(resolve(ROOT, 'public/models/chars/players/warlock_t1.glb'))
).getRoot();
const calmRig = createPoseRig(warlock);
const calm = (
  await io.read(resolve(ROOT, 'public/models/chars/players/warlock_ability_anims.glb'))
).getRoot();
const target = indexClip(root, 'T1Warrior_Idle');
const keys = [...target.keys()];
const animations = [];
const duration = (clip) => Math.max(...[...clip.values()].map((ch) => ch.times.at(-1)));

function bake(name, clip, donorRig, seconds, looping, provenance, transformPose) {
  const sourceLength = duration(clip);
  const count = Math.ceil(seconds * 30);
  const timeline = Array.from({ length: count + 1 }, (_, frame) => {
    const time = (frame * seconds) / count;
    const sourceTime = looping && frame === count ? 0 : (time / seconds) * sourceLength;
    const pose = retargetPose(samplePose(clip, sourceTime), donorRig.rest, rig.rest);
    transformPose?.(pose);
    return [time, (key) => pose.get(key) ?? rig.rest.get(key)];
  });
  animations.push(
    bakeClip(doc, {
      clipName: name,
      channelKeys: keys,
      timeline,
      donorFor: (key) => target.get(key),
    }).animation.setExtras({ motionSource: provenance, nativeSeconds: sourceLength }),
  );
}

// Reuse the user's accepted natural idle rather than duplicating its earlier
// A-pose/elbow-sign experiments. This is an offline rest-delta transfer only.
const approvedIdle = indexClip(calm, 'WarlockT1_TravelIdle');
bake(
  'Warrior_TravelIdle',
  approvedIdle,
  calmRig,
  duration(approvedIdle),
  true,
  'Druid Idle.fbx via approved Warlock calm idle',
);
for (const animation of pack.listAnimations()) {
  const source = animation.getName();
  if (source === 'Unarmed_Idle') continue;
  const clip = indexClip(pack, source);
  // The pack filenames do not promise grounded attacks: slash (2) is a
  // full spin, and Shield's generic attack leaps. Keep those takes available
  // under explicit special names; ordinary A/B/C use inspected native slashes.
  const selectedNames = {
    Shield_AttackB: 'Shield_SpecialSpin',
    Shield_AttackC: 'Shield_SpecialJumpAttack',
    Shield_AttackD: 'Shield_AttackB',
    Shield_AttackF: 'Shield_AttackC',
    TwoHand_AttackB: 'TwoHand_SpecialSpin',
    TwoHand_AttackC: 'TwoHand_ExtraStrike',
    TwoHand_AttackD: 'TwoHand_AttackB',
    TwoHand_AttackF: 'TwoHand_AttackC',
    OneHand_AttackC: 'OneHand_SpecialBackhand',
  };
  const jump = source.endsWith('_Jump');
  const name =
    source === 'Unarmed_Walk'
      ? 'Warrior_TravelWalk'
      : source === 'Unarmed_Run'
        ? 'Warrior_TravelRun'
        : `WarriorT1_${jump ? source.replace('_Jump', '_PackJump') : (selectedNames[source] ?? source)}`;
  const looping = /_(Idle|Walk|Run)$/.test(source);
  bake(
    name,
    clip,
    packRig,
    duration(clip),
    looping,
    source.startsWith('Unarmed_')
      ? 'Druid Locomotion Pack'
      : source.startsWith('Shield_')
        ? 'Warrior Pro Sword and Shield Pack'
        : source.startsWith('TwoHand_')
          ? 'Warrior Great Sword Pack'
          : 'Warrior Pro Melee Axe Pack',
  );
}

// The source jump has animation-authored lift in addition to simulation
// height. Reuse the user's accepted classic jump, including its exact clock,
// rather than speeding unrelated full-body pack jumps into a short window.
const approvedJump = indexClip(calm, 'WarlockT1_JumpClassic');
for (const family of ['Unarmed', 'Shield', 'OneHand', 'TwoHand']) {
  const hold =
    family === 'Unarmed'
      ? null
      : retargetPose(samplePose(indexClip(pack, `${family}_Idle`), 0), packRig.rest, rig.rest);
  bake(
    `WarriorT1_${family}_Jump`,
    approvedJump,
    calmRig,
    duration(approvedJump),
    false,
    'Approved WarlockT1_JumpClassic; armed families preserve native idle grips',
    hold
      ? (pose) => {
          for (const [key, value] of hold) {
            if (/^mixamorig:(Left|Right)(Shoulder|Arm|ForeArm|Hand.*)\|/.test(key))
              pose.set(key, value);
          }
        }
      : undefined,
  );
}
const uprightIdle = retargetPose(
  samplePose(indexClip(pack, 'TwoHand_Idle'), 0),
  packRig.rest,
  rig.rest,
);
animations.push(
  bakeClip(doc, {
    clipName: 'WarriorT1_TwoHand_AttackSpin',
    channelKeys: keys,
    timeline: uprightWeaponSpinTimeline(
      indexClip(pack, 'TwoHand_AttackB'),
      uprightIdle,
      packRig.rest,
      rig.rest,
    ),
    donorFor: (key) => target.get(key),
  }).animation.setExtras({
    motionSource: 'Warrior Great Sword Pack; upright upper-plane spin slice',
    sourceWindow: UPRIGHT_SPIN_WINDOW,
  }),
);
if (process.argv.includes('--preview')) {
  await mkdir(resolve(ROOT, 'tmp/warrior_motion'), { recursive: true });
  await io.write(resolve(ROOT, 'tmp/warrior_motion/preview.glb'), doc);
}
stripToAnimationsOnly(doc, animations);
await doc.transform(prune(), dedup());
await io.write(resolve(ROOT, 'public/models/chars/players/warrior_t1_motion_anims.glb'), doc);
console.log(`Warrior T1: ${animations.length} target-rig clips authored.`);
