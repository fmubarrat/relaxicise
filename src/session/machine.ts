/**
 * Session state machine. Pure functions over a plain, JSON-serialisable state object.
 * All timing is absolute timestamps (ms), so the state can be persisted and resumed after a
 * refresh, and a backgrounded tab catches up exactly on its next tick.
 *
 *   FOCUS -> [WARNING] -> BREAK_EXERCISE -> [BREAK_REST] -> FOCUS ... -> SUMMARY
 *                              |  snooze / postpone: back to FOCUS for the delay, then re-trigger
 */
import type { ExerciseId } from '../exercises/types';
import { pickExercises, type Rng } from '../exercises/picker';
import { pickRest, type RestId } from '../rest/activities';

export type Phase = 'FOCUS' | 'WARNING' | 'BREAK_EXERCISE' | 'BREAK_REST' | 'SUMMARY';
export type EndReason = 'work_time' | 'user';

export interface SessionConfig {
  /** Total session length, or null for no limit. */
  workMs: number | null;
  focusMs: number;
  breakMs: number;
  /** 0 disables the pre-break warning. */
  warningMs: number;
  snoozeEnabled: boolean;
  snoozeMs: number;
  maxPostpones: number;
  maxPostponeMs: number;
  minRestMs: number;
  exercisesPerBreak: number;
  /** Exercises available after Office/Quiet mode filtering. */
  exercises: ExerciseId[];
  repsPerExercise: number;
  restActivities: RestId[];
  /** 1 normally; 1/60 with debug fast timers (minutes behave as seconds). */
  timeScale: number;
}

export interface BreakPlan {
  /** 1-based break number within the session. */
  no: number;
  exercises: ExerciseId[];
  /** Index of the exercise in progress. */
  current: number;
  rest: RestId | null;
  snoozeUsed: boolean;
  startedAt: number;
  /** startedAt + breakMs: the rest phase fills the time up to here. */
  deadline: number;
  /**
   * Set when the user started this break early ("Start a break"): the focus time that was left.
   * Lets "Back" return to focus with that time restored, as long as no exercise was done yet.
   */
  manualResumeMs?: number | null;
}

export type SessionEvent =
  | { type: 'session_start'; t: number }
  | { type: 'focus'; t: number; start: number; end: number }
  | { type: 'break_start'; t: number; no: number }
  | { type: 'exercise_done'; t: number; id: ExerciseId; reps: number }
  | { type: 'exercise_skipped'; t: number; id: ExerciseId; reps: number }
  | { type: 'exercise_swapped'; t: number; from: ExerciseId; to: ExerciseId }
  | { type: 'snooze'; t: number }
  | { type: 'postpone'; t: number; ms: number }
  | { type: 'rest_done'; t: number; id: RestId }
  | { type: 'rest_skipped'; t: number; id: RestId }
  | { type: 'break_done'; t: number; no: number }
  /** A break the user started early, then backed out of before exercising. */
  | { type: 'break_cancelled'; t: number; no: number }
  /** Heart rate during one break, from a connected monitor (only peak and average are kept). */
  | { type: 'heart_rate'; t: number; peak: number; avg: number }
  | { type: 'session_end'; t: number; reason: EndReason };

export interface SessionState {
  v: 1;
  config: SessionConfig;
  phase: Phase;
  startedAt: number;
  /** startedAt + workMs, or null for no limit. */
  endsAt: number | null;
  /** Start of the current focus stretch (FOCUS/WARNING), used to log focus time. */
  focusStart: number | null;
  phaseStart: number;
  /** When FOCUS/WARNING hands over to a break, or when BREAK_REST ends. Null otherwise. */
  phaseEnd: number | null;
  /** Set while FOCUS is only a snooze/postpone delay before the same break re-triggers. */
  delay: 'snooze' | 'postpone' | null;
  breaksStarted: number;
  brk: BreakPlan | null;
  postponesUsed: number;
  lastExercise: ExerciseId | null;
  log: SessionEvent[];
  endedAt: number | null;
  endReason: EndReason | null;
  /** Set by "Start a break": the focus end that was pending, so the break can be undone. */
  pendingManual?: number | null;
}

