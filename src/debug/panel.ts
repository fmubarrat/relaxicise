/** ?debug=1 panel: fast timers, force an exercise, start a break now, simulate reps, live readout. */
import { EXERCISES } from '../exercises/configs';
import type { AppContext } from '../ui/context';
import { h, setText } from '../ui/dom';

export function mountDebugPanel(ctx: AppContext): void {
  const { debug, controller } = ctx;
  if (!debug.enabled) return;

  const message = h('p', { class: 'debug-msg', role: 'status' });
  const say = (text: string | null) => setText(message, text ?? '');

  const fast = h('input', {
    type: 'checkbox',
    checked: debug.fastTimers,
    onchange: (e: Event) => {
      debug.setFastTimers((e.target as HTMLInputElement).checked);
      say('Applies to the next session you start.');
    },
  });

  const force = h(
    'select',
    {
      onchange: (e: Event) => {
        const id = (e.target as HTMLSelectElement).value || null;
        debug.setForceExercise(id);
        if (id && controller.current?.phase === 'BREAK_EXERCISE') say(controller.swapExercise(debug.forceExercise ?? undefined));
      },
    },
    h('option', { value: '' }, 'Random (normal)'),
    EXERCISES.map((e) => h('option', { value: e.id }, e.name)),
  );

  const readout = h('pre', { class: 'debug-readout', 'aria-live': 'off' });
  const render = () => {
    const s = controller.current;
    const l = debug.live;
    const now = controller.now();
    const lines = [
      `phase     ${s?.phase ?? 'IDLE'}${s?.delay ? ` (${s.delay})` : ''}`,
      `phaseEnd  ${s?.phaseEnd ? `${((s.phaseEnd - now) / 1000).toFixed(1)} s` : '-'}`,
      `timescale ${s ? (s.config.timeScale === 1 ? '1x' : 'fast (min = s)') : debug.fastTimers ? 'fast (next)' : '1x'}`,
      `exercise  ${l.exercise ?? '-'}`,
      `stage     ${l.stage ?? '-'}`,
      `signal    ${l.signal === null || l.signal === undefined ? '-' : l.signal.toFixed(3)}`,
      `counter   ${l.counterState ?? '-'}`,
      `reps      ${l.reps ?? '-'}`,
      `visible   ${l.visible === undefined ? '-' : l.visible ? 'yes' : 'no'}`,
      `camera    ${l.camera ?? '-'}`,
      `fps       ${l.fps ? l.fps.toFixed(1) : '-'}`,
    ];
    setText(readout, lines.join('\n'));
  };

  const panel = h(
    'details',
    { class: 'debug-panel', 'aria-label': 'Debug tools' },
    h('summary', null, 'Debug'),
    h('label', { class: 'check' }, fast, h('span', null, 'Fast timers (minutes run as seconds)')),
    h('label', { class: 'field-label' }, 'Force exercise', force),
    h(
      'div',
      { class: 'debug-actions' },
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => say(controller.triggerBreakNow()) }, 'Start break now'),
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => debug.simulateRep() }, 'Simulate rep (R)'),
    ),
    readout,
    message,
  );
  document.body.appendChild(panel);

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    if (e.key === 'r' || e.key === 'R') debug.simulateRep();
  });

  debug.on(render);
  controller.subscribe(render);
  setInterval(render, 500);
  render();
}
