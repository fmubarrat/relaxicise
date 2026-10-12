/**
 * Exercise library. Adding an exercise = adding one config object here (plus its thresholds
 * in thresholds.ts and an id in types.ts). Nothing else is exercise-specific.
 */
import type { ExerciseId, Pose } from './types';
import type { RepDirection } from './repCounter';
import { LM } from './landmarks';
import { SIGNAL_PARAMS, THRESHOLDS, type Thresholds } from './thresholds';
import { angleDeg, clamp, dist, hipMid, shoulderMid, shoulderWidth, torsoLength } from './geometry';

export type SignalFn = (p: Pose) => number | null;

export interface ExerciseConfig {
  id: ExerciseId;
  name: string;
  /** Short how-to shown before the exercise begins. */
  instructions: string;
  /** Pure per-frame signal. Returns null when it cannot be computed from this frame. */
  signal?: SignalFn;
  /** For signals that need memory between frames (e.g. accumulated rotation). Fresh state per exercise. */
  createSignal?: () => SignalFn;
  direction: RepDirection;
  thresholds: Thresholds;
  /** Landmark indices that must be visible before counting. */
  required: readonly number[];
  /**
   * Required landmarks that may leave the frame (e.g. hands raised above the top edge of a laptop
   * webcam). MediaPipe still estimates them just outside the picture, which is enough for the
   * signal; the other required landmarks still prove someone is there.
   */
  offFrameOk?: readonly number[];
  /**
   * If true, the signal is divided by its median value during "get in position", so thresholds
   * are ratios of the user's own neutral posture (for signals that vary a lot between bodies).
   */
  baseline?: boolean;
  /** Target reps = round(reps setting * repScale). Used for per-side counts. */
  repScale?: number;
  needsFullBody: boolean;
  seatedSafe: boolean;
  /** True when the exercise involves no jumping (allowed in Quiet mode). */
  noJump: boolean;
  /** Left and right alternate; each side counts as one rep. */
  alternating: boolean;
  /** Raises the heart rate noticeably: shows a heart-rate caution. */
  cardio?: boolean;
}

const avg = (a: number, b: number) => (a + b) / 2;

function kneeAngles(p: Pose): [number, number] {
  return [
    angleDeg(p[LM.leftHip], p[LM.leftKnee], p[LM.leftAnkle]),
    angleDeg(p[LM.rightHip], p[LM.rightKnee], p[LM.rightAnkle]),
  ];
}

/** Height of a y position on the arm-raise scale: 0 = shoulder line, 1 = nose. */
function armHeight(p: Pose, y: number): number | null {
  const sy = shoulderMid(p).y;
  const span = sy - p[LM.nose].y;
  if (span <= 0) return null;
  return (sy - y) / span;
}

function positive(n: number): number | null {
  return n > 1e-6 ? n : null;
}

