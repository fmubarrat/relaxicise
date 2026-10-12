/** Renders the rhythm timeline: a precise horizontal strip with time labels and a legend. */
import { rhythm } from '../session/rhythm';
import type { SessionState } from '../session/machine';
import { h, setText } from './dom';
import { timeOfDay } from './format';

export function createRhythm() {
  const track = h('div', { class: 'rhythm-track', role: 'img' });
  const fromLabel = h('span', null);
  const toLabel = h('span', null);
  const el = h(
    'div',
    { class: 'rhythm' },
    track,
    h('div', { class: 'rhythm-axis tabular' }, fromLabel, toLabel),
    h(
      'div',
      { class: 'rhythm-legend' },
      h('span', { class: 'lg lg-focus' }, 'Focus'),
      h('span', { class: 'lg lg-break' }, 'Break'),
      h('span', { class: 'lg lg-now' }, 'Now'),
      h('span', { class: 'lg lg-planned' }, 'Planned'),
    ),
  );
  let lastKey = '';

  return {
    el,
    update(s: SessionState, now: number) {
      const r = rhythm(s, now);
      const span = r.to - r.from;
      // Rebuild only when the shape changes noticeably (every ~0.2% of the span).
      const key = r.segments.map((x) => `${x.kind}${Math.round(((x.end - r.from) / span) * 500)}`).join('|');
      if (key !== lastKey) {
        lastKey = key;
        track.replaceChildren(
          ...r.segments.map((x) =>
            h('span', {
              class: `seg seg-${x.kind}`,
              style: `left:${(((x.start - r.from) / span) * 100).toFixed(3)}%;width:${Math.max(0.35, ((x.end - x.start) / span) * 100).toFixed(3)}%`,
            }),
          ),
        );
        const done = r.segments.filter((x) => x.kind === 'focus').length;
        const breaks = r.segments.filter((x) => x.kind === 'break').length;
        track.setAttribute('aria-label', `Today's rhythm: ${done} focus blocks and ${breaks} breaks so far`);
      }
      setText(fromLabel, timeOfDay(r.from));
      setText(toLabel, s.endsAt === null && s.phase !== 'SUMMARY' ? 'No end time' : timeOfDay(r.to));
    },
  };
}
