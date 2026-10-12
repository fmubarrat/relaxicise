/** Session summary, derived only from the event log so the figures match it exactly. */
import type { ExerciseId } from '../exercises/types';
import type { RestId } from '../rest/activities';
import type { SessionEvent } from './machine';

export interface ExerciseTotals {
  id: ExerciseId;
  reps: number;
  completed: number;
  skipped: number;
}

export interface SessionSummary {
  focusMs: number;
  breaksStarted: number;
  breaksTaken: number;
  totalReps: number;
  exercisesCompleted: number;
  exercisesSkipped: number;
  swaps: number;
  snoozes: number;
  postpones: number;
  restDone: number;
  restSkipped: number;
  exercises: ExerciseTotals[];
  rest: Array<{ id: RestId; done: number; skipped: number }>;
  /** Highest heart rate in any break, or null if no monitor was connected. */
  hrPeak: number | null;
  /** Mean of the per-break averages, or null. */
  hrAvg: number | null;
}

export function summarize(log: readonly SessionEvent[]): SessionSummary {
  const sum: SessionSummary = {
    focusMs: 0,
    breaksStarted: 0,
    breaksTaken: 0,
    totalReps: 0,
    exercisesCompleted: 0,
    exercisesSkipped: 0,
    swaps: 0,
    snoozes: 0,
    postpones: 0,
    restDone: 0,
    restSkipped: 0,
    exercises: [],
    rest: [],
    hrPeak: null,
    hrAvg: null,
  };
  const hrAvgs: number[] = [];
  const ex = new Map<ExerciseId, ExerciseTotals>();
  const exFor = (id: ExerciseId) => {
    let e = ex.get(id);
    if (!e) ex.set(id, (e = { id, reps: 0, completed: 0, skipped: 0 }));
    return e;
  };
  const rest = new Map<RestId, { id: RestId; done: number; skipped: number }>();
  const restFor = (id: RestId) => {
    let r = rest.get(id);
    if (!r) rest.set(id, (r = { id, done: 0, skipped: 0 }));
    return r;
  };

  for (const e of log) {
    switch (e.type) {
      case 'focus':
        sum.focusMs += Math.max(0, e.end - e.start);
        break;
      case 'break_start':
        sum.breaksStarted++;
        break;
      case 'break_done':
        sum.breaksTaken++;
        break;
      case 'break_cancelled':
        sum.breaksStarted--;
        break;
      case 'exercise_done':
        sum.exercisesCompleted++;
        sum.totalReps += e.reps;
        exFor(e.id).completed++;
        exFor(e.id).reps += e.reps;
        break;
      case 'exercise_skipped':
        sum.exercisesSkipped++;
        sum.totalReps += e.reps;
        exFor(e.id).skipped++;
        exFor(e.id).reps += e.reps;
        break;
      case 'exercise_swapped':
        sum.swaps++;
        break;
      case 'snooze':
        sum.snoozes++;
        break;
      case 'postpone':
        sum.postpones++;
        break;
      case 'rest_done':
        sum.restDone++;
        restFor(e.id).done++;
        break;
      case 'rest_skipped':
        sum.restSkipped++;
        restFor(e.id).skipped++;
        break;
      case 'heart_rate':
        sum.hrPeak = Math.max(sum.hrPeak ?? 0, e.peak);
        hrAvgs.push(e.avg);
        break;
      case 'session_start':
      case 'session_end':
        break;
    }
  }
  if (hrAvgs.length) sum.hrAvg = Math.round(hrAvgs.reduce((a, b) => a + b, 0) / hrAvgs.length);
  sum.exercises = [...ex.values()];
  sum.rest = [...rest.values()];
  return sum;
}
