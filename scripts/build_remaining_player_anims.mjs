// Offline native-rig migration of the five remaining T1 classes.
// Approved finalized Warrior/Warlock donors retain their exact motion clocks.
// Raw Rogue stabbing variants are imported separately; body assets stay intact.
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
const load = async (url) => (await io.read(url)).getRoot();
const warriorBody = await load('public/models/chars/players/t1_warrior.glb');
const warlockBody = await load('public/models/chars/players/warlock_t1.glb');
const sources = {
  warrior: {
    root: await load('public/models/chars/players/warrior_t1_motion_anims.glb'),
    rig: createPoseRig(warriorBody),
  },
  warlock: {
    root: await load('public/models/chars/players/warlock_ability_anims.glb'),
    rig: createPoseRig(warlockBody),
  },
  magic: { root: warlockBody, rig: createPoseRig(warlockBody) },
};
const rogue = await load('tmp/rogue_motion/donors.glb');
sources.rogue = { root: rogue, rig: createPoseRig(rogue) };
const seconds = (clip) => Math.max(...[...clip.values()].map((ch) => ch.times.at(-1)));
const classes = ['mage', 'priest', 'druid', 'shaman', 'rogue'];
const requested = process.argv.slice(2);
for (const cls of requested.length ? requested : classes) {
  if (!classes.includes(cls)) throw Error(`Unsupported T1 migration: ${cls}`);
  const doc = await io.read(`public/models/chars/players/t1_${cls}.glb`);
  const root = doc.getRoot();
  const rig = createPoseRig(root);
  const prefix = `T1${cls[0].toUpperCase()}${cls.slice(1)}Motion_`;
  const template = indexClip(root, `T1${cls[0].toUpperCase()}${cls.slice(1)}_Idle`);
  const keys = [...template.keys()];
  const animations = [];
  function transfer(name, sourceKind, sourceName, loop = false, poseOverride) {
    const source = sources[sourceKind];
    const clip = indexClip(source.root, sourceName);
    const duration = seconds(clip);
    // Include source key times as well as 30Hz samples, preserving exact cast
    // seams and the preparation-tail boundary instead of resampling past it.
    const count = Math.ceil(duration * 30);
    const times = new Set([
      ...Array.from({ length: count + 1 }, (_, i) => (duration * i) / count),
      ...[...clip.values()].flatMap((ch) => [...ch.times]),
    ]);
    const timeline = [...times]
      .sort((a, b) => a - b)
      .map((time) => {
        const pose = retargetPose(
          samplePose(clip, loop && time === duration ? 0 : time),
          source.rig.rest,
          rig.rest,
        );
        poseOverride?.(pose);
        return [time, (key) => pose.get(key) ?? rig.rest.get(key)];
      });
    animations.push(
      bakeClip(doc, {
        clipName: name.startsWith('Warrior_') ? name : prefix + name,
        channelKeys: keys,
        timeline,
        donorFor: (key) => template.get(key),
      }).animation.setExtras({ motionSource: sourceName, nativeSeconds: duration }),
    );
  }
  const armed = cls === 'shaman' || cls === 'rogue';
  for (const suffix of ['Idle', 'Walk', 'Run']) {
    transfer(
      armed ? `Warrior_Travel${suffix}` : `Travel${suffix}`,
      'warlock',
      `WarlockT1_Travel${suffix}`,
      true,
    );
  }
  transfer('Jump', 'warlock', 'WarlockT1_JumpClassic');
  transfer('Hit', 'warrior', 'WarriorT1_OneHand_Hit');
  if (cls !== 'rogue') {
    transfer('ReadyIdle', 'warlock', 'WarlockT1_ReadyIdle', true);
    transfer('StaffIdle', 'warlock', 'WarlockT1_StaffIdle', true);
    transfer('MagicAttack', 'magic', 'WarlockT1_CastShadow');
    for (const family of ['Shadow', 'Fire', 'Drain', 'Self', 'Ally']) {
      for (const phase of ['Loop', 'Release'])
        transfer(`Cast${family}_${phase}`, 'warlock', `WarlockT1_Cast${family}_${phase}`);
    }
  }
  if (cls === 'shaman') {
    for (const family of ['OneHand', 'Shield', 'TwoHand']) {
      for (const suffix of [
        'Idle',
        'Walk',
        'Run',
        'Jump',
        'AttackA',
        'AttackB',
        'AttackC',
        'Hit',
      ]) {
        if (family === 'OneHand' && suffix === 'AttackC') continue;
        transfer(
          `${family}_${suffix}`,
          'warrior',
          `WarriorT1_${family}_${suffix}`,
          ['Idle', 'Walk', 'Run'].includes(suffix),
        );
      }
    }
  }
  if (cls === 'rogue') {
    const guard = retargetPose(
      samplePose(indexClip(rogue, 'Rogue_StabA'), 0),
      sources.rogue.rig.rest,
      rig.rest,
    );
    const holdGuard = (pose) => {
      for (const [key, value] of guard)
        if (/^mixamorig:(Left|Right)(Shoulder|Arm|ForeArm|Hand.*)\|/.test(key))
          pose.set(key, value);
    };
    transfer('ReadyIdle', 'warlock', 'WarlockT1_TravelIdle', true, holdGuard);
    transfer('ArmedJump', 'warlock', 'WarlockT1_JumpClassic', false, holdGuard);
    for (const suffix of ['StabA', 'StabB', 'StabC', 'Kick', 'Utility'])
      transfer(suffix, 'rogue', `Rogue_${suffix}`);
  }
  stripToAnimationsOnly(doc, animations);
  await doc.transform(prune(), dedup());
  await io.write(`public/models/chars/players/${cls}_t1_motion_anims.glb`, doc);
  console.log(`${cls}: ${animations.length} native target-rig clips.`);
}
