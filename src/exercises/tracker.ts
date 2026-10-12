/**
 * Runs one exercise: "get in position" (required landmarks visible for POSITION_HOLD_MS),
 * then feeds the exercise signal into the shared RepCounter until the target is reached.
 * Pure logic: no DOM, no camera. Fed one pose (or null) per frame.
 */
import type { Pose } from './types';
import { makeSignal, type ExerciseConfig, type SignalFn } from './configs';
import { RepCounter, type CounterState } from './repCounter';
import { BODY_PARTS, bodyPartOf, type BodyPart } from './landmarks';
import { FRAME_MARGIN, POSITION_GRACE_MS, POSITION_HOLD_MS } from './thresholds';
import { toSquareSpace } from './geometry';

export type TrackerStage = 'position' | 'counting' | 'done';

export interface TrackerFrame {
  stage: TrackerStage;
  reps: number;
  target: number;
  visible: boolean;
  missing: BodyPart[];
  message: string | null;
  /** 0..1 progress of the get-in-position hold. */
  holdProgress: number;
  /** Signal value after baseline normalisation and smoothing, for the debug panel. */
  signal: number | null;
  counterState: CounterState;
  repCounted: boolean;
}

const LOWER_BODY: readonly BodyPart[] = ['hips', 'knees', 'ankles'];

export function missingParts(pose: Pose, required: readonly number[], minVisibility: number, offFrameOk: readonly number[] = []): BodyPart[] {
  const parts = new Set<BodyPart>();
  for (const i of required) {
    const l = pose[i];
    // Allowed off-frame (e.g. raised hands): MediaPipe's estimate outside the picture is used as is.
    if (offFrameOk.includes(i) && l !== undefined) continue;
    const ok =
      l !== undefined &&
      (l.visibility ?? 1) >= minVisibility &&
      l.x >= -FRAME_MARGIN && l.x <= 1 + FRAME_MARGIN &&
      l.y >= -FRAME_MARGIN && l.y <= 1 + FRAME_MARGIN;
    if (!ok) parts.add(bodyPartOf(i));
  }
  return BODY_PARTS.filter((p) => parts.has(p));
}

function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export function visibilityMessage(missing: readonly BodyPart[], noPose: boolean): string | null {
  if (noPose) return 'Step into the frame so the camera can see you';
  if (missing.length === 0) return null;
  const verb = missing.some((p) => LOWER_BODY.includes(p)) ? 'Step back' : 'Move';
  return `${verb} so your ${listWords(missing)} ${missing.length === 1 && missing[0] === 'head' ? 'is' : 'are'} in frame`;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class ExerciseTracker {
  stage: TrackerStage = 'position';
  private readonly counter: RepCounter;
  private readonly signal: SignalFn;
  private holdStart: number | null = null;
  private lastSeen = 0;
  private samples: number[] = [];
  private baseline = 1;
  private simulated = 0;

  constructor(
    readonly cfg: ExerciseConfig,
    readonly target: number,
    private readonly holdMs = POSITION_HOLD_MS,
  ) {
    this.signal = makeSignal(cfg);
    const t = cfg.thresholds;
    this.counter = new RepCounter({ low: t.low, high: t.high, direction: cfg.direction, minRepMs: t.minRepMs, alpha: t.alpha });
  }

  get reps(): number {
    return Math.min(this.target, this.counter.reps + this.simulated);
  }

  /**
   * @param pose landmarks normalised to the frame (as MediaPipe returns them), or null if no person.
   * @param aspect frame width / height, so signals see undistorted angles and distances.
   */
  update(pose: Pose | null, t: number, aspect = 1): TrackerFrame {
    const missing = pose ? missingParts(pose, this.cfg.required, this.cfg.thresholds.visibility, this.cfg.offFrameOk) : [];
    const visible = pose !== null && missing.length === 0;
    // Always run the signal on visible frames so stateful signals (arm circles) stay continuous.
    const raw = visible ? this.signal(aspect === 1 ? pose : toSquareSpace(pose, aspect)) : null;
    let repCounted = false;

    if (this.stage === 'position') {
      if (visible && raw !== null) {
        this.holdStart ??= t;
        this.lastSeen = t;
        this.samples.push(raw);
        if (t - this.holdStart >= this.holdMs) {
          if (this.cfg.baseline) {
            const b = median(this.samples);
            this.baseline = Math.abs(b) > 1e-6 ? b : 1;
          }
          this.stage = 'counting';
        }
      } else if (this.holdStart !== null && t - this.lastSeen > POSITION_GRACE_MS) {
        // Only a sustained loss of visibility restarts the hold; brief drop-outs are forgiven.
        this.holdStart = null;
        this.samples = [];
      }
    } else if (this.stage === 'counting' && raw !== null) {
      repCounted = this.counter.update(raw / this.baseline, t);
      if (this.reps >= this.target) this.stage = 'done';
    }

    return {
      stage: this.stage,
      reps: this.reps,
      target: this.target,
      visible,
      missing,
      message: visibilityMessage(missing, pose === null),
      holdProgress: this.stage !== 'position' ? 1 : this.holdStart === null ? 0 : Math.min(1, (t - this.holdStart) / this.holdMs),
      signal: this.counter.value,
      counterState: this.counter.state,
      repCounted,
    };
  }

  /** Debug: count a rep without a camera. Skips the position check if needed. */
  simulateRep(): void {
    if (this.stage === 'done') return;
    this.stage = 'counting';
    this.simulated++;
    if (this.reps >= this.target) this.stage = 'done';
  }
}
