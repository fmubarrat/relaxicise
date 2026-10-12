import type { Landmark, Pose } from './types';
import { LM } from './landmarks';

export interface Point {
  x: number;
  y: number;
  z: number;
}

export function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Interior angle at b, in degrees (0..180). Uses MediaPipe's z (depth, roughly x scale) as well
 * as x/y: from a front camera a squatting thigh points at the lens, so a purely 2D angle barely
 * changes. Depth is noisier than x/y, but recovers most of the bend.
 */
export function angleDeg(a: Point, b: Point, c: Point): number {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const n = Math.hypot(...v1) * Math.hypot(...v2);
  if (n === 0) return 180;
  const cos = Math.min(1, Math.max(-1, (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / n));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function shoulderMid(p: Pose): Point {
  return mid(p[LM.leftShoulder], p[LM.rightShoulder]);
}

export function hipMid(p: Pose): Point {
  return mid(p[LM.leftHip], p[LM.rightHip]);
}

/** Shoulder-midpoint to hip-midpoint distance: the scale that makes signals distance-independent. */
export function torsoLength(p: Pose): number {
  return dist(shoulderMid(p), hipMid(p));
}

export function shoulderWidth(p: Pose): number {
  return dist(p[LM.leftShoulder], p[LM.rightShoulder]);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * MediaPipe normalises x by frame width and y by frame height. Scale x (and z, which
 * shares x's scale) by the aspect ratio so angles and distances are not distorted.
 */
export function toSquareSpace(p: readonly Landmark[], aspect: number): Landmark[] {
  return p.map((l) => ({ x: l.x * aspect, y: l.y, z: l.z * aspect, visibility: l.visibility }));
}
