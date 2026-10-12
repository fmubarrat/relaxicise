/**
 * Mounts one screen at a time based on the session phase, and runs transition effects:
 * chime + notification + title at break time, notification at the pre-break warning,
 * and the "breaks completed today" counter.
 */
import type { SessionState } from '../session/machine';
import type { AppContext, Screen } from './context';
import { breakBell, endBell, notify, scheduleBreakBell, setTitle } from './alerts';
import { clock } from './format';
import { createShellScreen } from './shell';
import { createBreakExerciseScreen } from './breakExercise';
import { createRestScreen } from './rest';
import { createWakeLock } from './widgets';
import { music } from '../audio/music';
import { heartRate } from '../health/heartRate';

type ScreenKey = 'shell' | 'exercise' | 'rest';

function keyFor(s: SessionState | null): ScreenKey {
  if (s?.phase === 'BREAK_EXERCISE') return 'exercise';
  if (s?.phase === 'BREAK_REST') return 'rest';
  return 'shell';
}

const FACTORIES: Record<ScreenKey, (ctx: AppContext) => Screen> = {
  shell: createShellScreen,
  exercise: createBreakExerciseScreen,
  rest: createRestScreen,
};

export class App {
  private screen: Screen | null = null;
  private key: ScreenKey | null = null;
  private readonly wakeLock = createWakeLock();
  /** The focus-over bell pre-scheduled on the audio clock: when it rings, and how to cancel it. */
  private bell: { at: number; cancel: () => void } | null = null;

  constructor(private readonly root: HTMLElement, private readonly ctx: AppContext) {
    ctx.controller.subscribe((next, prev) => {
      this.effects(next, prev);
      this.render();
    });
    setInterval(() => this.updateTitle(), 1000);
  }

  render(): void {
    const s = this.ctx.controller.current;
    const key = keyFor(s);
    if (key === this.key) {
      this.screen?.update?.(s);
      return;
    }
    this.screen?.destroy?.();
    this.key = key;
    this.screen = FACTORIES[key](this.ctx);
    this.root.replaceChildren(this.screen.el);
    this.screen.el.classList.add('fade-in');
    document.body.classList.toggle('has-overlay', Boolean(this.screen.overlay));
    document.body.dataset.screen = key;
    this.syncMusic();
    if (key === 'exercise' || key === 'rest') this.wakeLock.hold();
    else this.wakeLock.release();
    if (!this.screen.initialFocus) this.screen.el.setAttribute('tabindex', '-1');
    (this.screen.initialFocus ?? this.screen.el).focus({ preventScroll: true });
    if (!this.screen.overlay) window.scrollTo(0, 0);
    this.updateTitle();
  }

  /** Music plays during breaks when enabled. Safe to call any time (e.g. after audio unlocks). */
  syncMusic(): void {
    const inBreak = this.key === 'exercise' || this.key === 'rest';
    const st = this.ctx.settingsStore.load();
    music.setChoice(st.musicTrack);
    if (inBreak && st.musicEnabled) music.start();
    else if (this.key !== 'shell' || this.ctx.controller.current) music.stop();
  }

  private effects(next: SessionState | null, prev: SessionState | null): void {
    if (!next) return;
    const wasBreak = prev?.phase === 'BREAK_EXERCISE' || prev?.phase === 'BREAK_REST';
    const isBreak = next.phase === 'BREAK_EXERCISE' || next.phase === 'BREAK_REST';
    if (isBreak && !wasBreak) heartRate.startRecording();
    if (wasBreak && !isBreak) {
      const hr = heartRate.stopRecording();
      // Recorded after this commit finishes, so listeners are not re-entered.
      if (hr) queueMicrotask(() => this.ctx.controller.recordHeartRate(hr.peak, hr.avg));
    }
    const settings = this.ctx.settingsStore.load();

    if (next.phase === 'WARNING' && prev?.phase === 'FOCUS') {
      notify('Break soon', `Your break starts in ${Math.round(next.config.warningMs / 1000)} seconds.`);
    }
    if (next.phase === 'BREAK_EXERCISE' && prev && !wasBreak) {
      // If the pre-scheduled bell was for this exact moment it has rung (or is ringing) already.
      const now = this.ctx.controller.now();
      const scheduledHere = this.bell && prev.phaseEnd !== null && Math.abs(this.bell.at - prev.phaseEnd) < 1500 && now >= this.bell.at - 1000;
      if (scheduledHere) {
        this.bell = null;
        // A background tab may be throttled; ring once more when it catches up so it is noticed.
        if (document.hidden && now - prev.phaseEnd! > 3000 && settings.chime) breakBell();
      } else if (settings.chime) {
        this.bell?.cancel();
        this.bell = null;
        breakBell();
      }
      notify('Time to move', 'Your focus block is over. Come back to the relaxicise tab for your break.');
    }
    if (next.phase === 'SUMMARY' && prev && prev.phase !== 'SUMMARY') {
      if (settings.chime) endBell();
      notify('Session finished', 'Your relaxicise session summary is ready.');
    }
    this.syncBell(next, settings.chime);

    // Count newly finished breaks for "breaks completed today".
    if (prev && next.log.length > prev.log.length) {
      for (const e of next.log.slice(prev.log.length)) {
        if (e.type === 'break_done') this.ctx.daily.addBreak(new Date(e.t));
      }
    }
  }

  /** Keeps exactly one bell scheduled for the end of the current focus block. */
  syncBell(s: SessionState | null, enabled: boolean): void {
    const inFocus = s && (s.phase === 'FOCUS' || s.phase === 'WARNING') && s.phaseEnd !== null;
    const target = inFocus && enabled && (s.endsAt === null || s.endsAt > s.phaseEnd!) ? s.phaseEnd! : null;
    if (this.bell && this.bell.at === target) return;
    this.bell?.cancel();
    this.bell = null;
    if (target === null) return;
    const delay = target - this.ctx.controller.now();
    if (delay <= 0) return;
    const cancel = scheduleBreakBell(delay);
    this.bell = { at: target, cancel };
  }

  private updateTitle(): void {
    const s = this.ctx.controller.current;
    if (!s) return setTitle(null);
    switch (s.phase) {
      case 'FOCUS':
      case 'WARNING':
        return setTitle(`${clock((s.phaseEnd ?? 0) - this.ctx.controller.now())} focus`);
      case 'BREAK_EXERCISE':
      case 'BREAK_REST':
        return setTitle('Time to move');
      case 'SUMMARY':
        return setTitle('Summary');
    }
  }
}
