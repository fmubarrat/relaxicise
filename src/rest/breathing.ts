export type BreathingPattern = 'box' | 'fiveFive';
export type BreathWord = 'In' | 'Hold' | 'Out';

interface Step {
  word: BreathWord;
  seconds: number;
  /** Circle size at the start and end of the step, 0 (empty) to 1 (full). */
  from: number;
  to: number;
}

export const PATTERNS: Record<BreathingPattern, { label: string; steps: readonly Step[] }> = {
  box: {
    label: 'Box breathing (4-4-4-4)',
    steps: [
      { word: 'In', seconds: 4, from: 0, to: 1 },
      { word: 'Hold', seconds: 4, from: 1, to: 1 },
      { word: 'Out', seconds: 4, from: 1, to: 0 },
      { word: 'Hold', seconds: 4, from: 0, to: 0 },
    ],
  },
  fiveFive: {
    label: '5 in, 5 out',
    steps: [
      { word: 'In', seconds: 5, from: 0, to: 1 },
      { word: 'Out', seconds: 5, from: 1, to: 0 },
    ],
  },
};

export interface BreathPhase {
  word: BreathWord;
  /** Whole seconds left in this step, counting down (4, 3, 2, 1). */
  count: number;
  /** 0..1 progress through this step. */
  progress: number;
  /** 0..1 size of the pacing shape. */
  size: number;
}

export function breathPhaseAt(pattern: BreathingPattern, elapsedMs: number): BreathPhase {
  const steps = PATTERNS[pattern].steps;
  const cycleMs = steps.reduce((sum, s) => sum + s.seconds * 1000, 0);
  let t = ((elapsedMs % cycleMs) + cycleMs) % cycleMs;
  for (const s of steps) {
    const ms = s.seconds * 1000;
    if (t < ms) {
      const progress = t / ms;
      return {
        word: s.word,
        count: Math.max(1, Math.ceil(s.seconds - t / 1000)),
        progress,
        size: s.from + (s.to - s.from) * progress,
      };
    }
    t -= ms;
  }
  // Unreachable: t < cycleMs.
  const last = steps[steps.length - 1];
  return { word: last.word, count: 1, progress: 1, size: last.to };
}
