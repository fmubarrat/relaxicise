/**
 * The setup form edits a Draft: numeric fields are raw strings exactly as typed. Validation
 * reports inline errors and never clamps or rounds a value behind the user's back.
 */
import { AGE_RANGE, availableExercises, DEFAULT_SETTINGS, NUMERIC, type NumericKey, type Settings } from './schema';

export type Draft = Omit<Settings, NumericKey | 'age'> & Record<NumericKey, string> & { age: string };
export type FieldKey = NumericKey | 'enabledExercises' | 'enabledRest' | 'age';
export type Errors = Partial<Record<FieldKey, string>>;

export interface ValidationResult {
  settings: Settings | null;
  errors: Errors;
}

export function toDraft(s: Settings): Draft {
  const draft = { ...s, enabledExercises: [...s.enabledExercises], enabledRest: [...s.enabledRest] } as unknown as Draft;
  for (const key of Object.keys(NUMERIC) as NumericKey[]) draft[key] = String(s[key]);
  draft.age = s.age === null ? '' : String(s.age);
  return draft;
}

function fmt(n: number): string {
  return String(n);
}

/** Validates one numeric field. Returns the number or an error message. */
export function parseNumeric(key: NumericKey, raw: string): number | string {
  const spec = NUMERIC[key];
  const text = raw.trim();
  if (text === '') return 'Enter a value';
  const n = Number(text);
  if (!Number.isFinite(n)) return 'Enter a number';
  const range = `between ${fmt(spec.min)} and ${fmt(spec.max)}${spec.unitLong ? ` ${spec.unitLong}` : ''}`;
  if (n < spec.min || n > spec.max) return `Must be ${range}`;
  if (spec.integer && !Number.isInteger(n)) return 'Use a whole number';
  if (!spec.integer) {
    const steps = n / spec.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-9) return `Use steps of ${fmt(spec.step)} ${spec.unit}`;
  }
  return n;
}

/** Age is optional: blank means "not set". */
export function parseAge(raw: string): number | null | string {
  const text = raw.trim();
  if (text === '') return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < AGE_RANGE.min || n > AGE_RANGE.max) return `Enter an age from ${AGE_RANGE.min} to ${AGE_RANGE.max}, or leave it blank`;
  return n;
}

export function validateDraft(d: Draft): ValidationResult {
  const errors: Errors = {};
  const nums = {} as Record<NumericKey, number>;

  for (const key of Object.keys(NUMERIC) as NumericKey[]) {
    // Disabled fields are not validated; their last valid value is kept.
    const skip = (key === 'workHours' && d.workNoLimit) || (key === 'warningSeconds' && !d.warningEnabled);
    const r = parseNumeric(key, d[key]);
    if (typeof r === 'number') nums[key] = r;
    else if (!skip) errors[key] = r;
    else nums[key] = DEFAULT_SETTINGS[key];
  }

  if (d.enabledExercises.length === 0) {
    errors.enabledExercises = 'Choose at least one exercise';
  } else if (availableExercises(d).length === 0) {
    errors.enabledExercises = 'None of the chosen exercises are available in the current mode. Choose another exercise or turn a mode off.';
  }

  const breakMinutes = nums.breakMinutes;
  if (d.enabledRest.length === 0 && Number.isFinite(breakMinutes) && breakMinutes > 0) {
    errors.enabledRest = 'Choose at least one rest activity, or set break time to 0';
  }

  const age = parseAge(d.age);
  if (typeof age === 'string') errors.age = age;

  if (Object.keys(errors).length > 0) return { settings: null, errors };

  const settings: Settings = {
    ...d,
    enabledExercises: [...d.enabledExercises],
    enabledRest: [...d.enabledRest],
    workHours: nums.workHours,
    focusMinutes: nums.focusMinutes,
    breakMinutes: nums.breakMinutes,
    repsPerExercise: nums.repsPerExercise,
    exercisesPerBreak: nums.exercisesPerBreak,
    warningSeconds: nums.warningSeconds,
    age: age as number | null,
  };
  return { settings, errors };
}
