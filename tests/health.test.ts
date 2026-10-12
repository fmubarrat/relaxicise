import { describe, expect, it } from 'vitest';
import { HrRecorder, parseHeartRate } from '../src/health/heartRate';
import { cautionBpm, hrZone, lightRange, maxHeartRate } from '../src/health/zones';
import { parseAge, toDraft, validateDraft } from '../src/settings/validate';
import { DEFAULT_SETTINGS } from '../src/settings/schema';
import { sanitizeSettings } from '../src/settings/storage';
import * as M from '../src/session/machine';
import { buildSessionConfig } from '../src/session/config';
import { summarize } from '../src/session/summary';

const view = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

describe('heart-rate measurement parsing', () => {
  it('reads uint8 BPM when flag bit 0 is clear', () => {
    expect(parseHeartRate(view([0x00, 72]))).toBe(72);
  });
  it('reads little-endian uint16 BPM when flag bit 0 is set', () => {
    expect(parseHeartRate(view([0x01, 0x2c, 0x01]))).toBeNull(); // 300 bpm: implausible
    expect(parseHeartRate(view([0x01, 0x8c, 0x00]))).toBe(140);
  });
  it('rejects short or implausible values', () => {
    expect(parseHeartRate(view([0x00]))).toBeNull();
    expect(parseHeartRate(view([0x00, 0]))).toBeNull();
    expect(parseHeartRate(view([0x01, 0x10]))).toBeNull();
  });
});

describe('heart-rate zones', () => {
  it('uses 220 - age, or 180 when age is not set', () => {
    expect(maxHeartRate(30)).toBe(190);
    expect(maxHeartRate(null)).toBe(180);
  });
  it('cautions at 85% of max', () => {
    expect(cautionBpm(30)).toBe(162);
    expect(cautionBpm(null)).toBe(153);
  });
  it('classifies zones', () => {
    expect(lightRange(30)).toEqual([95, 133]);
    expect(hrZone(80, 30)).toBe('rest');
    expect(hrZone(110, 30)).toBe('light');
    expect(hrZone(140, 30)).toBe('moderate');
    expect(hrZone(162, 30)).toBe('caution');
  });
});

describe('per-break recording', () => {
  it('keeps peak and average', () => {
    const r = new HrRecorder();
    expect(r.result()).toBeNull();
    [90, 120, 150, 100].forEach((b) => r.add(b));
    expect(r.result()).toEqual({ peak: 150, avg: 115 });
  });

  it('heart_rate events feed the summary', () => {
    let s = M.startSession(buildSessionConfig(DEFAULT_SETTINGS), 0);
    s = (M.recordHeartRate(s, 1, 150, 120) as { state: M.SessionState }).state;
    s = (M.recordHeartRate(s, 2, 140, 110) as { state: M.SessionState }).state;
    const sum = summarize(s.log);
    expect(sum.hrPeak).toBe(150);
    expect(sum.hrAvg).toBe(115);
    expect(summarize([]).hrPeak).toBeNull();
    expect(M.recordHeartRate(s, 3, 0, 0).ok).toBe(false);
  });
});

describe('age setting', () => {
  it('is optional and validated', () => {
    expect(parseAge('')).toBeNull();
    expect(parseAge('35')).toBe(35);
    expect(parseAge('5')).toMatch(/from 10 to 100/);
    expect(parseAge('35.5')).toMatch(/from 10 to 100/);
    expect(validateDraft({ ...toDraft(DEFAULT_SETTINGS), age: '200' }).errors.age).toBeDefined();
    expect(validateDraft({ ...toDraft(DEFAULT_SETTINGS), age: '40' }).settings!.age).toBe(40);
  });
  it('is sanitised from storage, and music defaults on', () => {
    expect(sanitizeSettings({ age: 999 }).age).toBeNull();
    expect(sanitizeSettings({ age: 50, musicEnabled: false })).toMatchObject({ age: 50, musicEnabled: false });
    expect(DEFAULT_SETTINGS.musicEnabled).toBe(true);
    // Anonymous visit counting is on by default and can be turned off (and stays off).
    expect(DEFAULT_SETTINGS.analytics).toBe(true);
    expect(sanitizeSettings({ analytics: false }).analytics).toBe(false);
  });
});
