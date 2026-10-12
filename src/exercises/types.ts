export const EXERCISE_IDS = [
  'squats',
  'armRaises',
  'jumpingJacks',
  'highKnees',
  'lunges',
  'sideBends',
  'torsoTwists',
  'shrugs',
  'armCircles',
  'kneeToElbow',
  'chairStands',
  'forwardFold',
] as const;

export type ExerciseId = (typeof EXERCISE_IDS)[number];

export function isExerciseId(v: unknown): v is ExerciseId {
  return typeof v === 'string' && (EXERCISE_IDS as readonly string[]).includes(v);
}

/** One MediaPipe pose landmark. x/y are normalised to the frame, y grows downwards. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** 33 BlazePose landmarks. */
export type Pose = readonly Landmark[];
