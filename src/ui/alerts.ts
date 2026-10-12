/** Chime, browser notifications and the document title. All optional: the app works without them. */
import { FEATURES } from '../config/features';

let audio: AudioContext | null = null;

/** Must be called from a user gesture (e.g. the Start button) so later chimes are allowed. */
export function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

/** The shared audio context, or null before the first user gesture / if unsupported. */
export function getAudio(): AudioContext | null {
  return audio;
}

function tone(ctx: AudioContext, freq: number, at: number, level: number, decay: number): AudioScheduledSourceNode[] {
  const osc = ctx.createOscillator();
  const partial = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  partial.type = 'sine';
  osc.frequency.value = freq;
  partial.frequency.value = freq * 2.01; // a bell-like overtone
  const pg = ctx.createGain();
  pg.gain.value = 0.25;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(g);
  partial.connect(pg).connect(g);
  g.connect(ctx.destination);
  osc.start(at);
  partial.start(at);
  osc.stop(at + decay + 0.05);
  partial.stop(at + decay + 0.05);
  return [osc, partial];
}

/**
 * Schedules the focus-over bell on the audio clock, `delayMs` from now. Unlike timers, the audio
 * clock is not throttled in background tabs, so the bell rings on time from another tab.
 * Returns a cancel function. Does nothing (returns a no-op) if audio is not unlocked yet.
 */
export function scheduleBreakBell(delayMs: number): () => void {
  if (!audio || audio.state !== 'running') return () => undefined;
  try {
    const t = audio.currentTime + Math.max(0.02, delayMs / 1000);
    const nodes = [659.25, 783.99, 1046.5].flatMap((f, i) => tone(audio!, f, t + i * 0.18, 0.28, 1.4));
    return () => {
      for (const n of nodes) {
        try {
          n.stop(0);
          n.disconnect();
        } catch {
          // already finished
        }
      }
    };
  } catch {
    return () => undefined;
  }
}

/**
 * Focus is over: a clear three-note rising bell. When the tab is in the background it rings
 * twice, so it is noticed from another tab or app.
 */
export function breakBell(): void {
  if (!audio) return;
  try {
    const t = audio.currentTime + 0.02;
    const rounds = document.hidden ? 2 : 1;
    for (let r = 0; r < rounds; r++) {
      [659.25, 783.99, 1046.5].forEach((f, i) => tone(audio!, f, t + r * 1.6 + i * 0.18, 0.28, 1.4));
    }
  } catch {
    // ignore
  }
}

/** The whole session is done: a warm descending three-note phrase. */
export function endBell(): void {
  if (!audio) return;
  try {
    const t = audio.currentTime + 0.02;
    [1046.5, 783.99, 523.25].forEach((f, i) => tone(audio!, f, t + i * 0.28, 0.24, 2));
  } catch {
    // ignore
  }
}

/** A single soft, low tone: "the eyes-closed timer has started". */
export function softTone(): void {
  if (!audio) return;
  try {
    tone(audio, 392, audio.currentTime + 0.02, 0.12, 1.2);
  } catch {
    // ignore
  }
}

/** A soft two-note chime. */
export function chime(): void {
  if (!audio) return;
  try {
    const now = audio.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      osc.connect(gain).connect(audio!.destination);
      osc.start(start);
      osc.stop(start + 1);
    });
  } catch {
    // ignore
  }
}

/** Asked when the session starts (FR-1.5), never at break time. */
export async function requestNotificationPermission(): Promise<void> {
  try {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  } catch {
    // ignore: the app works without notifications
  }
}

export function notify(title: string, body: string): void {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(title, { body, tag: 'recess', silent: true });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // ignore
  }
}

export function setTitle(prefix: string | null): void {
  const t = prefix ? `${prefix} · ${FEATURES.productName}` : FEATURES.productName;
  if (document.title !== t) document.title = t;
}
