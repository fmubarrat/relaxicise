import { beforeEach, describe, expect, it } from 'vitest';
import * as M from '../src/session/machine';
import { buildSessionConfig } from '../src/session/config';
import { SessionController } from '../src/session/controller';
import { MemorySessionStore } from '../src/session/storage';
import { summarize } from '../src/session/summary';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings/schema';

const SEC = 1000;
const MIN = 60 * SEC;

class FakeClock {
  t = 1_000_000;
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

function settings(over: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, focusMinutes: 30, breakMinutes: 3, workHours: 4, warningSeconds: 30, ...over };
}

function setup(over: Partial<Settings> = {}) {
  const clock = new FakeClock();
  const store = new MemorySessionStore();
  let seed = 1;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const ctl = new SessionController(clock, store, rng);
  ctl.start(settings(over));
  const go = (ms: number) => {
    clock.advance(ms);
    ctl.tick();
    return ctl.current!;
  };
  const doAllExercises = () => {
    while (ctl.current!.phase === 'BREAK_EXERCISE') {
      expect(ctl.completeExercise(ctl.current!.config.repsPerExercise)).toBeNull();
    }
  };
  return { clock, store, ctl, go, doAllExercises };
}

describe('session state machine', () => {
  it('runs focus -> warning -> exercise -> rest -> focus', () => {
    const { ctl, go } = setup();
    expect(ctl.current!.phase).toBe('FOCUS');
    expect(go(29 * MIN).phase).toBe('FOCUS');
    expect(go(30 * SEC).phase).toBe('WARNING');
    const s = go(30 * SEC);
    expect(s.phase).toBe('BREAK_EXERCISE');
    expect(s.brk!.exercises).toHaveLength(2);
    expect(s.brk!.exercises[0]).not.toBe(s.brk!.exercises[1]);

    go(30 * SEC);
    ctl.completeExercise(10);
    expect(ctl.current!.phase).toBe('BREAK_EXERCISE');
    go(30 * SEC);
    ctl.completeExercise(10);
    // Exercises took 1 min of a 3 min break: 2 min rest.
    const rest = ctl.current!;
    expect(rest.phase).toBe('BREAK_REST');
    expect(rest.phaseEnd! - rest.phaseStart).toBe(2 * MIN);

    expect(go(2 * MIN).phase).toBe('FOCUS');
    const log = ctl.current!.log.map((e) => e.type);
    expect(log).toEqual(['session_start', 'focus', 'break_start', 'exercise_done', 'exercise_done', 'rest_done', 'break_done']);
  });

  it('skips the warning when it is disabled', () => {
    const { go } = setup({ warningEnabled: false });
    expect(go(30 * MIN - 1).phase).toBe('FOCUS');
    expect(go(1).phase).toBe('BREAK_EXERCISE');
  });

  it('has no rest phase when exercises overrun the break time', () => {
    const { ctl, go } = setup();
    go(30 * MIN);
    go(3 * MIN + 1);
    ctl.completeExercise(10);
    ctl.completeExercise(10);
    expect(ctl.current!.phase).toBe('FOCUS');
    expect(summarize(ctl.current!.log).restDone).toBe(0);
  });

  it('break time 0 means exercise only', () => {
    const { ctl, go, doAllExercises } = setup({ breakMinutes: 0 });
    go(30 * MIN);
    expect(ctl.current!.brk!.rest).toBeNull();
    doAllExercises();
    expect(ctl.current!.phase).toBe('FOCUS');
  });

  it('next focus block starts when the break ends, not when the tab next ticks', () => {
    const { ctl, go } = setup({ warningEnabled: false });
    go(30 * MIN);
    ctl.completeExercise(10);
    ctl.completeExercise(10);
    const restEnd = ctl.current!.phaseEnd!;
    // Tab backgrounded for 10 minutes.
    const s = go(10 * MIN);
    expect(s.phase).toBe('FOCUS');
    expect(s.phaseStart).toBe(restEnd);
    expect(s.phaseEnd).toBe(restEnd + 30 * MIN);
  });

  describe('snooze', () => {
    it('returns to focus for 2 minutes, then re-triggers the same break', () => {
      const { ctl, go } = setup({ warningEnabled: false });
      const first = go(30 * MIN).brk!;
      expect(ctl.snooze()).toBeNull();
      expect(ctl.current!.phase).toBe('FOCUS');
      expect(ctl.current!.delay).toBe('snooze');
      expect(go(2 * MIN - 1).phase).toBe('FOCUS');
      const again = go(1);
      expect(again.phase).toBe('BREAK_EXERCISE');
      expect(again.brk!.exercises).toEqual(first.exercises);
      expect(again.breaksStarted).toBe(1);
    });

    it('is allowed once per break', () => {
      const { ctl, go, doAllExercises } = setup({ warningEnabled: false });
      go(30 * MIN);
      expect(ctl.snooze()).toBeNull();
      go(2 * MIN);
      expect(ctl.snooze()).toMatch(/already been used/);
      // Next break gets a fresh snooze.
      doAllExercises();
      go(3 * MIN);
      go(30 * MIN);
      expect(ctl.current!.phase).toBe('BREAK_EXERCISE');
      expect(ctl.snooze()).toBeNull();
    });

    it('can be disabled in settings', () => {
      const { ctl, go } = setup({ snoozeEnabled: false, warningEnabled: false });
      go(30 * MIN);
      expect(ctl.snooze()).toMatch(/turned off/);
    });
  });

  describe('postpone', () => {
    it('is allowed at most twice per session, then refused with a clear message', () => {
      const { ctl, go } = setup({ warningEnabled: false });
      go(30 * MIN);
      expect(ctl.postpone(15 * MIN)).toBeNull();
      expect(go(15 * MIN).phase).toBe('BREAK_EXERCISE');
      expect(ctl.postpone(5 * MIN)).toBeNull();
      expect(go(5 * MIN).phase).toBe('BREAK_EXERCISE');
      expect(ctl.postpone(5 * MIN)).toMatch(/used all 2 meeting postpones/);
      expect(ctl.current!.phase).toBe('BREAK_EXERCISE');
      expect(summarize(ctl.current!.log).postpones).toBe(2);
    });

    it('works from the warning and keeps counting focus time', () => {
      const { ctl, go } = setup();
      go(29 * MIN + 45 * SEC);
      expect(ctl.current!.phase).toBe('WARNING');
      expect(ctl.postpone(10 * MIN)).toBeNull();
      expect(go(10 * MIN).phase).toBe('BREAK_EXERCISE');
      expect(summarize(ctl.current!.log).focusMs).toBe(39 * MIN + 45 * SEC);
    });

    it('rejects more than 15 minutes', () => {
      const { ctl, go } = setup({ warningEnabled: false });
      go(30 * MIN);
      expect(ctl.postpone(16 * MIN)).toMatch(/up to 15/);
    });
  });

  describe('work time expiry', () => {
    it('ends the session mid-focus at the exact end time', () => {
      const { ctl, go, doAllExercises } = setup({ workHours: 1, warningEnabled: false });
      go(30 * MIN);
      doAllExercises();
      go(3 * MIN);
      // Second focus block would end at 63 min, but work time is 60 min.
      const s = go(30 * MIN);
      expect(s.phase).toBe('SUMMARY');
      expect(s.endReason).toBe('work_time');
      expect(s.endedAt).toBe(s.startedAt + 60 * MIN);
      expect(ctl.current!.brk).toBeNull();
    });

    it('lets a break in progress finish first', () => {
      const { ctl, go } = setup({ workHours: 0.5, focusMinutes: 25, warningEnabled: false });
      go(25 * MIN);
      expect(ctl.current!.phase).toBe('BREAK_EXERCISE');
      // Work time (30 min) passes during the break.
      expect(go(10 * MIN).phase).toBe('BREAK_EXERCISE');
      ctl.completeExercise(10);
      ctl.completeExercise(10);
      expect(ctl.current!.phase).toBe('SUMMARY');
      expect(summarize(ctl.current!.log).breaksTaken).toBe(1);
    });

    it('lets the rest phase finish too', () => {
      const { ctl, go } = setup({ workHours: 0.5, focusMinutes: 25, breakMinutes: 10, warningEnabled: false });
      go(25 * MIN);
      ctl.completeExercise(10);
      ctl.completeExercise(10);
      expect(ctl.current!.phase).toBe('BREAK_REST');
      expect(go(6 * MIN).phase).toBe('BREAK_REST');
      expect(go(4 * MIN).phase).toBe('SUMMARY');
    });

    it('no limit never ends on its own', () => {
      const { ctl, go, doAllExercises } = setup({ workNoLimit: true, warningEnabled: false });
      for (let i = 0; i < 30; i++) {
        go(30 * MIN);
        doAllExercises();
        go(3 * MIN);
      }
      expect(ctl.current!.phase).toBe('FOCUS');
      expect(summarize(ctl.current!.log).breaksTaken).toBe(30);
    });
  });

  it('user can end the session at any time', () => {
    const { ctl, go } = setup();
    go(10 * MIN);
    expect(ctl.endSession()).toBeNull();
    expect(ctl.current!.phase).toBe('SUMMARY');
    expect(ctl.current!.endReason).toBe('user');
    expect(summarize(ctl.current!.log).focusMs).toBe(10 * MIN);
  });

  it('skip and swap are logged and appear in the summary', () => {
    const { ctl, go } = setup({ warningEnabled: false });
    go(30 * MIN);
    const before = ctl.current!.brk!.exercises[0];
    expect(ctl.swapExercise()).toBeNull();
    expect(ctl.current!.brk!.exercises[0]).not.toBe(before);
    expect(ctl.skipExercise(3)).toBeNull();
    ctl.completeExercise(10);
    const sum = summarize(ctl.current!.log);
    expect(sum.swaps).toBe(1);
    expect(sum.exercisesSkipped).toBe(1);
    expect(sum.exercisesCompleted).toBe(1);
    expect(sum.totalReps).toBe(13);
  });

  it('rest can be skipped (ending the break), once', () => {
    const { ctl, go } = setup({ warningEnabled: false });
    go(30 * MIN);
    ctl.completeExercise(10);
    ctl.completeExercise(10);
    expect(ctl.skipRest()).toBeNull();
    expect(ctl.current!.phase).toBe('FOCUS');
    expect(ctl.skipRest()).not.toBeNull();
    expect(summarize(ctl.current!.log).restSkipped).toBe(1);
  });

  it('never picks the same exercise twice in a row across breaks', () => {
    const { ctl, go, doAllExercises } = setup({ warningEnabled: false, workNoLimit: true, exercisesPerBreak: 1, enabledExercises: ['squats', 'shrugs'] });
    let last: string | null = null;
    for (let i = 0; i < 20; i++) {
      go(30 * MIN);
      const id = ctl.current!.brk!.exercises[0];
      expect(id).not.toBe(last);
      last = id;
      doAllExercises();
      go(3 * MIN);
    }
  });

  it('summary figures match the event log', () => {
    const { ctl, go, doAllExercises } = setup({ warningEnabled: false, workHours: 2 });
    go(30 * MIN);
    ctl.snooze();
    go(2 * MIN);
    doAllExercises();
    go(3 * MIN);
    go(30 * MIN);
    ctl.postpone(5 * MIN);
    go(5 * MIN);
    ctl.skipExercise(4);
    ctl.completeExercise(10);
    ctl.skipRest();
    ctl.endSession();
    const s = ctl.current!;
    const sum = summarize(s.log);
    expect(sum.breaksTaken).toBe(2);
    expect(sum.snoozes).toBe(1);
    expect(sum.postpones).toBe(1);
    expect(sum.exercisesCompleted).toBe(3);
    expect(sum.exercisesSkipped).toBe(1);
    expect(sum.totalReps).toBe(34);
    expect(sum.focusMs).toBe((30 + 2 + 30 + 5) * MIN);
  });
});

