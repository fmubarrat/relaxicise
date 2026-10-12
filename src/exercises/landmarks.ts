/** BlazePose landmark indices. "Left" is the person's left. */
export const LM = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export const LANDMARK_COUNT = 33;

/** Body part names, in head-to-toe order, used to build "step back" messages. */
export const BODY_PARTS = ['head', 'shoulders', 'elbows', 'wrists', 'hips', 'knees', 'ankles'] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export function bodyPartOf(index: number): BodyPart {
  if (index <= 10) return 'head';
  if (index <= 12) return 'shoulders';
  if (index <= 14) return 'elbows';
  if (index <= 22) return 'wrists';
  if (index <= 24) return 'hips';
  if (index <= 26) return 'knees';
  return 'ankles';
}

/** Skeleton edges for the debug overlay. */
export const SKELETON: ReadonlyArray<readonly [number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [0, 11], [0, 12],
];
