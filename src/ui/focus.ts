/**
 * Focus dashboard (inside the app shell): session label, large timer, ticked progress bar,
 * next reset, Start a break, today's rhythm, session details. The camera is off throughout.
 */
import type { SessionState } from '../session/machine';
import { postponesLeft } from '../session/machine';
import type { AppContext } from './context';
import { h, setText } from './dom';
import { clock, duration, timeOfDay } from './format';
import { icon } from './icons';
import { createPostponeControl } from './postpone';
import { createRhythm } from './rhythm';

export interface View {
  el: HTMLElement;
  update(s: SessionState | null): void;
  destroy(): void;
}

export function createFocusView(ctx: AppContext): View {
  const { controller } = ctx;

  const kicker = h('span', { class: 'kicker' });
  const config = h('span', { class: 'focus-config' });
  const timer = h('p', { class: 'focus-timer tabular', role: 'timer', 'aria-live': 'off' });
  const timerLabel = h('p', { class: 'focus-label' });
  const nextReset = h('p', { class: 'next-reset' });
  const nextAt = h('p', { class: 'next-at tabular' });
  // Ring: like a watch timer, it empties as the focus block runs down. A coral dot marks "now".
  const R = 132;
  const C = 2 * Math.PI * R;
  const ringSvg = h('div', { class: 'ring-svg', 'aria-hidden': 'true' });
  ringSvg.innerHTML = `<svg viewBox="0 0 300 300">
    <circle class="ring-track" cx="150" cy="150" r="${R}"/>
    <circle class="ring-fill" cx="150" cy="150" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="0" transform="rotate(-90 150 150)"/>
    <circle class="ring-dot" cx="150" cy="${150 - R}" r="9"/>
  </svg>`;
  const ringFill = ringSvg.querySelector('.ring-fill') as SVGCircleElement;
  const ringDot = ringSvg.querySelector('.ring-dot') as SVGCircleElement;
  const ofTotal = h('p', { class: 'ring-of tabular' });
  const meter = h(
    'div',
    { class: 'focus-ring', role: 'progressbar', 'aria-label': 'Focus block remaining', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    ringSvg,
    h('div', { class: 'ring-center' }, timer, ofTotal),
  );

  const message = h('p', { class: 'inline-message', role: 'status' });
  const startBreak = h('button', { type: 'button', class: 'btn btn-coral btn-xl', onclick: () => setText(message, controller.triggerBreakNow() ?? '') }, icon('zap', 20), 'Start a break');

  const keepGoing = h('button', { type: 'button', class: 'btn btn-small btn-quiet', onclick: () => showConfirm(false) }, 'Keep going');
  const confirmRow = h(
    'div',
    { class: 'confirm-row', hidden: true, role: 'group', 'aria-label': 'Confirm end session' },
    h('span', null, 'End this session?'),
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => controller.endSession() }, 'End'),
    keepGoing,
  );
  const endBtn = h('button', { type: 'button', class: 'btn btn-quiet' }, icon('stop', 18), 'End session');
  endBtn.addEventListener('click', () => showConfirm(true));
  function showConfirm(on: boolean) {
    confirmRow.hidden = !on;
    endBtn.hidden = on;
    (on ? keepGoing : endBtn).focus();
  }

  const postpone = createPostponeControl(ctx, (t) => setText(message, t));
  const bannerText = h('span', { class: 'banner-text' });
  const banner = h('div', { class: 'banner', role: 'status', hidden: true }, h('div', { class: 'banner-msg' }, icon('bell', 20), bannerText), postpone.el);

  const rhythmView = createRhythm();

  const dRow = (label: string, value: HTMLElement) => h('div', { class: 'd-row' }, h('dt', null, label), h('dd', { class: 'tabular' }, value));
  const vFocus = h('span');
  const vBreak = h('span');
  const vEnds = h('span');
  const vToday = h('span');
  const vPost = h('span');

  const el = h(
    'section',
    { class: 'view focus-view', 'aria-labelledby': 'focus-h' },
    h(
      'header',
      { class: 'view-head' },
      h('div', null, h('h1', { id: 'focus-h' }, 'Today'), h('p', { class: 'view-sub' }, new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }))),
      h('p', { class: 'status-pill' }, icon('cameraOff', 16), 'Camera off during focus'),
    ),
    banner,
    h(
      'div',
      { class: 'focus-panel' },
      h('div', { class: 'focus-top' }, kicker, config),
      h(
        'div',
        { class: 'focus-main' },
        meter,
        h('div', { class: 'focus-side' }, nextReset, nextAt, h('div', { class: 'focus-actions' }, startBreak, endBtn, confirmRow)),
      ),
      message,
    ),
    h(
      'div',
      { class: 'focus-grid' },
      h('section', { class: 'panel', 'aria-labelledby': 'rh-h' }, h('h2', { id: 'rh-h', class: 'panel-title' }, "Today's rhythm"), rhythmView.el),
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'ses-h' },
        h('h2', { id: 'ses-h', class: 'panel-title' }, 'Session'),
        h('dl', { class: 'd-list' }, dRow('Focus interval', vFocus), dRow('Break', vBreak), dRow('Ends', vEnds), dRow('Breaks today', vToday), dRow('Meeting postpones left', vPost)),
      ),
    ),
  );


  const render = () => {
    const s = controller.current;
    if (!s || (s.phase !== 'FOCUS' && s.phase !== 'WARNING')) return;
    const now = controller.now();
    const end = s.phaseEnd ?? now;
    const sessionEndsFirst = s.endsAt !== null && s.endsAt <= end;
    const target = sessionEndsFirst ? s.endsAt! : end;
    const start = s.delay ? s.phaseStart : (s.focusStart ?? s.phaseStart);
    const total = Math.max(1, target - start);
    const left = Math.max(0, target - now);
    const frac = Math.min(1, Math.max(0, (now - start) / total));

    setText(kicker, s.delay === 'snooze' ? 'Snoozed' : s.delay === 'postpone' ? 'Postponed' : sessionEndsFirst ? 'Last focus block' : 'Focus session');
    setText(config, `${duration(s.config.focusMs)} focus · ${s.config.breakMs ? `${duration(s.config.breakMs)} break` : 'exercise-only breaks'}`);
    setText(timer, clock(left));
    setText(timerLabel, sessionEndsFirst ? 'Until the session ends' : s.delay ? 'Until your break comes back' : 'Focus session');
    const mins = Math.ceil(left / 60_000);
    setText(nextReset, sessionEndsFirst ? 'No more breaks this session' : left < 60_000 ? 'Next reset in under a minute' : `Next reset in ${mins} min`);
    setText(nextAt, sessionEndsFirst ? `Ends at ${timeOfDay(target)}` : `at ${timeOfDay(end)}`);

    const remaining = 1 - frac;
    ringFill.setAttribute('stroke-dashoffset', String(C * frac));
    // Dot sits at the end of the remaining arc (12 o'clock = 0, clockwise).
    const a = remaining * 2 * Math.PI;
    ringDot.setAttribute('cx', String(150 + R * Math.sin(a)));
    ringDot.setAttribute('cy', String(150 - R * Math.cos(a)));
    meter.setAttribute('aria-valuenow', String(Math.round(remaining * 100)));
    meter.setAttribute('aria-valuetext', `${clock(left)} remaining`);
    setText(ofTotal, `of ${duration(total)}`);

    setText(vFocus, duration(s.config.focusMs));
    setText(vBreak, s.config.breakMs ? duration(s.config.breakMs) : 'Exercises only');
    setText(vEnds, s.endsAt === null ? 'No limit' : timeOfDay(s.endsAt));
    setText(vToday, String(ctx.daily.breaksToday(new Date(now))));
    setText(vPost, String(postponesLeft(s)));

    const warning = s.phase === 'WARNING';
    banner.hidden = !warning;
    if (warning) setText(bannerText, `Break in ${clock(end - now)}. Finish your thought.`);
    postpone.update();
    rhythmView.update(s, now);
  };

  const interval = setInterval(render, 250);
  render();

  return {
    el,
    update: () => render(),
    destroy: () => clearInterval(interval),
  };
}