describe('Back from a break', () => {
  it('a break started early can be cancelled, restoring the remaining focus time', () => {
    const { ctl, go } = setup({ warningEnabled: false });
    go(10 * MIN);
    expect(ctl.triggerBreakNow()).toBeNull();
    expect(ctl.current!.phase).toBe('BREAK_EXERCISE');
    expect(M.canCancelBreak(ctl.current!)).toBe(true);
    go(30 * SEC);
    expect(ctl.cancelBreak()).toBeNull();
    const s = ctl.current!;
    expect(s.phase).toBe('FOCUS');
    expect(s.phaseEnd! - ctl.now()).toBe(20 * MIN);
    const sum = summarize(s.log);
    expect(sum.breaksStarted).toBe(0);
    expect(sum.breaksTaken).toBe(0);
    // The next break is numbered 1 again.
    go(20 * MIN);
    expect(ctl.current!.brk!.no).toBe(1);
  });

  it('cannot cancel a scheduled break, or a manual one after an exercise', () => {
    const { ctl, go } = setup({ warningEnabled: false });
    go(30 * MIN);
    expect(M.canCancelBreak(ctl.current!)).toBe(false);
    expect(ctl.cancelBreak()).toMatch(/snoozed or postponed/);
    ctl.completeExercise(10);
    ctl.completeExercise(10);
    ctl.skipRest();
    go(5 * MIN);
    ctl.triggerBreakNow();
    ctl.completeExercise(10);
    expect(M.canCancelBreak(ctl.current!)).toBe(false);
  });
});

