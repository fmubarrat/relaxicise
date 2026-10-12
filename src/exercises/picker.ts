import type { ExerciseId } from './types';

export type Rng = () => number;

function shuffle<T>(xs: readonly T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Picks up to `n` distinct exercises at random from `enabled`. The first pick avoids
 * `previous` (the last exercise of the previous break) whenever another choice exists,
 * so the same exercise never runs twice in a row.
 */
export function pickExercises(enabled: readonly ExerciseId[], n: number, previous: ExerciseId | null, rng: Rng): ExerciseId[] {
  const pool = shuffle([...new Set(enabled)], rng);
  const count = Math.min(n, pool.length);
  if (count === 0) return [];
  if (previous !== null && pool[0] === previous && pool.length > 1) {
    // Move the repeat out of first place, swapping with the next candidate.
    [pool[0], pool[1]] = [pool[1], pool[0]];
  }
  return pool.slice(0, count);
}
