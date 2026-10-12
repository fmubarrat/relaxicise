/**
 * Hand-built pose fixtures in square image space (aspect 1), y grows downwards.
 * A neutral standing person facing the camera; helpers move individual joints.
 */
import type { Landmark } from '../src/exercises/types';
import { LM } from '../src/exercises/landmarks';

type XY = [number, number];

const STANDING: Record<number, XY> = {
  [LM.nose]: [0.5, 0.15],
  1: [0.51, 0.135], [LM.leftEye]: [0.52, 0.13], 3: [0.53, 0.13],
  4: [0.49, 0.135], [LM.rightEye]: [0.48, 0.13], 6: [0.47, 0.13],
  [LM.leftEar]: [0.54, 0.15], [LM.rightEar]: [0.46, 0.15],
  9: [0.51, 0.18], 10: [0.49, 0.18],
  [LM.leftShoulder]: [0.58, 0.25], [LM.rightShoulder]: [0.42, 0.25],
  [LM.leftElbow]: [0.6, 0.37], [LM.rightElbow]: [0.4, 0.37],
  [LM.leftWrist]: [0.61, 0.48], [LM.rightWrist]: [0.39, 0.48],
  17: [0.61, 0.5], 18: [0.39, 0.5], 19: [0.61, 0.5], 20: [0.39, 0.5], 21: [0.6, 0.49], 22: [0.4, 0.49],
  [LM.leftHip]: [0.55, 0.47], [LM.rightHip]: [0.45, 0.47],
  [LM.leftKnee]: [0.55, 0.66], [LM.rightKnee]: [0.45, 0.66],
  [LM.leftAnkle]: [0.55, 0.85], [LM.rightAnkle]: [0.45, 0.85],
  29: [0.55, 0.87], 30: [0.45, 0.87], 31: [0.56, 0.88], 32: [0.44, 0.88],
};

export function standing(): Landmark[] {
  return Array.from({ length: 33 }, (_, i) => ({ x: STANDING[i][0], y: STANDING[i][1], z: 0, visibility: 0.99 }));
}

export function withPoints(pose: Landmark[], points: Record<number, Partial<Landmark> | XY>): Landmark[] {
  const out = pose.map((l) => ({ ...l }));
  for (const [k, v] of Object.entries(points)) {
    const i = Number(k);
    out[i] = Array.isArray(v) ? { ...out[i], x: v[0], y: v[1] } : { ...out[i], ...v };
  }
  return out;
}

/** Moves every landmark by (dx, dy) and scales around the centre: simulates a different camera distance. */
export function transform(pose: Landmark[], scale: number, dx = 0, dy = 0): Landmark[] {
  return pose.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * scale + dx, y: 0.5 + (l.y - 0.5) * scale + dy, z: l.z * scale }));
}