/** Wrap an angle difference to [-180, 180). */
function wrapDeg(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

/** Distance of an accumulated angle from the nearest whole turn: 0 at 0/360/720..., 180 half-way. */
export function turnTriangle(accDeg: number): number {
  return Math.abs(((((accDeg % 360) + 540) % 360) - 180));
}

export const EXERCISES: readonly ExerciseConfig[] = [
  {
    id: 'squats',
    name: 'Squats',
    instructions: 'Stand with feet shoulder-width apart, facing the camera. Lower your hips as if sitting back into a chair, then stand tall.',
    signal: (p) => avg(...kneeAngles(p)),
    direction: 'down',
    thresholds: THRESHOLDS.squats,
    required: [LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle],
    needsFullBody: true,
    seatedSafe: false,
    noJump: true,
    alternating: false,
  },
  {
    id: 'armRaises',
    name: 'Overhead arm raises',
    instructions: 'Sitting or standing, raise both arms until your hands are above your head, then lower them below your shoulders.',
    signal: (p) => armHeight(p, Math.max(p[LM.leftWrist].y, p[LM.rightWrist].y)),
    direction: 'up',
    thresholds: THRESHOLDS.armRaises,
    required: [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftWrist, LM.rightWrist],
    offFrameOk: [LM.leftWrist, LM.rightWrist],
    needsFullBody: false,
    seatedSafe: true,
    noJump: true,
    alternating: false,
  },
  {
    id: 'jumpingJacks',
    name: 'Jumping jacks',
    instructions: 'Jump your feet apart while raising your arms overhead, then jump back with arms at your sides.',
    signal: (p) => {
      const { armTarget, legTarget } = SIGNAL_PARAMS.jumpingJacks;
      const arm = armHeight(p, Math.max(p[LM.leftWrist].y, p[LM.rightWrist].y));
      const sw = positive(shoulderWidth(p));
      if (arm === null || sw === null) return null;
      const spread = Math.abs(p[LM.leftAnkle].x - p[LM.rightAnkle].x) / sw;
      return Math.min(arm / armTarget, spread / legTarget);
    },
    direction: 'up',
    thresholds: THRESHOLDS.jumpingJacks,
    required: [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftWrist, LM.rightWrist, LM.leftAnkle, LM.rightAnkle],
    offFrameOk: [LM.leftWrist, LM.rightWrist],
    needsFullBody: true,
    seatedSafe: false,
    noJump: false,
    alternating: false,
    cardio: true,
  },
  {
    id: 'highKnees',
    name: 'High knees',
    instructions: 'Jog on the spot, lifting each knee toward hip height. Each knee counts as one rep.',
    signal: (p) => {
      const t = positive(torsoLength(p));
      if (t === null) return null;
      const left = p[LM.leftHip].y - p[LM.leftKnee].y;
      const right = p[LM.rightHip].y - p[LM.rightKnee].y;
      return Math.max(left, right) / t;
    },
    direction: 'up',
    thresholds: THRESHOLDS.highKnees,
    required: [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee],
    needsFullBody: true,
    seatedSafe: false,
    noJump: false,
    alternating: true,
    cardio: true,
  },
  {
    id: 'lunges',
    name: 'Alternating lunges',
    instructions: 'Step one foot forward and bend both knees, then push back to standing. Switch legs each time.',
    signal: (p) => Math.min(...kneeAngles(p)),
    direction: 'down',
    thresholds: THRESHOLDS.lunges,
    required: [LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle],
    repScale: 0.5,
    needsFullBody: true,
    seatedSafe: false,
    noJump: true,
    alternating: true,
  },
  {
    id: 'sideBends',
    name: 'Side bends',
    instructions: 'Sit or stand tall. Lean slowly to one side, return to centre, then lean to the other side.',
    signal: (p) => {
      const l = p[LM.leftShoulder];
      const r = p[LM.rightShoulder];
      return (Math.atan2(Math.abs(l.y - r.y), Math.abs(l.x - r.x)) * 180) / Math.PI;
    },
    direction: 'up',
    thresholds: THRESHOLDS.sideBends,
    required: [LM.nose, LM.leftShoulder, LM.rightShoulder],
    needsFullBody: false,
    seatedSafe: true,
    noJump: true,
    alternating: true,
  },
  {
    id: 'torsoTwists',
    name: 'Standing torso twists',
    instructions: 'Stand with hands at chest height. Turn your upper body to one side, back to centre, then to the other side.',
    signal: (p) => {
      const t = positive(torsoLength(p));
      if (t === null) return null;
      const l = p[LM.leftShoulder];
      const r = p[LM.rightShoulder];
      const apparent = Math.abs(l.x - r.x) - SIGNAL_PARAMS.torsoTwists.depthWeight * Math.abs(l.z - r.z);
      return apparent / t;
    },
    direction: 'down',
    thresholds: THRESHOLDS.torsoTwists,
    baseline: true,
    required: [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip],
    needsFullBody: false,
    seatedSafe: false,
    noJump: true,
    alternating: true,
  },
  {
    id: 'shrugs',
    name: 'Shoulder shrugs',
    instructions: 'Lift both shoulders up toward your ears, hold for a moment, then let them drop.',
    signal: (p) => {
      const sw = positive(shoulderWidth(p));
      if (sw === null) return null;
      const left = p[LM.leftShoulder].y - p[LM.leftEar].y;
      const right = p[LM.rightShoulder].y - p[LM.rightEar].y;
      return avg(left, right) / sw;
    },
    direction: 'down',
    thresholds: THRESHOLDS.shrugs,
    baseline: true,
    required: [LM.leftEar, LM.rightEar, LM.leftShoulder, LM.rightShoulder],
    needsFullBody: false,
    seatedSafe: true,
    noJump: true,
    alternating: false,
  },
  {
    id: 'armCircles',
    name: 'Arm circles',
    instructions: 'Hold your arms out to the sides and draw large slow circles with your hands. One full circle is one rep.',
    createSignal: () => {
      const arms = [
        { shoulder: LM.leftShoulder, wrist: LM.leftWrist, prev: null as number | null, acc: 0 },
        { shoulder: LM.rightShoulder, wrist: LM.rightWrist, prev: null as number | null, acc: 0 },
      ];
      return (p) => {
        let sum = 0;
        for (const arm of arms) {
          const s = p[arm.shoulder];
          const w = p[arm.wrist];
          const angle = (Math.atan2(w.y - s.y, w.x - s.x) * 180) / Math.PI;
          if (arm.prev !== null) {
            const step = wrapDeg(angle - arm.prev);
            if (Math.abs(step) <= SIGNAL_PARAMS.armCircles.maxStepDeg) arm.acc += step;
          }
          arm.prev = angle;
          sum += turnTriangle(arm.acc);
        }
        return sum / arms.length;
      };
    },
    direction: 'up',
    thresholds: THRESHOLDS.armCircles,
    required: [LM.leftShoulder, LM.rightShoulder, LM.leftWrist, LM.rightWrist],
    repScale: 0.5,
    needsFullBody: false,
    seatedSafe: true,
    noJump: true,
    alternating: false,
  },
  {
    id: 'kneeToElbow',
    name: 'Cross-body knee to elbow',
    instructions: 'Hands lightly behind your head. Bring one knee up and the opposite elbow down to meet it, then switch sides.',
    signal: (p) => {
      const t = positive(torsoLength(p));
      if (t === null) return null;
      return Math.min(dist(p[LM.leftElbow], p[LM.rightKnee]), dist(p[LM.rightElbow], p[LM.leftKnee])) / t;
    },
    direction: 'down',
    thresholds: THRESHOLDS.kneeToElbow,
    required: [LM.leftShoulder, LM.rightShoulder, LM.leftElbow, LM.rightElbow, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee],
    needsFullBody: true,
    seatedSafe: false,
    noJump: true,
    alternating: true,
  },
  {
    id: 'chairStands',
    name: 'Chair stand-ups',
    instructions: 'Sit near the front of your chair, feet flat. Stand up fully without using your hands, then sit back down with control.',
    signal: (p) => {
      const { hipLift, hipWeight, seatedAngle, standingAngle } = SIGNAL_PARAMS.chairStands;
      const t = positive(torsoLength(p));
      if (t === null) return null;
      const hipAboveKnee = avg(p[LM.leftKnee].y - p[LM.leftHip].y, p[LM.rightKnee].y - p[LM.rightHip].y) / t;
      const hipTerm = clamp(hipAboveKnee / hipLift, 0, 1);
      const angleTerm = clamp((avg(...kneeAngles(p)) - seatedAngle) / (standingAngle - seatedAngle), 0, 1);
      return hipWeight * hipTerm + (1 - hipWeight) * angleTerm;
    },
    direction: 'up',
    thresholds: THRESHOLDS.chairStands,
    required: [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle],
    needsFullBody: true,
    seatedSafe: true,
    noJump: true,
    alternating: false,
  },
  {
    id: 'forwardFold',
    name: 'Forward fold',
    instructions: 'Stand with soft knees. Hinge at the hips and let your hands slide down toward your shins, then roll back up slowly.',
    signal: (p) => {
      const hip = hipMid(p);
      const kneeY = avg(p[LM.leftKnee].y, p[LM.rightKnee].y);
      const span = kneeY - hip.y;
      if (span <= 1e-6) return null;
      const reach = (avg(p[LM.leftWrist].y, p[LM.rightWrist].y) - hip.y) / span;
      const hipAngle = avg(
        angleDeg(p[LM.leftShoulder], p[LM.leftHip], p[LM.leftKnee]),
        angleDeg(p[LM.rightShoulder], p[LM.rightHip], p[LM.rightKnee]),
      );
      const fold = (180 - hipAngle) / SIGNAL_PARAMS.forwardFold.foldDeg;
      return Math.min(reach, fold);
    },
    direction: 'up',
    thresholds: THRESHOLDS.forwardFold,
    required: [LM.leftShoulder, LM.rightShoulder, LM.leftWrist, LM.rightWrist, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee],
    needsFullBody: true,
    seatedSafe: false,
    noJump: true,
    alternating: false,
  },
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: ExerciseId): ExerciseConfig {
  const cfg = BY_ID.get(id);
  if (!cfg) throw new Error(`Unknown exercise: ${id}`);
  return cfg;
}

/** A fresh signal function for one run of an exercise. */
export function makeSignal(cfg: ExerciseConfig): SignalFn {
  if (cfg.createSignal) return cfg.createSignal();
  if (cfg.signal) return cfg.signal;
  throw new Error(`Exercise ${cfg.id} has no signal`);
}

export function targetReps(cfg: ExerciseConfig, repsSetting: number): number {
  return Math.max(1, Math.round(repsSetting * (cfg.repScale ?? 1)));
}
