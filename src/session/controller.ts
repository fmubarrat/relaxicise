/**
 * Owns the live session: applies machine actions, persists every change, ticks on a timer
 * (timestamp-based, so throttled background timers only delay, never drift), and notifies
 * listeners with (next, prev) so the UI can run transition effects.
 */
import type { Settings } from '../settings/schema';
import type { ExerciseId } from '../exercises/types';
import type { Rng } from '../exercises/picker';
import { buildSessionConfig } from './config';
import * as M from './machine';
import type { SessionStore } from './storage';

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export type Listener = (next: M.SessionState | null, prev: M.SessionState | null) => void;

export class SessionController {
  private state: M.SessionState | null;
  private readonly listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly store: SessionStore,
    private readonly rng: Rng = Math.random,
    private readonly forceExercise: () => ExerciseId | null = () => null,
  ) {
    this.state = store.load();
  }

  get current(): M.SessionState | null {
    return this.state;
  }

  now(): number {
    return this.clock.now();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private commit(next: M.SessionState | null): void {
    const prev = this.state;
    if (next === prev) return;
    this.state = next;
    this.store.save(next);
    for (const fn of this.listeners) fn(next, prev);
  }

  private opts(): M.StepOptions {
    return { rng: this.rng, forceExercise: this.forceExercise() };
  }

  tick(): void {
    if (!this.state) return;
    this.commit(M.advance(this.state, this.clock.now(), this.opts()));
  }

  startTicking(intervalMs = 250): void {
    this.stopTicking();
    this.timer = setInterval(() => this.tick(), intervalMs);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisible);
    }
  }

  stopTicking(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
  }

  private readonly onVisible = () => this.tick();

  start(settings: Settings, timeScale = 1): void {
    this.commit(M.startSession(buildSessionConfig(settings, timeScale), this.clock.now()));
  }

  /** Leaves the summary and returns to setup. */
  clear(): void {
    this.commit(null);
  }

  /** Runs an action, then any automatic transitions it makes due. Returns a refusal reason, if any. */
  private run(action: (s: M.SessionState, now: number) => M.ActionResult): string | null {
    if (!this.state) return 'No session';
    const now = this.clock.now();
    const r = action(this.state, now);
    if (!r.ok) return r.reason;
    this.commit(M.advance(r.state, now, this.opts()));
    return null;
  }

  completeExercise(reps: number) {
    return this.run((s, now) => M.completeExercise(s, now, reps));
  }
  skipExercise(repsDone: number) {
    return this.run((s, now) => M.skipExercise(s, now, repsDone));
  }
  swapExercise(target?: ExerciseId) {
    return this.run((s, now) => M.swapExercise(s, now, this.rng, target));
  }
  snooze() {
    return this.run((s, now) => M.snooze(s, now));
  }
  postpone(ms: number) {
    return this.run((s, now) => M.postpone(s, now, ms));
  }
  skipRest() {
    return this.run((s, now) => M.skipRest(s, now));
  }
  endSession() {
    return this.run((s, now) => M.endSession(s, now));
  }
  recordHeartRate(peak: number, avg: number) {
    return this.run((s, now) => M.recordHeartRate(s, now, peak, avg));
  }
  cancelBreak() {
    return this.run((s, now) => M.cancelBreak(s, now));
  }
  triggerBreakNow() {
    return this.run((s, now) => M.triggerBreakNow(s, now));
  }
}
