import type { KeyValueStore } from '../settings/storage';
import type { SessionState } from './machine';

const KEY = 'recess.session.v1';
const PHASES = ['FOCUS', 'WARNING', 'BREAK_EXERCISE', 'BREAK_REST', 'SUMMARY'];

export interface SessionStore {
  load(): SessionState | null;
  save(s: SessionState | null): void;
}

function looksValid(s: unknown): s is SessionState {
  if (!s || typeof s !== 'object') return false;
  const o = s as Partial<SessionState>;
  return o.v === 1 && typeof o.phase === 'string' && PHASES.includes(o.phase) && typeof o.startedAt === 'number' && !!o.config && Array.isArray(o.log);
}

export class LocalSessionStore implements SessionStore {
  constructor(private readonly store: KeyValueStore) {}

  load(): SessionState | null {
    try {
      const raw = this.store.getItem(KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return looksValid(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  save(s: SessionState | null): void {
    try {
      if (s === null) this.store.removeItem(KEY);
      else this.store.setItem(KEY, JSON.stringify(s));
    } catch {
      // Storage blocked: the session still runs, it just will not survive a refresh.
    }
  }
}

export class MemorySessionStore implements SessionStore {
  value: SessionState | null = null;
  load() {
    return this.value === null ? null : (JSON.parse(JSON.stringify(this.value)) as SessionState);
  }
  save(s: SessionState | null) {
    this.value = s === null ? null : (JSON.parse(JSON.stringify(s)) as SessionState);
  }
}
