/**
 * Heart-rate ranges. General fitness guidance only, not medical advice:
 * estimated max heart rate = 220 - age (a rough population formula). Without an age we
 * assume 180, roughly age 40. Light activity is 50-70% of max; relaxicise cautions at 85%.
 */
export const DEFAULT_MAX_HR = 180;
export const LIGHT_FROM = 0.5;
export const MODERATE_FROM = 0.7;
export const CAUTION_FROM = 0.85;

export type HrZone = 'rest' | 'light' | 'moderate' | 'caution';

export function maxHeartRate(age: number | null): number {
  return age ? 220 - age : DEFAULT_MAX_HR;
}

export function cautionBpm(age: number | null): number {
  return Math.round(maxHeartRate(age) * CAUTION_FROM);
}

export function lightRange(age: number | null): [number, number] {
  const max = maxHeartRate(age);
  return [Math.round(max * LIGHT_FROM), Math.round(max * MODERATE_FROM)];
}

export function hrZone(bpm: number, age: number | null): HrZone {
  const max = maxHeartRate(age);
  if (bpm >= cautionBpm(age)) return 'caution';
  if (bpm >= max * MODERATE_FROM) return 'moderate';
  if (bpm >= max * LIGHT_FROM) return 'light';
  return 'rest';
}

export const ZONE_LABEL: Record<HrZone, string> = {
  rest: 'Resting',
  light: 'Light',
  moderate: 'Moderate',
  caution: 'High',
};
