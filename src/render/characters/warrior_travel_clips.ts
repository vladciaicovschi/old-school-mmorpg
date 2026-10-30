import * as THREE from 'three';

import { WARRIOR_HIP_CARRY_CLIPS, WARRIOR_TRAVEL_CLIPS } from './warrior_travel_names';

export { WARRIOR_TRAVEL_CLIPS } from './warrior_travel_names';

export const WARRIOR_WEAPON_GESTURE_DURATION = 0.8;
/** Both hands pass their shoulders at this point; reparent carried props here. */
export const WARRIOR_WEAPON_GESTURE_SWAP_NORMALIZED = 0.5;

export interface WarriorTravelSources {
  idle: string;
  walk: string;
  run: string;
  attack: string;
}

interface ArmFrame {
  side: number;
  armRestWorld: THREE.Quaternion;
  armParentWorld: THREE.Quaternion;
  forearmRestWorld: THREE.Quaternion;
}

const SAMPLE_COUNT = 24;
const UP = new THREE.Vector3(0, 1, 0);

function boneName(track: THREE.KeyframeTrack): string {
  return track.name.slice(0, track.name.lastIndexOf('.')).replace(/[^a-zA-Z0-9_]/g, '');
}

function isUpperLimb(name: string): boolean {
  return /^mixamorig(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand.*)$/.test(name);
}

function restNodes(model: THREE.Object3D): Map<string, THREE.Object3D> {
  const result = new Map<string, THREE.Object3D>();
  model.traverse((node) => result.set(node.name.replace(/[^a-zA-Z0-9_]/g, ''), node));
  return result;
}

function relativeQuaternion(node: THREE.Object3D, rootInverse: THREE.Quaternion): THREE.Quaternion {
  return node.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInverse).normalize();
}

function armFrame(
  nodes: Map<string, THREE.Object3D>,
  side: 'Left' | 'Right',
  rootInverse: THREE.Quaternion,
): ArmFrame | null {
  const arm = nodes.get(`mixamorig${side}Arm`);
  const forearm = nodes.get(`mixamorig${side}ForeArm`);
  if (!arm?.parent || !forearm) return null;
  return {
    side: side === 'Left' ? 1 : -1,
    armRestWorld: relativeQuaternion(arm, rootInverse),
    armParentWorld: relativeQuaternion(arm.parent, rootInverse),
    forearmRestWorld: relativeQuaternion(forearm, rootInverse),
  };
}

/** Aim the bone's +Y segment while retaining its own bind-pose twist. */
function aim(
  restWorld: THREE.Quaternion,
  parentWorld: THREE.Quaternion,
  direction: THREE.Vector3,
): { local: THREE.Quaternion; world: THREE.Quaternion } {
  const restDirection = UP.clone().applyQuaternion(restWorld);
  const world = new THREE.Quaternion()
    .setFromUnitVectors(restDirection, direction.normalize())
    .multiply(restWorld)
    .normalize();
  return { local: parentWorld.clone().invert().multiply(world).normalize(), world };
}

function relaxedArm(frame: ArmFrame, phase: number, gait: 'idle' | 'walk' | 'run') {
  const swing = Math.sin(phase) * frame.side;
  const amplitude = gait === 'run' ? 0.48 : gait === 'walk' ? 0.25 : 0.015;
  const arm = aim(
    frame.armRestWorld,
    frame.armParentWorld,
    new THREE.Vector3(frame.side * 0.17, -1, 0.035 + swing * amplitude),
  );
  const forearm = aim(
    frame.forearmRestWorld,
    arm.world,
    new THREE.Vector3(frame.side * 0.045, gait === 'run' ? -0.7 : -1, gait === 'run' ? 0.72 : 0.2),
  );
  return { arm: arm.local, forearm: forearm.local };
}

function reachArm(frame: ArmFrame, hip = false) {
  // Elbow travels out and behind; the bent forearm brings the hand above its
  // own shoulder. Both arms reach so the offhand shield has a visible handoff.
  const arm = aim(
    frame.armRestWorld,
    frame.armParentWorld,
    hip
      ? new THREE.Vector3(-frame.side * 0.6, -1, 0.15)
      : new THREE.Vector3(frame.side * 0.55, 0.35, -0.76),
  );
  const forearm = aim(
    frame.forearmRestWorld,
    arm.world,
    hip
      ? new THREE.Vector3(-frame.side, -0.5, 0)
      : new THREE.Vector3(-frame.side * 0.24, 0.83, 0.16),
  );
  return { arm: arm.local, forearm: forearm.local };
}

function upperQuaternion(
  name: string,
  nodes: Map<string, THREE.Object3D>,
  frames: Record<'Left' | 'Right', ArmFrame>,
  phase: number,
  gait: 'idle' | 'walk' | 'run',
  reach = false,
  hip = false,
): THREE.Quaternion | null {
  const node = nodes.get(name);
  if (!node) return null;
  const side = name.startsWith('mixamorigLeft') ? 'Left' : 'Right';
  if (name === `mixamorig${side}Arm`) {
    return (reach ? reachArm(frames[side], hip) : relaxedArm(frames[side], phase, gait)).arm;
  }
  if (name === `mixamorig${side}ForeArm`) {
    return (reach ? reachArm(frames[side], hip) : relaxedArm(frames[side], phase, gait)).forearm;
  }
  // Shoulders, palms and fingers retain this body's authored rest transform;
  // foreign skeleton translations and hand lengths never enter the clip.
  return node.quaternion.clone().normalize();
}

