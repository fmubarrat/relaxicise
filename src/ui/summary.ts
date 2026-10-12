/** Session summary (inside the app shell). Every figure is derived from the session's event log. */
import { getExercise } from '../exercises/configs';
import { getRest } from '../rest/activities';
import { summarize } from '../session/summary';
import type { AppContext } from './context';
import { h, svg } from './dom';
import { duration, timeOfDay } from './format';
import { icon, type IconName } from './icons';
import { illustration } from './illustrations';
import { createRhythm } from './rhythm';
import type { View } from './focus';

export function statTile(iconName: IconName, label: string, value: string | number, strong = false): HTMLElement {
  return h('div', { class: `stat${strong ? ' is-strong' : ''}` }, icon(iconName, 18), h('dt', null, label), h('dd', { class: 'tabular' }, String(value)));
}

export function exerciseBars(exercises: ReturnType<typeof summarize>['exercises']): HTMLElement {
  if (exercises.length === 0) return h('p', { class: 'quiet-note' }, 'No exercises yet.');
  const max = Math.max(...exercises.map((e) => e.reps), 1);
  return h(
    'div',
    { class: 'ex-bars' },
    exercises
      .slice()
      .sort((a, b) => b.reps - a.reps)
      .map((e) => {
        const cfg = getExercise(e.id);
        return h(
          'div',
          { class: 'ex-bar-row' },
          svg(illustration(cfg.id, cfg.name).end),
          h('span', { class: 'ex-bar-name' }, cfg.name, e.skipped ? h('span', { class: 'count-badge' }, `${e.skipped} skipped`) : null),
          h('span', { class: 'ex-bar-track', 'aria-hidden': 'true' }, h('span', { class: 'ex-bar-fill', style: `width:${(e.reps / max) * 100}%` })),
          h('span', { class: 'ex-bar-value tabular' }, `${e.reps} reps`),
        );
      }),
  );
}

export function createSummaryView(ctx: AppContext): View {
  const s = ctx.controller.current!;
  const sum = summarize(s.log);
  const ended = s.endedAt ?? ctx.controller.now();
  const rhythmView = createRhythm();
  rhythmView.update(s, ended);

  const newBtn = h('button', { type: 'button', class: 'btn btn-coral btn-xl', onclick: () => ctx.controller.clear() }, icon('repeat', 20), 'Plan a new session');

  const el = h(
    'section',
    { class: 'view summary-view', 'aria-labelledby': 'sum-h' },
    h(
      'header',
      { class: 'view-head' },
      h('div', null, h('p', { class: 'kicker' }, 'Session complete'), h('h1', { id: 'sum-h' }, 'Nice work'), h('p', { class: 'view-sub' }, `${timeOfDay(s.startedAt)} – ${timeOfDay(ended)} · ${s.endReason === 'user' ? 'ended early' : 'work time finished'}`)),
      newBtn,
    ),
    h(
      'dl',
      { class: 'stat-grid' },
      statTile('target', 'Focus time', duration(sum.focusMs), true),
      statTile('coffee', 'Breaks taken', sum.breaksTaken),
      statTile('pulse', 'Total reps', sum.totalReps),
      statTile('check', 'Exercises done', sum.exercisesCompleted),
      statTile('skip', 'Skipped', sum.exercisesSkipped),
      statTile('shuffle', 'Swapped', sum.swaps),
      statTile('alarm', 'Snoozes', sum.snoozes),
      statTile('users', 'Postpones', sum.postpones),
      sum.hrPeak !== null ? statTile('heartPulse', 'Peak heart rate', `${sum.hrPeak} bpm`) : null,
      sum.hrAvg !== null ? statTile('heartPulse', 'Average in breaks', `${sum.hrAvg} bpm`) : null,
    ),
    h('section', { class: 'panel', 'aria-labelledby': 'sum-rh' }, h('h2', { id: 'sum-rh', class: 'panel-title' }, 'Rhythm'), rhythmView.el),
    h('section', { class: 'panel', 'aria-labelledby': 'h-sum-ex' }, h('h2', { id: 'h-sum-ex', class: 'panel-title' }, 'Exercises'), exerciseBars(sum.exercises)),
    sum.rest.length
      ? h(
          'section',
          { class: 'panel', 'aria-labelledby': 'h-sum-rest' },
          h('h2', { id: 'h-sum-rest', class: 'panel-title' }, 'Recovery'),
          h('p', { class: 'quiet-note' }, sum.rest.map((r) => `${getRest(r.id).name} ${r.done}${r.skipped ? ` (+${r.skipped} skipped)` : ''}`).join(' · ')),
        )
      : null,
    sum.breaksStarted > sum.breaksTaken ? h('p', { class: 'quiet-note' }, icon('info', 16), 'The last break was not finished before the session ended.') : null,
    h('p', { class: 'quiet-note' }, icon('lock', 16), 'Stored only in this browser. Cleared when you plan a new session.'),
  );

  return { el, update() {}, destroy() {} };
}

/** Insights: today's break count plus the current (or last) session in this browser. */
export function createInsightsView(ctx: AppContext): View {
  const body = h('div', { class: 'insights-body' });
  const rhythmView = createRhythm();
  const el = h(
    'section',
    { class: 'view', 'aria-labelledby': 'ins-h' },
    h('header', { class: 'view-head' }, h('div', null, h('h1', { id: 'ins-h' }, 'Insights'), h('p', { class: 'view-sub' }, 'Today, from this browser only'))),
    body,
  );

  const render = () => {
    const s = ctx.controller.current;
    const now = ctx.controller.now();
    const today = ctx.daily.breaksToday(new Date(now));
    if (!s) {
      body.replaceChildren(
        h('dl', { class: 'stat-grid' }, statTile('coffee', 'Breaks today', today, true)),
        h('div', { class: 'empty' }, icon('chart', 28), h('p', null, 'Start a session to see your rhythm, reps and recovery here.')),
      );
      return;
    }
    const sum = summarize(s.log);
    rhythmView.update(s, now);
    body.replaceChildren(
      h(
        'dl',
        { class: 'stat-grid' },
        statTile('coffee', 'Breaks today', today, true),
        statTile('target', 'Focus this session', duration(sum.focusMs)),
        statTile('pulse', 'Reps this session', sum.totalReps),
        statTile('check', 'Exercises done', sum.exercisesCompleted),
        sum.hrPeak !== null ? statTile('heartPulse', 'Peak heart rate', `${sum.hrPeak} bpm`) : null,
      ),
      h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, s.phase === 'SUMMARY' ? 'Last session' : "Today's rhythm"), rhythmView.el),
      h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, 'Reps by exercise'), exerciseBars(sum.exercises)),
    );
  };
  render();
  const timer = setInterval(render, 5000);
  return { el, update: render, destroy: () => clearInterval(timer) };
}
