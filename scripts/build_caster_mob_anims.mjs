// Target-specific, animation-only caster presentation. No source body edits,
// foreign bind transforms, runtime IK, new cast clocks or gameplay changes.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedup, prune } from '@gltf-transform/functions';
import {
  CASTER_MOB_CAST_FIT,
  CASTER_MOB_TARGETS,
  casterMobAnimationUrl,
} from './anim/caster_mob_targets.mjs';
import { createHumanoidWorldRetargeter } from './anim/humanoid_world_retarget.mjs';
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
const packRoot = (await io.read(resolve(ROOT, 'tmp/caster_mob_motion/donors.glb'))).getRoot();
const packRig = createPoseRig(packRoot);
const warlockRoot = (
  await io.read(resolve(ROOT, 'public/models/chars/players/warlock_t1.glb'))
).getRoot();
const calmRoot = (
  await io.read(resolve(ROOT, 'public/models/chars/players/warlock_ability_anims.glb'))
).getRoot();
const calmRig = createPoseRig(warlockRoot);
const calm = indexClip(calmRoot, 'WarlockT1_TravelIdle');
const playing = indexClip(packRoot, 'Mob_PlayingWithMagic');
const duration = (clip) => Math.max(...[...clip.values()].map((channel) => channel.times.at(-1)));
const preparationLength = duration(playing);
const tail = CASTER_MOB_CAST_FIT.tailSeconds;
const smooth = (v) => v * v * (3 - 2 * v);

for (const target of CASTER_MOB_TARGETS) {
  const doc = await io.read(resolve(ROOT, 'public', target.bodyUrl));
  const root = doc.getRoot();
  const rig = createPoseRig(root);
  const donors = indexClip(root, target.nativeIdle);
  const keys = [...donors.keys()];
  const fromPack = createHumanoidWorldRetargeter(packRig, rig, keys);
  const fromCalm = createHumanoidWorldRetargeter(calmRig, rig, keys);
  const packPose = (clip, time) => fromPack(samplePose(clip, time));
  const idlePose = (time) => fromCalm(samplePose(calm, time));
  const idle = idlePose(0);
  const playingEnd = packPose(playing, preparationLength);
  const mix = (a, b, weight) =>
    new Map(keys.map((key) => [key, blendValue(key, a.get(key), b.get(key), weight)]));
  const animations = [];
  function bake(name, seconds, at, loop = false, exactTimes = []) {
    const count = Math.ceil(seconds * 30);
    const times = new Set([
      ...Array.from({ length: count + 1 }, (_, frame) => (frame * seconds) / count),
      ...exactTimes,
    ]);
    const timeline = [...times]
      .sort((a, b) => a - b)
      .map((time) => {
        const pose = at(loop && time === seconds ? 0 : time);
        return [time, (key) => pose.get(key) ?? rig.rest.get(key)];
      });
    animations.push(
      bakeClip(doc, {
        clipName: `${target.prefix}_${name}`,
        channelKeys: keys,
        timeline,
        donorFor: (key) => donors.get(key),
      }).animation.setExtras({
        motionSource: 'Approved calm idle / Pro Magic Pack; parent-first world-rest retarget',
        nativePreparationSeconds: preparationLength,
      }),
    );
  }
  bake('Idle', duration(calm), idlePose, true);
  for (const [kind, source, anticipationStart, releaseTime] of [
    ['Hostile', 'Mob_TwoHandAttack01', 0.8, 1.2],
    ['Friendly', 'Mob_TwoHandAttack05', 1.3, 49 / 30],
  ]) {
    const attack = indexClip(packRoot, source);
    const attackLength = duration(attack);
    const anticipation = (time) =>
      mix(
        playingEnd,
        packPose(attack, anticipationStart + ((releaseTime - anticipationStart) * time) / tail),
        smooth(Math.min(1, time / 0.16)),
      );
    const followThrough = attackLength - releaseTime;
    const recovery = 0.3;
    const release = (time) =>
      time <= followThrough
        ? packPose(attack, releaseTime + time)
        : mix(packPose(attack, attackLength), idle, smooth((time - followThrough) / recovery));
    bake(
      `Prepare${kind}`,
      preparationLength + tail,
      (time) =>
        time <= preparationLength
          ? packPose(playing, time)
          : anticipation(time - preparationLength),
      false,
      [preparationLength],
    );
    bake(`Release${kind}`, followThrough + recovery, release, false, [followThrough]);
    if (kind === 'Hostile') {
      // Existing id-less mob auto-attacks have no authoritative cast bar.
      // Give that route a complete short ceremony, not a fabricated AI cast.
      const shortPreparation = 0.18;
      const shortAnticipation = 0.3;
      bake('Attack', shortPreparation + shortAnticipation + followThrough + recovery, (time) =>
        time <= shortPreparation
          ? packPose(playing, preparationLength - shortPreparation + time)
          : time <= shortPreparation + shortAnticipation
            ? anticipation(((time - shortPreparation) * tail) / shortAnticipation)
            : release(time - shortPreparation - shortAnticipation),
      );
    }
  }
  stripToAnimationsOnly(doc, animations);
  await doc.transform(prune(), dedup());
  await io.write(resolve(ROOT, 'public', casterMobAnimationUrl(target)), doc);
  console.log(`${target.visualKey}: ${animations.length} target-rig clips authored.`);
}
