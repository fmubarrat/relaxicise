/** Small shared widgets: music toggle, heart-rate chip and caution, screen wake lock. */
import { music, TRACKS } from '../audio/music';
import { heartRate } from '../health/heartRate';
import { cautionBpm, hrZone, ZONE_LABEL } from '../health/zones';
import type { SettingsStore } from '../settings/storage';
import { h, setText } from './dom';
import { icon } from './icons';

/** Speaker button that turns break music on/off and remembers the choice. */
export function createMusicToggle(store: SettingsStore): HTMLButtonElement {
  const btn = h('button', { type: 'button', class: 'icon-btn' });
  const render = () => {
    const on = store.load().musicEnabled;
    btn.replaceChildren(icon(on ? 'volume' : 'volumeOff', 20));
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Music on. Turn off' : 'Music off. Turn on');
    btn.title = on ? 'Music on' : 'Music off';
  };
  btn.addEventListener('click', () => {
    const s = store.load();
    s.musicEnabled = !s.musicEnabled;
    store.save(s);
    music.setChoice(s.musicTrack);
    if (s.musicEnabled) music.start();
    else music.stop();
    render();
  });
  render();
  document.addEventListener('music-change', render);
  return btn;
}

/** Skips to the next music track (and remembers it, unless Shuffle is chosen). */
export function createNextTrackButton(store: SettingsStore): HTMLButtonElement {
  const btn = h('button', { type: 'button', class: 'icon-btn' }, icon('nextTrack', 18));
  const label = () => {
    const name = music.currentTrack ? TRACKS[music.currentTrack].name : null;
    btn.setAttribute('aria-label', `Next music track${name ? ` (now: ${name})` : ''}`);
    btn.title = btn.getAttribute('aria-label')!;
  };
  btn.addEventListener('click', () => {
    const s = store.load();
    if (!s.musicEnabled) {
      s.musicEnabled = true;
      store.save(s);
      music.setChoice(s.musicTrack);
      music.start();
    } else {
      const id = music.next();
      if (id && s.musicTrack !== 'shuffle') {
        s.musicTrack = id;
        store.save(s);
      }
    }
    label();
    btn.dispatchEvent(new CustomEvent('music-change', { bubbles: true }));
  });
  label();
  return btn;
}

/**
 * Live BPM chip plus a caution banner when the rate is at or above the caution level.
 * Renders nothing while no monitor is connected.
 */
export function createHeartWidget(store: SettingsStore) {
  const value = h('span', { class: 'tabular' });
  const zone = h('span', { class: 'hr-zone' });
  const chip = h('p', { class: 'hr-chip', hidden: true, role: 'status', 'aria-live': 'off' }, icon('heartPulse', 18), value, zone);
  const bannerText = h('span', null);
  const banner = h(
    'div',
    { class: 'hr-caution', role: 'alert', hidden: true },
    icon('alert', 22),
    h('div', null, h('p', { class: 'hr-caution-title' }, bannerText), h('p', null, 'Slow down and breathe. Stop if you feel dizzy, short of breath or have chest discomfort.')),
  );

  const render = () => {
    const bpm = heartRate.current();
    chip.hidden = bpm === null;
    if (bpm === null) {
      banner.hidden = true;
      return;
    }
    const age = store.load().age;
    const z = hrZone(bpm, age);
    chip.dataset.zone = z;
    setText(value, `${bpm}`);
    setText(zone, `bpm · ${ZONE_LABEL[z]}`);
    banner.hidden = z !== 'caution';
    if (z === 'caution') setText(bannerText, `Heart rate ${bpm} bpm is above your caution level (${cautionBpm(age)})`);
  };
  const off = heartRate.on(render);
  const timer = setInterval(render, 1000); // catches stale readings
  render();

  return {
    chip,
    banner,
    destroy() {
      off();
      clearInterval(timer);
    },
  };
}

/** Keeps the screen awake (useful on phones) while held. Silently does nothing if unsupported. */
export function createWakeLock() {
  type Sentinel = { release(): Promise<void> };
  let sentinel: Sentinel | null = null;
  let wanted = false;
  const acquire = async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Sentinel> } }).wakeLock;
      if (wl && wanted && document.visibilityState === 'visible') sentinel = await wl.request('screen');
    } catch {
      sentinel = null;
    }
  };
  const onVisible = () => {
    if (wanted && document.visibilityState === 'visible') void acquire();
  };
  return {
    hold() {
      if (wanted) return;
      wanted = true;
      document.addEventListener('visibilitychange', onVisible);
      void acquire();
    },
    release() {
      wanted = false;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    },
  };
}