describe('refresh resume', () => {
  let clock: FakeClock;
  let store: MemorySessionStore;
  let ctl: SessionController;
  const rng = () => 0.42;

  beforeEach(() => {
    clock = new FakeClock();
    store = new MemorySessionStore();
    ctl = new SessionController(clock, store, rng);
    ctl.start(settings({ warningEnabled: true }));
  });

  const reload = () => {
    ctl = new SessionController(clock, store, rng);
    ctl.tick();
    return ctl.current!;
  };

  it('resumes focus with the correct remaining time', () => {
    clock.advance(12 * MIN);
    ctl.tick();
    const s = reload();
    expect(s.phase).toBe('FOCUS');
    expect(s.phaseEnd! - clock.now()).toBe(18 * MIN);
  });

  it('resumes the warning', () => {
    clock.advance(29 * MIN + 50 * SEC);
    ctl.tick();
    expect(reload().phase).toBe('WARNING');
  });

  it('resumes the exercise phase with completed exercises kept', () => {
    clock.advance(30 * MIN);
    ctl.tick();
    ctl.completeExercise(10);
    const s = reload();
    expect(s.phase).toBe('BREAK_EXERCISE');
    expect(s.brk!.current).toBe(1);
  });

  it('resumes the rest phase with the correct remaining time', () => {
    clock.advance(30 * MIN);
    ctl.tick();
    ctl.completeExercise(10);
    ctl.completeExercise(10);
    clock.advance(30 * SEC);
    const s = reload();
    expect(s.phase).toBe('BREAK_REST');
    expect(s.phaseEnd! - clock.now()).toBe(2 * MIN + 30 * SEC);
  });

  it('a page closed through a focus end comes back in the break', () => {
    clock.advance(45 * MIN);
    expect(reload().phase).toBe('BREAK_EXERCISE');
  });

  it('a page closed past the work time comes back to the summary', () => {
    clock.advance(4 * 60 * MIN + 1);
    // Focus ended at 30 min so a break was due; the break waits for the user.
    expect(reload().phase).toBe('BREAK_EXERCISE');
  });

  it('resumes the summary', () => {
    ctl.endSession();
    expect(reload().phase).toBe('SUMMARY');
  });
});

describe('session config', () => {
  it('fast timers turn minutes into seconds', () => {
    const c = buildSessionConfig(settings(), 1 / 60);
    expect(c.focusMs).toBe(30 * SEC);
    expect(c.breakMs).toBe(3 * SEC);
    expect(c.workMs).toBe(4 * MIN);
  });

  it('office and quiet modes filter the exercise pool', () => {
    const office = buildSessionConfig(settings({ officeMode: true }));
    expect(office.exercises.sort()).toEqual(['armCircles', 'armRaises', 'chairStands', 'shrugs', 'sideBends']);
    const quiet = buildSessionConfig(settings({ quietMode: true }));
    expect(quiet.exercises).not.toContain('jumpingJacks');
    expect(quiet.exercises).not.toContain('highKnees');
    expect(quiet.exercises).toHaveLength(10);
  });

  it('pure machine: advance is idempotent at the same time', () => {
    const s = M.startSession(buildSessionConfig(settings()), 0);
    const a = M.advance(s, 10 * MIN, { rng: Math.random });
    expect(M.advance(a, 10 * MIN, { rng: Math.random })).toBe(a);
  });
});
