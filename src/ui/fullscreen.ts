/** Full-screen toggle using the Fullscreen API. Hidden where the API is unavailable (e.g. iPhone). */
import { h } from './dom';
import { icon } from './icons';

export function fullscreenSupported(): boolean {
  return typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen().catch(() => undefined);
}

/** A button that toggles full screen and keeps its label in sync. `compact` shows the icon only. */
export function createFullscreenButton(compact = false): HTMLButtonElement {
  const btn = h('button', { type: 'button', class: compact ? 'icon-btn' : 'side-btn' });
  const render = () => {
    const on = !!document.fullscreenElement;
    const label = on ? 'Exit full screen' : 'Full screen';
    btn.replaceChildren(icon(on ? 'minimize' : 'maximize', 18), compact ? '' : h('span', null, label));
    btn.setAttribute('aria-label', label);
    btn.title = `${label} (F)`;
  };
  btn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', render);
  btn.hidden = !fullscreenSupported();
  render();
  return btn;
}
