import { EXERCISE_IDS, type ExerciseId } from '../exercises/types';
import { getExercise } from '../exercises/configs';
import { REST_IDS, type RestId } from '../rest/activities';
import type { BreathingPattern } from '../rest/breathing';
import type { MusicChoice } from '../audio/music';

export interface Settings {
  workHours: number;
  workNoLimit: boolean;
  focusMinutes: number;
  breakMinutes: number;
  repsPerExercise: number;
  exercisesPerBreak: number;
  warningEnabled: boolean;
  warningSeconds: number;
  snoozeEnabled: boolean;
  chime: boolean;
  officeMode: boolean;
  quietMode: boolean;
  enabledExercises: ExerciseId[];
  enabledRest: RestId[];
  breathingPattern: BreathingPattern;
  verifyEyesClosed: boolean;
  /** Relaxing music during breaks. */
  musicEnabled: boolean;
  /** Which break music to play, or a random track each break. */
  musicTrack: MusicChoice;
  /** Appearance: follow the system, or always light / dark. */
  theme: ThemeChoice;
  /** Optional, only used locally to personalise heart-rate ranges. */
  age: number | null;
}

export type ThemeChoice = 'system' | 'light' | 'dark';

export const AGE_RANGE = { min: 10, max: 100 } as const;

export type NumericKey = 'workHours' | 'focusMinutes' | 'breakMinutes' | 'repsPerExercise' | 'exercisesPerBreak' | 'warningSeconds';

export interface NumericSpec {
  label: string;
  unit: string;
  /** Unit spelled out for screen readers. */
  unitLong: string;
  min: number;
  max: number;
  step: number;
  integer: boolean;
}

export const NUMERIC: Record<NumericKey, NumericSpec> = {
  workHours: { label: 'Work time', unit: 'h', unitLong: 'hours', min: 0.25, max: 12, step: 0.25, integer: false },
  focusMinutes: { label: 'Focus time', unit: 'min', unitLong: 'minutes', min: 1, max: 120, step: 1, integer: true },
  breakMinutes: { label: 'Break time', unit: 'min', unitLong: 'minutes', min: 0, max: 30, step: 1, integer: true },
  repsPerExercise: { label: 'Reps per exercise', unit: 'reps', unitLong: 'reps', min: 1, max: 50, step: 1, integer: true },
  exercisesPerBreak: { label: 'Exercises per break', unit: '', unitLong: 'exercises', min: 1, max: 3, step: 1, integer: true },
  warningSeconds: { label: 'Warning before break', unit: 's', unitLong: 'seconds', min: 5, max: 120, step: 5, integer: true },
};

/** Fixed (not user-configurable) enforcement limits from the PRD. */
export const LIMITS = {
  snoozeMinutes: 2,
  maxPostponesPerSession: 2,
  maxPostponeMinutes: 15,
  postponeChoicesMinutes: [5, 10, 15],
  /** Rest phases shorter than this are skipped. */
  minRestSeconds: 5,
} as const;

export const DEFAULT_SETTINGS: Settings = {
  workHours: 4,
  workNoLimit: false,
  focusMinutes: 30,
  breakMinutes: 3,
  repsPerExercise: 10,
  exercisesPerBreak: 2,
  warningEnabled: true,
  warningSeconds: 30,
  snoozeEnabled: true,
  chime: true,
  officeMode: false,
  quietMode: false,
  enabledExercises: [...EXERCISE_IDS],
  enabledRest: [...REST_IDS],
  breathingPattern: 'box',
  verifyEyesClosed: false,
  musicEnabled: true,
  musicTrack: 'calm',
  theme: 'system',
  age: null,
};

export type PresetId = 'classic' | 'deep' | 'light' | 'custom';

export const PRESETS: ReadonlyArray<{ id: Exclude<PresetId, 'custom'>; label: string; focusMinutes: number; breakMinutes: number }> = [
  { id: 'classic', label: 'Classic 25/5', focusMinutes: 25, breakMinutes: 5 },
  { id: 'deep', label: 'Deep work 50/10', focusMinutes: 50, breakMinutes: 10 },
  { id: 'light', label: 'Light 20/3', focusMinutes: 20, breakMinutes: 3 },
];

/** The preset is derived from the values, so editing any field shows "Custom". */
export function matchPreset(focusMinutes: number, breakMinutes: number): PresetId {
  return PRESETS.find((p) => p.focusMinutes === focusMinutes && p.breakMinutes === breakMinutes)?.id ?? 'custom';
}

/** Exercises that can actually be picked, after Office mode (seated-safe only) and Quiet mode (no jumping). */
export function availableExercises(s: Pick<Settings, 'enabledExercises' | 'officeMode' | 'quietMode'>): ExerciseId[] {
  return EXERCISE_IDS.filter((id) => {
    if (!s.enabledExercises.includes(id)) return false;
    const cfg = getExercise(id);
    if (s.officeMode && !cfg.seatedSafe) return false;
    if (s.quietMode && !cfg.noJump) return false;
    return true;
  });
}

/** Why an exercise is excluded by a mode, or null if modes allow it. */
export function modeExclusion(id: ExerciseId, s: Pick<Settings, 'officeMode' | 'quietMode'>): string | null {
  const cfg = getExercise(id);
  if (s.officeMode && !cfg.seatedSafe) return 'Off in Office mode';
  if (s.quietMode && !cfg.noJump) return 'Off in Quiet mode';
  return null;
}
