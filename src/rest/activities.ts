export const REST_IDS = ['eyeFocus', 'eyesClosed', 'breathing', 'water'] as const;
export type RestId = (typeof REST_IDS)[number];

export function isRestId(v: unknown): v is RestId {
  return typeof v === 'string' && (REST_IDS as readonly string[]).includes(v);
}

export interface RestActivity {
  id: RestId;
  name: string;
  description: string;
  /** Length of one round in seconds; rounds repeat until the break ends. Null = runs for the whole rest. */
  roundSeconds: number | null;
  /** Uses the camera (only eyes-closed, and only when verification is on). */
  mayUseCamera: boolean;
}

export const REST_ACTIVITIES: readonly RestActivity[] = [
  {
    id: 'eyeFocus',
    name: 'Eye focus (20-20-20)',
    description: 'Look at something at least 20 feet (6 m) away for 20 seconds.',
    roundSeconds: 20,
    mayUseCamera: false,
  },
  {
    id: 'eyesClosed',
    name: 'Eyes closed',
    description: 'Close your eyes and let them rest for 25 seconds.',
    roundSeconds: 25,
    mayUseCamera: true,
  },
  {
    id: 'breathing',
    name: 'Breathing',
    description: 'Slow, paced breathing until the break ends.',
    roundSeconds: null,
    mayUseCamera: false,
  },
  {
    id: 'water',
    name: 'Water',
    description: 'Get a glass of water.',
    roundSeconds: null,
    mayUseCamera: false,
  },
];

export function getRest(id: RestId): RestActivity {
  const r = REST_ACTIVITIES.find((a) => a.id === id);
  if (!r) throw new Error(`Unknown rest activity: ${id}`);
  return r;
}

/** One rest activity per break, rotating through the enabled list in a fixed order. */
export function pickRest(enabled: readonly RestId[], breakIndex: number): RestId | null {
  const ordered = REST_IDS.filter((id) => enabled.includes(id));
  if (ordered.length === 0) return null;
  return ordered[((breakIndex % ordered.length) + ordered.length) % ordered.length];
}
