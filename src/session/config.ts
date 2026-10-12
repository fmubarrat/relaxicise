import { availableExercises, LIMITS, type Settings } from '../settings/schema';
import type { SessionConfig } from './machine';

const MINUTE = 60_000;

/** Snapshot of the settings a session runs with. `timeScale` < 1 speeds every duration up (debug). */
export function buildSessionConfig(s: Settings, timeScale = 1): SessionConfig {
  const min = MINUTE * timeScale;
  return {
    workMs: s.workNoLimit ? null : Math.round(s.workHours * 60 * min),
    focusMs: Math.round(s.focusMinutes * min),
    breakMs: Math.round(s.breakMinutes * min),
    warningMs: s.warningEnabled ? Math.round(s.warningSeconds * 1000 * timeScale) : 0,
    snoozeEnabled: s.snoozeEnabled,
    snoozeMs: Math.round(LIMITS.snoozeMinutes * min),
    maxPostpones: LIMITS.maxPostponesPerSession,
    maxPostponeMs: Math.round(LIMITS.maxPostponeMinutes * min),
    minRestMs: LIMITS.minRestSeconds * 1000,
    exercisesPerBreak: s.exercisesPerBreak,
    exercises: availableExercises(s),
    repsPerExercise: s.repsPerExercise,
    restActivities: s.breakMinutes > 0 ? [...s.enabledRest] : [],
    timeScale,
  };
}
