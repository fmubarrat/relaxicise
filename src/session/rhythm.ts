/**
 * "Today's rhythm": the session as a timeline of focus blocks and breaks, from the event log
 * (what happened), the live phase (what is happening) and the timing config (what is planned).
 */
import type { SessionState } from './machine';

export type SegmentKind = 'focus' | 'break' | 'now' | 'planned-focus' | 'planned-break';

export interface Segment {
  kind: SegmentKind;
  start: number;
  end: number;
}

export interface Rhythm {
  from: number;
  to: number;
  segments: Segment[];
}

const MAX_PLANNED = 60;

export function rhythm(s: SessionState, now: number): Rhythm {
  const segs: Segment[] = [];
  const focus = s.log.filter((e): e is Extract<typeof e, { type: 'focus' }> => e.type === 'focus');

  // Completed focus stretches, and the gaps between them (breaks, including snooze/postpone time
  // spent in the break screen).
  let cursor: number | null = null;
  for (const f of focus) {
    if (cursor !== null && f.start > cursor) segs.push({ kind: 'break', start: cursor, end: f.start });
    segs.push({ kind: 'focus', start: f.start, end: f.end });
    cursor = f.end;
  }

  const end = s.phase === 'SUMMARY' ? (s.endedAt ?? now) : now;
  if (s.phase === 'FOCUS' || s.phase === 'WARNING') {
    const fs = s.focusStart ?? s.phaseStart;
    if (cursor !== null && fs > cursor) segs.push({ kind: 'break', start: cursor, end: fs });
    segs.push({ kind: 'now', start: fs, end: now });
  } else if (s.phase === 'BREAK_EXERCISE' || s.phase === 'BREAK_REST') {
    if (cursor !== null) segs.push({ kind: 'break', start: cursor, end: now });
  }

  let to = end;
  if (s.phase === 'FOCUS' || s.phase === 'WARNING') {
    // Planned: rest of this block, then break/focus alternating until the session ends.
    const limit = s.endsAt ?? now + 3 * (s.config.focusMs + s.config.breakMs);
    let t = now;
    let blockEnd = Math.min(s.phaseEnd ?? now, limit);
    if (blockEnd > t) segs.push({ kind: 'planned-focus', start: t, end: blockEnd });
    t = blockEnd;
    for (let i = 0; i < MAX_PLANNED && t < limit; i++) {
      const b = Math.min(t + Math.max(s.config.breakMs, s.config.focusMs * 0.02), limit);
      segs.push({ kind: 'planned-break', start: t, end: b });
      t = b;
      if (t >= limit) break;
      blockEnd = Math.min(t + s.config.focusMs, limit);
      segs.push({ kind: 'planned-focus', start: t, end: blockEnd });
      t = blockEnd;
    }
    to = Math.max(t, now);
  }

  return { from: s.startedAt, to: Math.max(to, s.startedAt + 1), segments: segs.filter((x) => x.end > x.start) };
}
