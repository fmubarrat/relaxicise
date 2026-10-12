import '@fontsource-variable/inter';
import '@fontsource-variable/bricolage-grotesque';
import './styles.css';
import { SessionController, systemClock } from './session/controller';
import { LocalSessionStore } from './session/storage';
import { DailyStats } from './session/daily';
import { SettingsStore } from './settings/storage';
import { DebugStore } from './debug/store';
import { mountDebugPanel } from './debug/panel';
import { App } from './ui/app';
import type { AppContext } from './ui/context';
import { requestNotificationPermission, unlockAudio } from './ui/alerts';
import { loadPoseLandmarker } from './pose/landmarkers';
import { toggleFullscreen } from './ui/fullscreen';
import { applyTheme } from './ui/theme';

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const memory = new Map<string, string>();
const kv = safeStorage() ?? {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
};

const debug = new DebugStore(location.search, safeStorage());
const controller = new SessionController(systemClock, new LocalSessionStore(kv), Math.random, () => debug.forceExercise);
const settingsStore = new SettingsStore(kv);

const ctx: AppContext = {
  controller,
  settingsStore,
  daily: new DailyStats(kv),
  debug,
  startSession(settings) {
    // Inside the Start click: allowed to unlock audio and ask for notifications (FR-1.5).
    unlockAudio();
    void requestNotificationPermission();
    controller.start(settings, debug.timeScale);
    setTimeout(() => app.syncBell(controller.current, settings.chime), 100);
    // Warm the pose model in the background so the first break starts quickly.
    // This only fetches the app's own files; the camera is not touched.
    setTimeout(() => void loadPoseLandmarker().catch(() => undefined), 1500);
  },
};

applyTheme(settingsStore.load().theme);
const app = new App(document.getElementById('app')!, ctx);
controller.tick(); // catch up after a refresh or a long absence
app.render();
controller.startTicking();
mountDebugPanel(ctx);

// After a refresh, re-arm sound on the first interaction (browsers block audio until then).
const rearm = () => {
  unlockAudio();
  app.syncMusic();
  // Audio may only now be running: schedule the focus-over bell.
  setTimeout(() => app.syncBell(controller.current, settingsStore.load().chime), 50);
};
window.addEventListener('pointerdown', rearm, { once: true });
window.addEventListener('keydown', rearm, { once: true });

// "F" toggles full screen (ignored while typing).
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
  if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) toggleFullscreen();
});
