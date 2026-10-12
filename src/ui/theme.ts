/** Light / dark / follow-the-system theme. Applied as data-theme on <html>. */
import type { SettingsStore } from '../settings/storage';
import type { ThemeChoice } from '../settings/schema';
import { h } from './dom';
import { icon } from './icons';

const THEME_COLOR = { light: '#F7F5F2', dark: '#19191F' };

export function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function effectiveTheme(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice;
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  // Keep the browser chrome (mobile address bar) in step.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (choice === 'system') meta.content = meta.media.includes('dark') ? THEME_COLOR.dark : THEME_COLOR.light;
    else meta.content = THEME_COLOR[choice];
  }
  document.dispatchEvent(new CustomEvent('theme-change'));
}

/** Sun/moon button: flips between light and dark (an explicit choice; System lives in Settings). */
export function createThemeToggle(store: SettingsStore, compact = false): HTMLButtonElement {
  const btn = h('button', { type: 'button', class: compact ? 'icon-btn' : 'side-btn' });
  const render = () => {
    const dark = effectiveTheme(store.load().theme) === 'dark';
    const label = dark ? 'Light mode' : 'Dark mode';
    btn.replaceChildren(icon(dark ? 'sun' : 'moon', 18), compact ? '' : h('span', null, label));
    btn.setAttribute('aria-label', `Switch to ${label.toLowerCase()}`);
    btn.title = btn.getAttribute('aria-label')!;
  };
  btn.addEventListener('click', () => {
    const s = store.load();
    s.theme = effectiveTheme(s.theme) === 'dark' ? 'light' : 'dark';
    store.save(s);
    applyTheme(s.theme);
  });
  document.addEventListener('theme-change', render);
  if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
  render();
  return btn;
}
