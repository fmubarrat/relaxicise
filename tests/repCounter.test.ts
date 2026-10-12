import { describe, expect, it } from 'vitest';
import { RepCounter } from '../src/exercises/repCounter';

const FRAME = 33; // ~30 fps

/** Feeds samples one frame apart. Returns the counter. */
function feed(c: RepCounter, samples: number[], start = 0): number {
  let t = start;
  for (const s of samples) {
    c.update(s, t);
    t += FRAME;
  }
  return t;
}

/** n frames linearly from a to b (inclusive of b). */
function ramp(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 1)) / n);
}

const hold = (v: number, n: number) => Array(n).fill(v);

// Squat-like: rest at 170, rep dips below 100.
const down = () => new RepCounter({ low: 100, high: 160, direction: 'down', minRepMs: 800, alpha: 1 });
const downSmoothed = () => new RepCounter({ low: 100, high: 160, direction: 'down', minRepMs: 800, alpha: 0.5 });

describe('RepCounter', () => {
  it('counts exactly one rep per full cycle', () => {
    const c = down();
    const cycle = [...hold(170, 5), ...ramp(170, 80, 15), ...hold(80, 5), ...ramp(80, 170, 15), ...hold(170, 5)];
    feed(c, [...cycle, ...cycle, ...cycle]);
    expect(c.reps).toBe(3);
  });

  it('counts with EMA smoothing on a clean cycle', () => {
    const c = downSmoothed();
    const cycle = [...hold(170, 10), ...ramp(170, 80, 15), ...hold(80, 10), ...ramp(80, 170, 15), ...hold(170, 10)];
    feed(c, [...cycle, ...cycle]);
    expect(c.reps).toBe(2);
  });

  it('ignores jitter inside the hysteresis band', () => {
    const c = down();
    const jitter = Array.from({ length: 120 }, (_, i) => (i % 2 ? 105 : 155));
    feed(c, [...hold(170, 5), ...jitter, ...hold(170, 5)]);
    expect(c.reps).toBe(0);
  });

  it('ignores jitter around a single threshold', () => {
    const c = down();
    const nearLow = Array.from({ length: 60 }, (_, i) => (i % 2 ? 98 : 103));
    feed(c, [...hold(170, 5), ...ramp(170, 100, 10), ...nearLow, ...ramp(100, 170, 10), ...hold(170, 5)]);
    expect(c.reps).toBe(1);
  });

  it('ignores cycles shorter than the minimum rep duration', () => {
    const c = down();
    // Full cycle in ~6 frames (~200 ms).
    const bounce = [170, 120, 80, 80, 120, 170];
    feed(c, [...hold(170, 5), ...bounce, ...hold(170, 5), ...bounce, ...hold(170, 5)]);
    expect(c.reps).toBe(0);
  });

  it('does not count a partial cycle that never reaches the active zone', () => {
    const c = down();
    feed(c, [...hold(170, 5), ...ramp(170, 110, 20), ...ramp(110, 170, 20), ...hold(170, 5)]);
    expect(c.reps).toBe(0);
  });

  it('does not count a cycle that reaches active but never returns to rest', () => {
    const c = down();
    feed(c, [...hold(170, 5), ...ramp(170, 80, 20), ...ramp(80, 140, 20)]);
    expect(c.reps).toBe(0);
    expect(c.state).toBe('active');
  });

  it('waits for the rest position before counting (no count from an unknown start)', () => {
    const c = down();
    feed(c, [...hold(80, 10), ...ramp(80, 170, 20), ...hold(170, 5)]);
    expect(c.reps).toBe(0);
    expect(c.state).toBe('rest');
  });

  it('supports the upward direction', () => {
    const c = new RepCounter({ low: 0, high: 1, direction: 'up', minRepMs: 500, alpha: 1 });
    const cycle = [...hold(-0.5, 5), ...ramp(-0.5, 1.5, 15), ...ramp(1.5, -0.5, 15), ...hold(-0.5, 5)];
    feed(c, [...cycle, ...cycle]);
    expect(c.reps).toBe(2);
  });

  it('rejects inverted thresholds', () => {
    expect(() => new RepCounter({ low: 2, high: 1, direction: 'up', minRepMs: 0, alpha: 1 })).toThrow();
  });
});
