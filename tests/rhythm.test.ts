import { describe, expect, it } from 'vitest';
import * as M from '../src/session/machine';
import { buildSessionConfig } from '../src/session/config';
import { rhythm } from '../src/session/rhythm';
import { DEFAULT_SETTINGS } from '../src/settings/schema';

const MIN = 60_000;
const opts = { rng: () => 0.3 };
const cfg = buildSessionConfig({ ...DEFAULT_SETTINGS, workHours: 2, focusMinutes: 30, breakMinutes: 3, warningEnabled: false });
const ok = (r: M.ActionResult) => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe("today's rhythm", () => {
  it('at the start: one live block, then planned blocks to the end of the session', () => {
    const s = M.startSession(cfg, 0);
    const r = rhythm(s, 10 * MIN);
    expect(r.from).toBe(0);
    expect(r.to).toBe(120 * MIN);
    expect(r.segments[0]).toEqual({ kind: 'now', start: 0, end: 10 * MIN });
    expect(r.segments[1]).toEqual({ kind: 'planned-focus', start: 10 * MIN, end: 30 * MIN });
    expect(r.segments[2]).toEqual({ kind: 'planned-break', start: 30 * MIN, end: 33 * MIN });
    expect(r.segments.at(-1)!.end).toBe(120 * MIN);
  });

  it('after a break: done focus, done break, live focus', () => {
    let s = M.advance(M.startSession(cfg, 0), 30 * MIN, opts);
    s = ok(M.completeExercise(s, 31 * MIN, 10));
    s = ok(M.completeExercise(s, 32 * MIN, 10));
    s = M.advance(s, 40 * MIN, opts); // rest ended at 33
    const kinds = rhythm(s, 40 * MIN).segments.slice(0, 3);
    expect(kinds).toEqual([
      { kind: 'focus', start: 0, end: 30 * MIN },
      { kind: 'break', start: 30 * MIN, end: 33 * MIN },
      { kind: 'now', start: 33 * MIN, end: 40 * MIN },
    ]);
  });

  it('after the session: only what happened, ending at the end time', () => {
    let s = M.startSession(cfg, 0);
    s = ok(M.endSession(s, 12 * MIN));
    const r = rhythm(s, 99 * MIN);
    expect(r.to).toBe(12 * MIN);
    expect(r.segments).toEqual([{ kind: 'focus', start: 0, end: 12 * MIN }]);
  });

  it('no limit: plans a few cycles ahead', () => {
    const s = M.startSession(buildSessionConfig({ ...DEFAULT_SETTINGS, workNoLimit: true }), 0);
    const r = rhythm(s, 0);
    expect(r.to).toBeGreaterThan(90 * MIN);
    expect(r.segments.every((x) => x.kind.startsWith('planned'))).toBe(true);
  });
});
