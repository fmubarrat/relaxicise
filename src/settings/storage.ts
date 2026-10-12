import { isExerciseId } from '../exercises/types';
import { isRestId } from '../rest/activities';
import { DEFAULT_SETTINGS, NUMERIC, type NumericKey, type Settings } from './schema';
import { parseAge, parseNumeric } from './validate';
import { TRACK_IDS } from '../audio/music';

const KEY = 'recess.settings.v1';

/** Minimal storage surface so tests can use an in-memory map. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Merges stored values over defaults, dropping anything invalid field by field. */
export function sanitizeSettings(input: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, enabledExercises: [...DEFAULT_SETTINGS.enabledExercises], enabledRest: [...DEFAULT_SETTINGS.enabledRest] };
  if (!input || typeof input !== 'object') return out;
  const o = input as Record<string, unknown>;

  for (const key of Object.keys(NUMERIC) as NumericKey[]) {
    const v = o[key];
    if (typeof v === 'number' && typeof parseNumeric(key, String(v)) === 'number') out[key] = v;
  }
  for (const key of ['workNoLimit', 'warningEnabled', 'snoozeEnabled', 'chime', 'officeMode', 'quietMode', 'verifyEyesClosed', 'musicEnabled'] as const) {
    if (typeof o[key] === 'boolean') out[key] = o[key] as boolean;
  }
  if (Array.isArray(o.enabledExercises)) out.enabledExercises = o.enabledExercises.filter(isExerciseId);
  if (Array.isArray(o.enabledRest)) out.enabledRest = o.enabledRest.filter(isRestId);
  if (typeof o.age === 'number' && typeof parseAge(String(o.age)) === 'number') out.age = o.age;
  if (o.musicTrack === 'shuffle' || (TRACK_IDS as readonly unknown[]).includes(o.musicTrack)) out.musicTrack = o.musicTrack as Settings['musicTrack'];
  if (o.theme === 'system' || o.theme === 'light' || o.theme === 'dark') out.theme = o.theme;
  if (o.breathingPattern === 'box' || o.breathingPattern === 'fiveFive') out.breathingPattern = o.breathingPattern;
  return out;
}

export class SettingsStore {
  constructor(private readonly store: KeyValueStore) {}

  load(): Settings {
    try {
      const raw = this.store.getItem(KEY);
      return sanitizeSettings(raw ? JSON.parse(raw) : null);
    } catch {
      return sanitizeSettings(null);
    }
  }

  save(s: Settings): void {
    try {
      this.store.setItem(KEY, JSON.stringify(s));
    } catch {
      // Storage full or blocked: settings simply will not persist.
    }
  }
}
