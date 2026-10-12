/**
 * The one rep-counter state machine shared by every exercise.
 * EMA-smoothed signal -> leaves the rest zone -> reaches the active zone -> returns to rest = 1 rep.
 */
export type RepDirection = 'up' | 'down';
export type CounterState = 'idle' | 'rest' | 'active';

export interface RepCounterOptions {
  low: number;
  high: number;
  direction: RepDirection;
  minRepMs: number;
  alpha: number;
}

export class RepCounter {
  reps = 0;
  state: CounterState = 'idle';
  value: number | null = null;
  private lastRestAt = 0;
  private cycleStart = 0;

  constructor(private readonly opts: RepCounterOptions) {
    if (opts.low >= opts.high) throw new Error('RepCounter: low must be below high');
  }

  /** Feed one raw sample at time t (ms). Returns true when this sample completed a rep. */
  update(raw: number, t: number): boolean {
    if (!Number.isFinite(raw)) return false;
    const { alpha } = this.opts;
    this.value = this.value === null ? raw : alpha * raw + (1 - alpha) * this.value;
    const v = this.value;
    const inRest = this.opts.direction === 'up' ? v <= this.opts.low : v >= this.opts.high;
    const inActive = this.opts.direction === 'up' ? v >= this.opts.high : v <= this.opts.low;

    switch (this.state) {
      case 'idle':
        // Never count from an unknown start: wait until the user is in the rest position.
        if (inRest) {
          this.state = 'rest';
          this.lastRestAt = t;
        }
        return false;
      case 'rest':
        if (inRest) {
          this.lastRestAt = t;
        } else if (inActive) {
          this.state = 'active';
          this.cycleStart = this.lastRestAt;
        }
        return false;
      case 'active':
        if (!inRest) return false;
        this.state = 'rest';
        this.lastRestAt = t;
        if (t - this.cycleStart < this.opts.minRepMs) return false; // too fast: a bounce
        this.reps++;
        return true;
    }
  }

  reset(): void {
    this.reps = 0;
    this.state = 'idle';
    this.value = null;
  }
}
