/** The derived line under the timing fields, e.g. "8 focus blocks, about 7 breaks, ends around 6:40 PM". */
import type { Settings } from './schema';

export interface Plan {
  focusBlocks: number;
  breaks: number;
}

/** Counts focus blocks and breaks in a session, assuming breaks take exactly the break time. */
export function planSession(workMinutes: number, focusMinutes: number, breakMinutes: number): Plan {
  let t = 0;
  let focusBlocks = 0;
  let breaks = 0;
  while (t < workMinutes) {
    focusBlocks++;
    t += focusMinutes;
    if (t >= workMinutes) break;
    breaks++;
    t += breakMinutes;
  }
  return { focusBlocks, breaks };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function defaultTimeFormat(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function summaryLine(
  s: Pick<Settings, 'workHours' | 'workNoLimit' | 'focusMinutes' | 'breakMinutes'>,
  now: Date,
  formatTime: (d: Date) => string = defaultTimeFormat,
): string {
  const breakPart = s.breakMinutes === 0 ? 'exercise-only breaks' : `${s.breakMinutes} min breaks`;
  if (s.workNoLimit) {
    return `${s.focusMinutes} min focus blocks with ${breakPart}, no end time`;
  }
  const work = s.workHours * 60;
  const { focusBlocks, breaks } = planSession(work, s.focusMinutes, s.breakMinutes);
  const end = new Date(now.getTime() + work * 60_000);
  const breakText = breaks === 0 ? 'no breaks' : `about ${plural(breaks, 'break')}`;
  return `${plural(focusBlocks, 'focus block')}, ${breakText}, ends around ${formatTime(end)}`;
}