export interface StepOptions {
  rng: Rng;
  /** Debug: every break uses only this exercise. */
  forceExercise?: ExerciseId | null;
}

export type ActionResult = { ok: true; state: SessionState } | { ok: false; reason: string };

const ok = (state: SessionState): ActionResult => ({ ok: true, state });
const refuse = (reason: string): ActionResult => ({ ok: false, reason });

function withEvent(s: SessionState, e: SessionEvent): SessionState {
  return { ...s, log: [...s.log, e] };
}

export function startSession(config: SessionConfig, now: number): SessionState {
  return {
    v: 1,
    config,
    phase: 'FOCUS',
    startedAt: now,
    endsAt: config.workMs === null ? null : now + config.workMs,
    focusStart: now,
    phaseStart: now,
    phaseEnd: now + config.focusMs,
    delay: null,
    breaksStarted: 0,
    brk: null,
    postponesUsed: 0,
    lastExercise: null,
    log: [{ type: 'session_start', t: now }],
    endedAt: null,
    endReason: null,
  };
}

function closeFocus(s: SessionState, t: number): SessionState {
  if (s.focusStart === null) return s;
  return { ...withEvent(s, { type: 'focus', t, start: s.focusStart, end: t }), focusStart: null };
}

function endAt(s: SessionState, t: number, reason: EndReason): SessionState {
  const closed = withEvent(closeFocus(s, t), { type: 'session_end', t, reason });
  return { ...closed, phase: 'SUMMARY', phaseStart: t, phaseEnd: null, delay: null, brk: null, endedAt: t, endReason: reason };
}

function beginBreak(s: SessionState, t: number, opts: StepOptions): SessionState {
  const manualFrom = s.pendingManual ?? null;
  let next: SessionState = { ...closeFocus(s, t), pendingManual: null };
  const { config } = next;
  let brk: BreakPlan;
  if (next.brk) {
    // Re-triggered after a snooze or postpone: same break, full break time again.
    brk = { ...next.brk, startedAt: t, deadline: t + config.breakMs };
  } else {
    const no = next.breaksStarted + 1;
    const force = opts.forceExercise && config.exercises.includes(opts.forceExercise) ? opts.forceExercise : null;
    brk = {
      no,
      exercises: force ? [force] : pickExercises(config.exercises, config.exercisesPerBreak, next.lastExercise, opts.rng),
      current: 0,
      rest: config.breakMs > 0 ? pickRest(config.restActivities, no - 1) : null,
      snoozeUsed: false,
      startedAt: t,
      deadline: t + config.breakMs,
      manualResumeMs: manualFrom !== null && manualFrom > t ? manualFrom - t : null,
    };
    next = withEvent({ ...next, breaksStarted: no }, { type: 'break_start', t, no });
  }
  return { ...next, phase: 'BREAK_EXERCISE', phaseStart: t, phaseEnd: null, delay: null, brk };
}

function finishBreak(s: SessionState, t: number): SessionState {
  const no = s.brk?.no ?? s.breaksStarted;
  const next: SessionState = { ...withEvent(s, { type: 'break_done', t, no }), brk: null };
  if (next.endsAt !== null && t >= next.endsAt) return endAt(next, t, 'work_time');
  return { ...next, phase: 'FOCUS', focusStart: t, phaseStart: t, phaseEnd: t + next.config.focusMs, delay: null };
}

function afterExercises(s: SessionState, t: number): SessionState {
  const brk = s.brk!;
  if (brk.rest !== null && brk.deadline - t >= s.config.minRestMs) {
    return { ...s, phase: 'BREAK_REST', phaseStart: t, phaseEnd: brk.deadline };
  }
  return finishBreak(s, t);
}

