/** "I'm in a meeting" postpone control, shared by the warning banner and the break overlay. */
import { LIMITS } from '../settings/schema';
import { postponesLeft } from '../session/machine';
import type { AppContext } from './context';
import { h, setText } from './dom';
import { plural } from './format';
import { icon } from './icons';

export function createPostponeControl(ctx: AppContext, onMessage: (text: string) => void) {
  const { controller } = ctx;
  const choices = h('div', { class: 'postpone-choices', hidden: true, role: 'group', 'aria-label': 'Postpone the break by' });
  const left = h('span', { class: 'count-badge', 'aria-hidden': 'true' });

  const toggleBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-quiet',
      'aria-expanded': 'false',
      onclick: () => {
        const s = controller.current;
        if (s && postponesLeft(s) === 0) {
          // Ask the machine so the refusal text comes from one place.
          onMessage(controller.postpone(s.config.maxPostponeMs) ?? '');
          return;
        }
        const open = choices.hidden;
        choices.hidden = !open;
        toggleBtn.setAttribute('aria-expanded', String(open));
        if (open) (choices.querySelector('button') as HTMLButtonElement | null)?.focus();
      },
    },
    icon('users', 18),
    "I'm in a meeting",
  );

  for (const minutes of LIMITS.postponeChoicesMinutes) {
    choices.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-small',
          onclick: () => {
            const scale = controller.current?.config.timeScale ?? 1;
            const refusal = controller.postpone(minutes * 60_000 * scale);
            if (refusal) onMessage(refusal);
          },
        },
        `${minutes} min`,
      ),
    );
  }
  choices.appendChild(
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-small btn-quiet',
        onclick: () => {
          choices.hidden = true;
          toggleBtn.setAttribute('aria-expanded', 'false');
          toggleBtn.focus();
        },
      },
      'Cancel',
    ),
  );

  const el = h('div', { class: 'postpone' }, h('div', { class: 'postpone-row' }, h('span', { class: 'with-badge' }, toggleBtn, left)), choices);

  return {
    el,
    update() {
      const s = controller.current;
      if (!s) return;
      const n = postponesLeft(s);
      setText(left, n === 0 ? 'none left' : `${n} left`);
      toggleBtn.setAttribute('aria-label', `I'm in a meeting, postpone the break (${plural(n, 'postpone')} left this session)`);
    },
  };
}
