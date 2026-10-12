/**
 * Countdown for the eyes-closed rest. With verification on, the countdown only runs while
 * the eyes are closed; if they open early it pauses with a gentle prompt (never resets,
 * never punishes). Closed/open must persist for `debounceMs` before the state flips, so a
 * blink or a noisy frame does not toggle it.
 */
import { EYES_CLOSED } from '../exercises/thresholds';

export interface EyesClosedStatus {
  remainingMs: number;
  paused: boolean;
  done: boolean;
}

export class EyesClosedTimer {
  private remaining: number;
  private lastT: number | null = null;
  private closed: boolean;
  private pendingSince: number | null = null;

  constructor(
    durationMs: number,
    private readonly verify: boolean,
    private readonly threshold = EYES_CLOSED.blinkThreshold,
    private readonly debounceMs = EYES_CLOSED.debounceMs,
  ) {
    this.remaining = durationMs;
    // Without verification the timer simply runs.
    this.closed = !verify;
  }

  /**
   * @param blink average of eyeBlinkLeft/eyeBlinkRight (0..1), or null when no face is seen.
   *   Ignored when verification is off.
   */
  update(t: number, blink: number | null): EyesClosedStatus {
    const dt = this.lastT === null ? 0 : Math.max(0, t - this.lastT);
    this.lastT = t;

    // Time since the previous frame counts in the state we were in during that interval.
    if (this.closed) this.remaining = Math.max(0, this.remaining - dt);

    if (this.verify) {
      const observedClosed = blink !== null && blink >= this.threshold;
      if (observedClosed === this.closed) {
        this.pendingSince = null;
      } else {
        this.pendingSince ??= t;
        if (t - this.pendingSince >= this.debounceMs) {
          this.closed = observedClosed;
          this.pendingSince = null;
        }
      }
    }

    return { remainingMs: this.remaining, paused: !this.closed && this.remaining > 0, done: this.remaining <= 0 };
  }
}
