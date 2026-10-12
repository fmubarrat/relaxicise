import type { SessionController } from '../session/controller';
import type { SessionState } from '../session/machine';
import type { SettingsStore } from '../settings/storage';
import type { Settings } from '../settings/schema';
import type { DailyStats } from '../session/daily';
import type { DebugStore } from '../debug/store';

export interface AppContext {
  controller: SessionController;
  settingsStore: SettingsStore;
  daily: DailyStats;
  debug: DebugStore;
  /** Starts a session from the setup screen (called from the Start button's click). */
  startSession(settings: Settings): void;
}

export interface Screen {
  el: HTMLElement;
  /** Called on every session state change while this screen is mounted. */
  update?(s: SessionState | null): void;
  /** Releases timers, camera, listeners. */
  destroy?(): void;
  /** Element to focus when the screen mounts. */
  initialFocus?: HTMLElement;
  /** Full-screen blocking overlay (break screens). */
  overlay?: boolean;
}
