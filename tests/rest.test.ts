import { describe, expect, it } from 'vitest';
import { pickRest } from '../src/rest/activities';
import { breathPhaseAt } from '../src/rest/breathing';
import { EyesClosedTimer } from '../src/rest/eyesClosed';

describe('rest activity picker', () => {
  it('rotates through the enabled activities in a fixed order', () => {
    const enabled = ['water', 'eyeFocus', 'breathing'] as const;
    expect([0, 1, 2, 3].map((i) => pickRest([...enabled], i))).toEqual(['eyeFocus', 'breathing', 'water', 'eyeFocus']);
  });

  it('returns null when nothing is enabled', () => {
    expect(pickRest([], 0)).toBeNull();
  });
});

describe('breathing pacer', () => {
  it('box breathing: In, Hold, Out, Hold, 4 s each', () => {
    expect(breathPhaseAt('box', 0)).toMatchObject({ word: 'In', count: 4, size: 0 });
    expect(breathPhaseAt('box', 3_500)).toMatchObject({ word: 'In', count: 1 });
    expect(breathPhaseAt('box', 4_000)).toMatchObject({ word: 'Hold', size: 1 });
    expect(breathPhaseAt('box', 8_000).word).toBe('Out');
    expect(breathPhaseAt('box', 12_000)).toMatchObject({ word: 'Hold', size: 0 });
    expect(breathPhaseAt('box', 16_000).word).toBe('In');
  });

  it('5 in / 5 out', () => {
    expect(breathPhaseAt('fiveFive', 2_500)).toMatchObject({ word: 'In', size: 0.5 });
    expect(breathPhaseAt('fiveFive', 5_000).word).toBe('Out');
  });
});

describe('eyes-closed timer', () => {
  it('without verification it simply counts down', () => {
    const t = new EyesClosedTimer(25_000, false);
    t.update(0, null);
    expect(t.update(10_000, null)).toMatchObject({ remainingMs: 15_000, paused: false, done: false });
    expect(t.update(25_000, null).done).toBe(true);
  });

  it('with verification, counts only while eyes are closed and pauses (never resets) when they open', () => {
    const t = new EyesClosedTimer(20_000, true, 0.5, 300);
    let now = 0;
    const run = (ms: number, blink: number | null) => {
      let s = t.update(now, blink);
      const end = now + ms;
      while (now < end) {
        now += 50;
        s = t.update(now, blink);
      }
      return s;
    };
    // Starts paused until eyes close.
    expect(run(1000, 0.1).paused).toBe(true);
    expect(t.update(now, 0.1).remainingMs).toBe(20_000);
    // Close for 10 s (minus the 300 ms debounce).
    const closed = run(10_000, 0.9);
    expect(closed.paused).toBe(false);
    expect(closed.remainingMs).toBeCloseTo(10_300, -2);
    // A blink-length opening (200 ms) does not pause.
    expect(run(200, 0.1).paused).toBe(false);
    // Eyes open for 2 s: paused, remaining held.
    const opened = run(2000, 0.1);
    expect(opened.paused).toBe(true);
    const held = opened.remainingMs;
    expect(run(1000, null).remainingMs).toBe(held);
    // Close again until done.
    expect(run(15_000, 0.9).done).toBe(true);
  });
});
