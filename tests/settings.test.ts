import { describe, expect, it } from 'vitest';
import { availableExercises, DEFAULT_SETTINGS, matchPreset } from '../src/settings/schema';
import { parseNumeric, toDraft, validateDraft } from '../src/settings/validate';
import { planSession, summaryLine } from '../src/settings/summary';
import { sanitizeSettings, SettingsStore } from '../src/settings/storage';

const fmt = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('numeric validation', () => {
  it('accepts values in range', () => {
    expect(parseNumeric('focusMinutes', '30')).toBe(30);
    expect(parseNumeric('workHours', '7.75')).toBe(7.75);
    expect(parseNumeric('breakMinutes', '0')).toBe(0);
  });

  it('reports errors instead of clamping', () => {
    expect(parseNumeric('focusMinutes', '0')).toBe('Must be between 1 and 120 minutes');
    expect(parseNumeric('focusMinutes', '121')).toBe('Must be between 1 and 120 minutes');
    expect(parseNumeric('workHours', '13')).toBe('Must be between 0.25 and 12 hours');
    expect(parseNumeric('breakMinutes', '')).toBe('Enter a value');
    expect(parseNumeric('breakMinutes', 'abc')).toBe('Enter a number');
    expect(parseNumeric('focusMinutes', '30.5')).toBe('Use a whole number');
    expect(parseNumeric('workHours', '1.1')).toBe('Use steps of 0.25 h');
  });

  it('validateDraft returns field errors and no settings when invalid', () => {
    const d = { ...toDraft(DEFAULT_SETTINGS), focusMinutes: '200' };
    const r = validateDraft(d);
    expect(r.settings).toBeNull();
    expect(r.errors.focusMinutes).toMatch(/between 1 and 120/);
  });

  it('does not validate disabled fields', () => {
    const d = { ...toDraft(DEFAULT_SETTINGS), workNoLimit: true, workHours: '', warningEnabled: false, warningSeconds: 'x' };
    const r = validateDraft(d);
    expect(r.errors).toEqual({});
    expect(r.settings!.workNoLimit).toBe(true);
  });

  it('round-trips defaults', () => {
    expect(validateDraft(toDraft(DEFAULT_SETTINGS)).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('requires at least one exercise available in the current mode', () => {
    const none = validateDraft({ ...toDraft(DEFAULT_SETTINGS), enabledExercises: [] });
    expect(none.errors.enabledExercises).toMatch(/at least one/);
    const filtered = validateDraft({ ...toDraft(DEFAULT_SETTINGS), enabledExercises: ['squats', 'jumpingJacks'], officeMode: true });
    expect(filtered.errors.enabledExercises).toMatch(/current mode/);
  });

  it('requires a rest activity unless break time is 0', () => {
    expect(validateDraft({ ...toDraft(DEFAULT_SETTINGS), enabledRest: [] }).errors.enabledRest).toBeDefined();
    expect(validateDraft({ ...toDraft(DEFAULT_SETTINGS), enabledRest: [], breakMinutes: '0' }).errors).toEqual({});
  });
});

describe('presets', () => {
  it('derives the preset from values; anything else is Custom', () => {
    expect(matchPreset(25, 5)).toBe('classic');
    expect(matchPreset(50, 10)).toBe('deep');
    expect(matchPreset(20, 3)).toBe('light');
    expect(matchPreset(30, 3)).toBe('custom');
    expect(matchPreset(25, 6)).toBe('custom');
  });
});

describe('derived summary line', () => {
  const now = new Date(2026, 9, 12, 14, 40);

  it('counts blocks and breaks and shows the end time', () => {
    expect(planSession(240, 30, 3)).toEqual({ focusBlocks: 8, breaks: 7 });
    expect(summaryLine({ workHours: 4, workNoLimit: false, focusMinutes: 30, breakMinutes: 3 }, now, fmt)).toBe(
      '8 focus blocks, about 7 breaks, ends around 18:40',
    );
  });

  it('handles singular and no-break cases', () => {
    expect(summaryLine({ workHours: 0.25, workNoLimit: false, focusMinutes: 30, breakMinutes: 3 }, now, fmt)).toBe(
      '1 focus block, no breaks, ends around 14:55',
    );
    expect(planSession(60, 25, 5)).toEqual({ focusBlocks: 2, breaks: 2 });
  });

  it('shows "no end time" for No limit', () => {
    expect(summaryLine({ workHours: 4, workNoLimit: true, focusMinutes: 30, breakMinutes: 3 }, now, fmt)).toBe(
      '30 min focus blocks with 3 min breaks, no end time',
    );
  });
});

describe('modes', () => {
  it('office = seated-safe only, quiet = no jumping', () => {
    const all = { ...DEFAULT_SETTINGS };
    expect(availableExercises({ ...all, officeMode: true }).every((id) => ['armRaises', 'sideBends', 'shrugs', 'armCircles', 'chairStands'].includes(id))).toBe(true);
    expect(availableExercises({ ...all, quietMode: true })).not.toContain('jumpingJacks');
  });
});

describe('settings storage', () => {
  it('persists and reloads, dropping invalid stored values', () => {
    const map = new Map<string, string>();
    const kv = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
    const store = new SettingsStore(kv);
    store.save({ ...DEFAULT_SETTINGS, focusMinutes: 45, officeMode: true });
    expect(store.load().focusMinutes).toBe(45);
    expect(store.load().officeMode).toBe(true);

    const s = sanitizeSettings({ focusMinutes: 999, enabledExercises: ['squats', 'nope'], breathingPattern: 'weird' });
    expect(s.focusMinutes).toBe(DEFAULT_SETTINGS.focusMinutes);
    expect(s.enabledExercises).toEqual(['squats']);
    expect(s.breathingPattern).toBe('box');
  });
});
