/** State shared between the ?debug=1 panel and the screens. Inert when debug mode is off. */
import { isExerciseId, type ExerciseId } from '../exercises/types';

const FAST_KEY = 'recess.debug.fastTimers';

export interface LiveReadout {
  exercise?: string;
  stage?: string;
  signal?: number | null;
  counterState?: string;
  reps?: string;
  fps?: number;
  visible?: boolean;
  camera?: string;
}

type Listener = (event: 'rep' | 'change') => void;

export class DebugStore {
  readonly enabled: boolean;
  fastTimers = false;
  forceExercise: ExerciseId | null = null;
  live: LiveReadout = {};
  private readonly listeners = new Set<Listener>();

  constructor(search: string, private readonly storage: Storage | null) {
    this.enabled = new URLSearchParams(search).get('debug') === '1';
    if (this.enabled) {
      try {
        this.fastTimers = storage?.getItem(FAST_KEY) === '1';
      } catch {
        // ignore
      }
    }
  }

  /** Time scale for new sessions: fast timers make minutes behave as seconds. */
  get timeScale(): number {
    return this.enabled && this.fastTimers ? 1 / 60 : 1;
  }

  setFastTimers(on: boolean): void {
    this.fastTimers = on;
    try {
      this.storage?.setItem(FAST_KEY, on ? '1' : '0');
    } catch {
      // ignore
    }
    this.emit('change');
  }

  setForceExercise(id: string | null): void {
    this.forceExercise = isExerciseId(id) ? id : null;
    this.emit('change');
  }

  setLive(patch: LiveReadout): void {
    if (!this.enabled) return;
    Object.assign(this.live, patch);
    this.emit('change');
  }

  simulateRep(): void {
    if (this.enabled) this.emit('rep');
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: 'rep' | 'change'): void {
    for (const fn of this.listeners) fn(e);
  }
}
