/**
 * Break overlay, rest phase: one rest activity fills the remaining break time.
 * The camera is off, except for eyes-closed verification when the user turned it on.
 */
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { getRest, type RestId } from '../rest/activities';
import { breathPhaseAt } from '../rest/breathing';
import { EyesClosedTimer } from '../rest/eyesClosed';
import { startCamera, stopCamera } from '../pose/camera';
import { blinkScore, loadFaceLandmarker } from '../pose/landmarkers';
import { runFrameLoop, type FrameLoop } from '../pose/frameLoop';
import type { AppContext, Screen } from './context';
import { h, prefersReducedMotion, setText, trapFocus } from './dom';
import { clock } from './format';
import { chime, softTone } from './alerts';
import { createEye } from './eye';
import { icon, type IconName } from './icons';
import { createHeartWidget, createMusicToggle, createNextTrackButton } from './widgets';

const REST_ICONS: Record<RestId, IconName> = { eyeFocus: 'eye', eyesClosed: 'eyeClosed', breathing: 'wind', water: 'droplet' };

interface Activity {
  el: HTMLElement;
  tick(now: number): void;
  destroy?(): void;
  focus?: HTMLElement;
}

export function createRestScreen(ctx: AppContext): Screen {
  const { controller } = ctx;
  const s = controller.current!;
  const restId = s.brk!.rest!;
  const info = getRest(restId);
  const settings = ctx.settingsStore.load();

  const remaining = h('p', { class: 'big-time', role: 'timer', 'aria-live': 'off' });
  const message = h('p', { class: 'inline-message', role: 'status' });
  const skipBtn = h(
    'button',
    { type: 'button', class: 'btn btn-quiet', onclick: () => setText(message, controller.skipRest() ?? '') },
    icon('skip', 18),
    'Skip rest',
  );

  const activity = buildActivity(restId, settings.breathingPattern, settings.verifyEyesClosed);

  const heart = createHeartWidget(ctx.settingsStore);
  const el = h(
    'div',
    { class: 'overlay rest', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rest-title' },
    h(
      'div',
      { class: 'rest-inner' },
      h('header', { class: 'rest-top' }, h('p', { class: 'rest-kicker' }, icon('check', 16), 'Exercises done'), h('div', { class: 'head-actions' }, heart.chip, createMusicToggle(ctx.settingsStore), createNextTrackButton(ctx.settingsStore), skipBtn)),
      heart.banner,
      h(
        'div',
        { class: 'rest-center' },
        h('span', { class: 'rest-icon' }, icon(REST_ICONS[restId], 30)),
        h('h1', { id: 'rest-title', class: 'rest-title' }, info.name),
        activity.el,
      ),
      h('div', { class: 'rest-bottom' }, h('p', { class: 'eyebrow' }, 'Back to work in'), remaining, message),
    ),
  );
  const releaseTrap = trapFocus(el);

  const render = () => {
    const cur = controller.current;
    if (!cur || cur.phase !== 'BREAK_REST') return;
    const now = controller.now();
    setText(remaining, clock((cur.phaseEnd ?? now) - now));
    activity.tick(now);
  };
  const timer = setInterval(render, prefersReducedMotion() ? 250 : 50);
  render();

  return {
    el,
    overlay: true,
    initialFocus: activity.focus ?? skipBtn,
    update: render,
    destroy() {
      clearInterval(timer);
      releaseTrap();
      heart.destroy();
      activity.destroy?.();
    },
  };

  function buildActivity(id: RestId, pattern: typeof settings.breathingPattern, verify: boolean): Activity {
    switch (id) {
      case 'eyeFocus':
        return eyeFocus();
      case 'breathing':
        return breathing(pattern);
      case 'water':
        return water();
      case 'eyesClosed':
        return eyesClosed(verify);
    }
  }

  function eyeFocus(): Activity {
    const round = getRest('eyeFocus').roundSeconds! * 1000;
    const start = controller.now();
    const count = h('p', { class: 'activity-count tabular' });
    const text = h('p', { class: 'activity-text' });
    return {
      el: h('section', { class: 'activity' }, text, count),
      tick(now) {
        const elapsed = now - start;
        const n = Math.floor(elapsed / round);
        setText(text, n === 0 ? 'Look at something far away' : 'Blink, then look far away again');
        setText(count, `${Math.ceil((round - (elapsed % round)) / 1000)} s${n > 0 ? ` · round ${n + 1}` : ''}`);
      },
    };
  }

  function breathing(pattern: typeof settings.breathingPattern): Activity {
    const reduced = prefersReducedMotion();
    const start = controller.now();
    const word = h('p', { class: 'breath-word', 'aria-live': 'polite' });
    const count = h('p', { class: 'activity-count tabular' });
    const ns = 'http://www.w3.org/2000/svg';
    const shape = document.createElementNS(ns, 'svg');
    shape.setAttribute('viewBox', '0 0 120 120');
    shape.setAttribute('class', 'breath-shape');
    shape.setAttribute('aria-hidden', 'true');
    const guide = document.createElementNS(ns, 'circle');
    guide.setAttribute('cx', '60');
    guide.setAttribute('cy', '60');
    guide.setAttribute('r', '56');
    guide.setAttribute('class', 'breath-guide');
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '60');
    circle.setAttribute('cy', '60');
    circle.setAttribute('class', 'breath-fill');
    shape.append(guide, circle);
    let lastWord = '';
    return {
      el: h('section', { class: 'activity breathing' }, reduced ? null : shape, h('div', null, word, count)),
      tick(now) {
        const p = breathPhaseAt(pattern, now - start);
        if (p.word !== lastWord) {
          setText(word, p.word);
          lastWord = p.word;
        }
        setText(count, String(p.count));
        if (!reduced) circle.setAttribute('r', String(14 + 42 * p.size));
      },
    };
  }

  function water(): Activity {
    const text = h('p', { class: 'activity-text' }, 'Drink some water');
    const done = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-primary',
        onclick: () => {
          setText(text, 'Nice. Rest until the timer ends');
          done.hidden = true;
        },
      },
      'Done',
    );
    return { el: h('section', { class: 'activity' }, text, done), tick() {}, focus: done };
  }

  function eyesClosed(verify: boolean): Activity {
    const round = getRest('eyesClosed').roundSeconds! * 1000;
    const eye = createEye();
    const text = h('p', { class: 'activity-text' }, 'Close your eyes');
    const count = h('p', { class: 'activity-count tabular' });
    const statusText = h('span', null);
    const status = h('p', { class: 'eye-status', hidden: true, role: 'status' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), statusText);
    const note = h('p', { class: 'hint' });
    const video = h('video', { muted: true, playsinline: true, hidden: true });
    let timer = new EyesClosedTimer(round, false);
    let stream: MediaStream | null = null;
    let loop: FrameLoop | null = null;
    let face: FaceLandmarker | null = null;
    let blink: number | null = null;
    let verifying = false;
    let finished = false;
    let stopped = false;
    let counting = false;
    // Without the camera check, show the eye open for a moment, then closing as a guide.
    const startedAt = performance.now();

    const releaseCamera = () => {
      loop?.stop();
      loop = null;
      stopCamera(stream, video);
      stream = null;
    };

    if (verify) {
      setText(note, 'Starting camera…');
      void (async () => {
        try {
          stream = await startCamera(video);
          face = await loadFaceLandmarker();
          if (stopped) return releaseCamera();
          timer = new EyesClosedTimer(round, true);
          counting = false;
          loop = runFrameLoop(video, (t) => {
            try {
              blink = blinkScore(face!, video, t);
            } catch {
              blink = null;
            }
          });
          verifying = true;
          status.hidden = false;
          setText(note, 'The camera checks your eyes on this device');
        } catch {
          releaseCamera();
          // Unverified countdown if the camera is unavailable.
          setText(note, 'No camera, so the timer just counts down');
        }
      })();
    }

    const setStatus = (tone: 'ok' | 'warn' | 'idle', label: string) => {
      status.dataset.tone = tone;
      setText(statusText, label);
    };

    return {
      el: h('section', { class: 'activity eyes-activity' }, eye.el, status, text, count, note, video),
      tick(now) {
        eye.tick(performance.now());
        if (finished) return;
        const st = timer.update(now, blink);
        if (st.done) {
          finished = true;
          releaseCamera();
          eye.setTarget(1); // the eye opens slowly
          status.hidden = true;
          if (ctx.settingsStore.load().chime) chime();
          setText(text, 'Open your eyes slowly');
          setText(count, '');
          setText(note, '');
          return;
        }
        // A soft tone when the countdown starts, since you cannot see the screen.
        if (!st.paused && !counting) {
          counting = true;
          if (ctx.settingsStore.load().chime) softTone();
        } else if (st.paused) {
          counting = false;
        }
        setText(count, `${Math.ceil(st.remainingMs / 1000)} s`);
        if (verifying) {
          eye.setTarget(st.paused ? 1 : 0);
          if (blink === null) setStatus('warn', "Can't see your face");
          else if (st.paused) setStatus('idle', 'Eyes open');
          else setStatus('ok', 'Eyes closed ✓');
          setText(text, st.paused ? 'Close your eyes. The timer waits for you' : 'Eyes closed. Rest them');
        } else {
          eye.setTarget(performance.now() - startedAt < 1600 ? 1 : 0);
          setText(text, 'Close your eyes. A chime tells you when');
        }
      },
      destroy() {
        stopped = true;
        releaseCamera();
      },
    };
  }
}
