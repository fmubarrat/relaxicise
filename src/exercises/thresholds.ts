/**
 * Every tunable number for rep detection lives in this file.
 *
 * Each exercise's signal() returns ONE number per frame. The shared rep counter smooths it
 * (EMA, `alpha`) and uses two thresholds with a hysteresis band between them:
 *   direction 'down' (e.g. squat knee angle): rest is >= high, a rep dips to <= low and returns.
 *   direction 'up'   (e.g. arm raise height):  rest is <= low,  a rep rises to >= high and returns.
 * Values inside the band never change state, so jitter cannot double count.
 * A cycle faster than `minRepMs` (rest -> active -> rest) is ignored as a bounce.
 *
 * Tuning: open the app with ?debug=1, force one exercise, and watch the live signal value
 * while you move. Put `low`/`high` comfortably inside the range you actually reach.
 */
import type { ExerciseId } from './types';

export interface Thresholds {
  low: number;
  high: number;
  /** Minimum time for a full rest -> active -> rest cycle. */
  minRepMs: number;
  /** EMA smoothing factor per frame, 0..1. Higher reacts faster, lower is smoother. */
  alpha: number;
  /** Minimum MediaPipe visibility score for a required landmark to count as visible. */
  visibility: number;
}

export const DEFAULT_MIN_REP_MS = 800;
export const DEFAULT_ALPHA = 0.5;
export const DEFAULT_VISIBILITY = 0.5;

/** Required landmarks must stay visible this long before counting starts ("get in position"). */
export const POSITION_HOLD_MS = 2000;

/** "Get in position" tolerates visibility drop-outs shorter than this without restarting. */
export const POSITION_GRACE_MS = 600;

/** Landmarks slightly outside the frame are tolerated by this margin (normalised units). */
export const FRAME_MARGIN = 0.02;

const base = { minRepMs: DEFAULT_MIN_REP_MS, alpha: DEFAULT_ALPHA, visibility: DEFAULT_VISIBILITY };

export const THRESHOLDS: Record<ExerciseId, Thresholds> = {
  /** Average hip-knee-ankle angle, degrees. Standing ~170, bottom of squat < 100. */
  squats: { ...base, low: 100, high: 160 },
  /** Lower wrist height: 0 = shoulder line, 1 = nose level. */
  armRaises: { ...base, low: 0, high: 1 },
  /** min(arm height / target, ankle spread / target); 1 = both targets met. */
  jumpingJacks: { ...base, low: 0.5, high: 1, minRepMs: 500 },
  /** Highest knee relative to its hip, in torso lengths. 0 = knee at hip height, standing ~ -0.85. */
  highKnees: { ...base, low: -0.6, high: -0.15, minRepMs: 300 },
  /** Smaller knee angle of the two legs, degrees. */
  lunges: { ...base, low: 105, high: 155 },
  /** Shoulder-line tilt from horizontal, degrees. */
  sideBends: { ...base, low: 5, high: 14 },
  /** Apparent shoulder width (minus depth difference) / torso, relative to the baseline captured in position. */
  torsoTwists: { ...base, low: 0.65, high: 0.88 },
  /** Ear-to-shoulder vertical gap / shoulder width, relative to baseline. A shrug is ~0.7. */
  shrugs: { ...base, low: 0.78, high: 0.92, minRepMs: 600 },
  /** Distance of the accumulated wrist angle from the nearest full turn, degrees (0..180). */
  armCircles: { ...base, low: 45, high: 135, minRepMs: 600 },
  /** Closest elbow-to-opposite-knee distance / torso. */
  kneeToElbow: { ...base, low: 0.45, high: 0.9 },
  /** 0 = seated, 1 = standing (hip height above knee, blended with knee angle). */
  chairStands: { ...base, low: 0.45, high: 0.85, minRepMs: 1000 },
  /** min(wrist reach toward knees, hip fold); 1 = wrists at knee level and hips folded. */
  forwardFold: { ...base, low: 0.35, high: 0.9, minRepMs: 1200 },
};

/** Constants used inside individual signal() functions. */
export const SIGNAL_PARAMS = {
  jumpingJacks: {
    /** Arm height target, in the armRaises scale (1 = wrists at nose level). */
    armTarget: 1,
    /** Ankle spread target, as a multiple of shoulder width. */
    legTarget: 1.5,
  },
  torsoTwists: {
    /** How much shoulder z-depth difference counts against apparent width. */
    depthWeight: 0.5,
  },
  armCircles: {
    /** Frame-to-frame wrist angle jumps above this are treated as tracking glitches. */
    maxStepDeg: 90,
  },
  chairStands: {
    /** Hip height above knee (torso lengths) that counts as fully standing. */
    hipLift: 0.8,
    hipWeight: 0.75,
    seatedAngle: 90,
    standingAngle: 170,
  },
  forwardFold: {
    /** Hip angle closure (degrees from straight) that counts as a full fold. */
    foldDeg: 80,
  },
} as const;

/** Eyes-closed rest verification (FaceLandmarker blendshapes eyeBlinkLeft/Right). */
export const EYES_CLOSED = {
  blinkThreshold: 0.5,
  /** Eyes must be closed (or open) this long before the state flips. */
  debounceMs: 300,
} as const;