/** One automatic transition, or the same object if none is due. */
function step(s: SessionState, now: number, opts: StepOptions): SessionState {
  switch (s.phase) {
    case 'FOCUS':
    case 'WARNING': {
      const focusEnd = s.phaseEnd!;
      if (s.endsAt !== null && s.endsAt <= focusEnd) {
        // The session ends before (or exactly when) this focus block would end: no break.
        return now >= s.endsAt ? endAt(s, s.endsAt, 'work_time') : s;
      }
      if (now >= focusEnd) return beginBreak(s, focusEnd, opts);
      const warnAt = focusEnd - s.config.warningMs;
      if (s.phase === 'FOCUS' && s.delay === null && s.config.warningMs > 0 && now >= warnAt) {
        return { ...s, phase: 'WARNING', phaseStart: Math.max(warnAt, s.phaseStart) };
      }
      return s;
    }
    case 'BREAK_REST': {
      if (now < s.phaseEnd!) return s;
      const t = s.phaseEnd!;
      return finishBreak(withEvent(s, { type: 'rest_done', t, id: s.brk!.rest! }), t);
    }
    case 'BREAK_EXERCISE': // waits for the user; work-time expiry lets the break finish
    case 'SUMMARY':
      return s;
  }
}

/** Applies every transition due by `now` (catches up after a backgrounded tab or a refresh). */
export function advance(s: SessionState, now: number, opts: StepOptions): SessionState {
  let cur = s;
  for (let i = 0; i < 10_000; i++) {
    const next = step(cur, now, opts);
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

function finishCurrentExercise(s: SessionState, now: number, reps: number, skipped: boolean): ActionResult {
  if (s.phase !== 'BREAK_EXERCISE' || !s.brk) return refuse('No exercise in progress');
  const brk = s.brk;
  const id = brk.exercises[brk.current];
  const event: SessionEvent = skipped
    ? { type: 'exercise_skipped', t: now, id, reps }
    : { type: 'exercise_done', t: now, id, reps };
  const next: SessionState = { ...withEvent(s, event), lastExercise: id, brk: { ...brk, current: brk.current + 1 } };
  return ok(next.brk!.current >= next.brk!.exercises.length ? afterExercises(next, now) : next);
}

export function completeExercise(s: SessionState, now: number, reps: number): ActionResult {
  return finishCurrentExercise(s, now, reps, false);
}

/** Skipping is always allowed (accessibility) and always shows in the summary. */
export function skipExercise(s: SessionState, now: number, repsDone: number): ActionResult {
  return finishCurrentExercise(s, now, repsDone, true);
}

/** Replaces the current exercise with another available one (or `target`, for debug). */
export function swapExercise(s: SessionState, now: number, rng: Rng, target?: ExerciseId): ActionResult {
  if (s.phase !== 'BREAK_EXERCISE' || !s.brk) return refuse('No exercise in progress');
  const brk = s.brk;
  const from = brk.exercises[brk.current];
  let to: ExerciseId | undefined;
  if (target !== undefined) {
    if (target === from) return refuse('That exercise is already in progress');
    to = target;
  } else {
    const candidates = s.config.exercises.filter((id) => !brk.exercises.includes(id));
    if (candidates.length === 0) return refuse('No other exercise is available. Enable more exercises in settings.');
    to = candidates[Math.floor(rng() * candidates.length)];
  }
  const exercises = brk.exercises.map((id, i) => (i === brk.current ? to! : id));
  return ok({ ...withEvent(s, { type: 'exercise_swapped', t: now, from, to }), brk: { ...brk, exercises } });
}

export function snooze(s: SessionState, now: number): ActionResult {
  if (s.phase !== 'BREAK_EXERCISE' || !s.brk) return refuse('Snooze is only available during a break');
  if (!s.config.snoozeEnabled) return refuse('Snooze is turned off in settings');
  if (s.brk.snoozeUsed) return refuse('Snooze has already been used for this break');
  const next = withEvent(s, { type: 'snooze', t: now });
  return ok({
    ...next,
    phase: 'FOCUS',
    delay: 'snooze',
    focusStart: now,
    phaseStart: now,
    phaseEnd: now + s.config.snoozeMs,
    brk: { ...s.brk, snoozeUsed: true },
  });
}

export function postponesLeft(s: SessionState): number {
  return Math.max(0, s.config.maxPostpones - s.postponesUsed);
}

/** "I'm in a meeting": from the warning or the break. Limited per session. */
export function postpone(s: SessionState, now: number, ms: number): ActionResult {
  if (s.phase !== 'WARNING' && s.phase !== 'BREAK_EXERCISE') return refuse('Nothing to postpone right now');
  if (postponesLeft(s) === 0) {
    return refuse(`You have used all ${s.config.maxPostpones} meeting postpones for this session.`);
  }
  if (!(ms > 0) || ms > s.config.maxPostponeMs) return refuse('Choose a postpone of up to 15 minutes');
  const next = withEvent({ ...s, postponesUsed: s.postponesUsed + 1 }, { type: 'postpone', t: now, ms });
  return ok({
    ...next,
    phase: 'FOCUS',
    delay: 'postpone',
    // From WARNING, the focus stretch simply continues; from a break, a new one starts.
    focusStart: s.phase === 'WARNING' ? s.focusStart : now,
    phaseStart: now,
    phaseEnd: now + ms,
  });
}

/** Ends the rest phase early. Possible once per break, because it ends the break. */
export function skipRest(s: SessionState, now: number): ActionResult {
  if (s.phase !== 'BREAK_REST' || !s.brk?.rest) return refuse('No rest activity in progress');
  return ok(finishBreak(withEvent(s, { type: 'rest_skipped', t: now, id: s.brk.rest }), now));
}

export function endSession(s: SessionState, now: number): ActionResult {
  if (s.phase === 'SUMMARY') return refuse('Session already ended');
  return ok(endAt(s, now, 'user'));
}

/** Records peak/average heart rate for the break that just ended. */
export function recordHeartRate(s: SessionState, now: number, peak: number, avg: number): ActionResult {
  if (!(peak > 0) || !(avg > 0)) return refuse('No heart-rate data');
  return ok(withEvent(s, { type: 'heart_rate', t: now, peak: Math.round(peak), avg: Math.round(avg) }));
}

/** "Break now": ends the current focus stretch so the break starts on the next advance. */
export function triggerBreakNow(s: SessionState, now: number): ActionResult {
  if (s.phase !== 'FOCUS' && s.phase !== 'WARNING') return refuse('Not in focus');
  // Remember the real focus end so the break can be undone with "Back".
  return ok({ ...s, phaseEnd: now, pendingManual: s.delay ? null : s.phaseEnd });
}

/** Whether "Back" can undo this break for free (started early, nothing done yet). */
export function canCancelBreak(s: SessionState): boolean {
  return s.phase === 'BREAK_EXERCISE' && !!s.brk && (s.brk.manualResumeMs ?? 0) > 0 && s.brk.current === 0 && !s.brk.snoozeUsed;
}

/** Undo a break the user started early: back to focus with the remaining focus time restored. */
export function cancelBreak(s: SessionState, now: number): ActionResult {
  if (!canCancelBreak(s)) return refuse('This break can be snoozed or postponed, but not cancelled');
  const brk = s.brk!;
  const next = withEvent({ ...s, breaksStarted: s.breaksStarted - 1 }, { type: 'break_cancelled', t: now, no: brk.no });
  return ok({ ...next, phase: 'FOCUS', delay: null, brk: null, focusStart: now, phaseStart: now, phaseEnd: now + brk.manualResumeMs! });
}
