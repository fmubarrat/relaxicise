/** "Breaks completed today", kept across sessions in local storage. */
import type { KeyValueStore } from '../settings/storage';

const KEY = 'recess.daily.v1';

function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export class DailyStats {
  constructor(private readonly store: KeyValueStore) {}

  breaksToday(now: Date): number {
    try {
      const raw = this.store.getItem(KEY);
      const o = raw ? (JSON.parse(raw) as { day?: string; breaks?: number }) : null;
      return o && o.day === dayKey(now) && typeof o.breaks === 'number' ? o.breaks : 0;
    } catch {
      return 0;
    }
  }

  addBreak(now: Date): void {
    try {
      this.store.setItem(KEY, JSON.stringify({ day: dayKey(now), breaks: this.breaksToday(now) + 1 }));
    } catch {
      // ignore
    }
  }
}