function appendQuaternion(values: number[], value: THREE.Quaternion): void {
  // Keep neighbouring keys in one quaternion hemisphere for stable slerp.
  if (values.length >= 4) {
    const previous = new THREE.Quaternion().fromArray(values, values.length - 4);
    if (previous.dot(value) < 0) value.set(-value.x, -value.y, -value.z, -value.w);
  }
  value.toArray(values, values.length);
}

/**
 * Add inexpensive travel and carry gestures to a Mixamo warrior's clip cache.
 * Pass the unposed GLB scene (before mixers or normalization wrappers). Every
 * gait retains its own source's timing, translations, spine and leg tracks;
 * only upper-limb rotations are replaced. The source scene/clips stay intact.
 * Returns false for a different rig or missing gait, allowing the caller to
 * retain the original animation contract without a partial registration.
 */
export function addWarriorTravelClips(
  clips: Map<string, THREE.AnimationClip>,
  model: THREE.Object3D,
  sourceNames: WarriorTravelSources,
): boolean {
  const idle = clips.get(sourceNames.idle);
  const walk = clips.get(sourceNames.walk);
  const run = clips.get(sourceNames.run);
  if (!idle || !walk || !run) return false;
  model.updateWorldMatrix(true, true);
  const nodes = restNodes(model);
  const rootInverse = model.getWorldQuaternion(new THREE.Quaternion()).invert();
  const left = armFrame(nodes, 'Left', rootInverse);
  const right = armFrame(nodes, 'Right', rootInverse);
  if (!left || !right) return false;
  const frames = { Left: left, Right: right };

  for (const [gait, source] of [
    ['idle', idle],
    ['walk', walk],
    ['run', run],
  ] as const) {
    // Authored target-rig locomotion wins over this legacy arm-only prototype.
    if (clips.has(WARRIOR_TRAVEL_CLIPS[gait])) continue;
    const result = source.clone();
    result.name = WARRIOR_TRAVEL_CLIPS[gait];
    result.tracks = result.tracks.map((track) => {
      const name = boneName(track);
      if (!track.name.endsWith('.quaternion') || !isUpperLimb(name) || !nodes.has(name)) {
        return track;
      }
      const times: number[] = [];
      const values: number[] = [];
      for (let key = 0; key <= SAMPLE_COUNT; key++) {
        const fraction = key / SAMPLE_COUNT;
        times.push(source.duration * fraction);
        const pose = upperQuaternion(name, nodes, frames, fraction * Math.PI * 2, gait);
        if (pose) appendQuaternion(values, pose);
      }
      return new THREE.QuaternionKeyframeTrack(track.name, times, values);
    });
    clips.set(result.name, result);
  }

  const times = [0, 0.16, 0.32, 0.4, 0.48, 0.64, WARRIOR_WEAPON_GESTURE_DURATION];
  for (const [clipName, gesture, carry] of [
    [WARRIOR_TRAVEL_CLIPS.draw, 'draw', 'back'],
    [WARRIOR_TRAVEL_CLIPS.stow, 'stow', 'back'],
    [WARRIOR_HIP_CARRY_CLIPS.draw, 'draw', 'hip'],
    [WARRIOR_HIP_CARRY_CLIPS.stow, 'stow', 'hip'],
    [WARRIOR_HIP_CARRY_CLIPS.dualDraw, 'draw', 'dualHip'],
    [WARRIOR_HIP_CARRY_CLIPS.dualStow, 'stow', 'dualHip'],
  ] as const) {
    const tracks = idle.tracks.map((track) => {
      const name = boneName(track);
      const interpolant = track.createInterpolant();
      const sample = Array.from(interpolant.evaluate(0) as ArrayLike<number>);
      const values: number[] = [];
      if (track.name.endsWith('.quaternion') && isUpperLimb(name) && nodes.has(name)) {
        const combat = new THREE.Quaternion().fromArray(sample).normalize();
        const relaxed = upperQuaternion(name, nodes, frames, 0, 'idle');
        const hip = carry === 'dualHip' || (carry === 'hip' && name.startsWith('mixamorigRight'));
        const reach = upperQuaternion(name, nodes, frames, 0, 'idle', true, hip);
        if (!relaxed || !reach) return track.clone();
        for (const time of times) {
          const fraction = time / WARRIOR_WEAPON_GESTURE_DURATION;
          const first = gesture === 'draw' ? relaxed : combat;
          const last = gesture === 'draw' ? combat : relaxed;
          const t = fraction < 0.5 ? fraction * 2 : (fraction - 0.5) * 2;
          const eased = t * t * (3 - 2 * t);
          const pose =
            fraction < 0.5 ? first.clone().slerp(reach, eased) : reach.clone().slerp(last, eased);
          appendQuaternion(values, pose.normalize());
        }
      } else {
        for (const _time of times) values.push(...sample);
      }
      const result = track.clone();
      result.times = new Float32Array(times);
      result.values = new Float32Array(values);
      return result;
    });
    const clip = new THREE.AnimationClip(clipName, WARRIOR_WEAPON_GESTURE_DURATION, tracks);
    clips.set(clip.name, clip);
  }
  return true;
}
