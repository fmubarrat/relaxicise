/**
 * Flat line illustrations: a stick figure in the start and end position of each exercise,
 * drawn in the accent colour (currentColor). Coordinates are in a 60 x 90 box.
 */
import type { ExerciseId } from '../exercises/types';

type P = [number, number];

interface Fig {
  head: P;
  neck: P;
  hip: P;
  /** Shoulders default to the neck point (side views). */
  shL?: P;
  shR?: P;
  elL: P;
  haL: P;
  elR: P;
  haR: P;
  knL: P;
  ftL: P;
  knR: P;
  ftR: P;
  chair?: boolean;
  /** Extra marks (arrows, motion arcs) as SVG path data. */
  marks?: string;
}

// Front view, standing, arms down.
const FRONT: Fig = {
  head: [30, 13], neck: [30, 23], hip: [30, 49], shL: [23, 25], shR: [37, 25],
  elL: [21, 37], haL: [20, 48], elR: [39, 37], haR: [40, 48],
  knL: [26, 66], ftL: [25, 84], knR: [34, 66], ftR: [35, 84],
};

// Side view, standing, facing right.
const SIDE: Fig = {
  head: [30, 13], neck: [30, 23], hip: [30, 49],
  elL: [31, 36], haL: [32, 47], elR: [31, 36], haR: [32, 47],
  knL: [31, 66], ftL: [30, 84], knR: [31, 66], ftR: [30, 84],
};

const fig = (base: Fig, over: Partial<Fig>): Fig => ({ ...base, ...over });

const POSES: Record<ExerciseId, [Fig, Fig]> = {
  squats: [
    SIDE,
    fig(SIDE, {
      head: [36, 30], neck: [33, 39], hip: [20, 60],
      elL: [43, 40], haL: [53, 40], elR: [43, 40], haR: [53, 40],
      knL: [38, 64], ftL: [32, 84], knR: [38, 64], ftR: [32, 84],
    }),
  ],
  armRaises: [
    FRONT,
    fig(FRONT, { elL: [21, 13], haL: [22, 2], elR: [39, 13], haR: [38, 2] }),
  ],
  jumpingJacks: [
    FRONT,
    fig(FRONT, {
      elL: [16, 14], haL: [12, 4], elR: [44, 14], haR: [48, 4],
      knL: [21, 66], ftL: [15, 84], knR: [39, 66], ftR: [45, 84],
    }),
  ],
  highKnees: [
    fig(FRONT, { elL: [20, 35], haL: [25, 30], elR: [40, 35], haR: [35, 30] }),
    fig(FRONT, {
      elL: [20, 35], haL: [25, 30], elR: [40, 35], haR: [35, 30],
      knR: [36, 47], ftR: [37, 64], marks: 'M44 62 L44 50 M41 53 L44 50 L47 53',
    }),
  ],
  lunges: [
    SIDE,
    fig(SIDE, {
      head: [30, 22], neck: [30, 32], hip: [30, 57],
      elL: [31, 44], haL: [32, 55], elR: [31, 44], haR: [32, 55],
      knL: [43, 64], ftL: [44, 84], knR: [22, 76], ftR: [11, 82],
    }),
  ],
  sideBends: [
    FRONT,
    fig(FRONT, {
      head: [21, 17], neck: [24, 26], shL: [18, 30], shR: [31, 24],
      elL: [17, 41], haL: [17, 51], elR: [31, 12], haR: [21, 6],
    }),
  ],
  torsoTwists: [
    fig(FRONT, { elL: [19, 33], haL: [27, 30], elR: [41, 33], haR: [33, 30] }),
    fig(FRONT, {
      shL: [26, 25], shR: [34, 25], elL: [17, 29], haL: [8, 30], elR: [26, 32], haR: [15, 31],
      marks: 'M40 18 Q46 25 40 32 M38 29 L40 32 L43 30',
    }),
  ],
  shrugs: [
    FRONT,
    fig(FRONT, {
      shL: [23, 19], shR: [37, 19], elL: [21, 32], haL: [20, 43], elR: [39, 32], haR: [40, 43],
      marks: 'M16 26 L16 18 M13 21 L16 18 L19 21 M44 26 L44 18 M41 21 L44 18 L47 21',
    }),
  ],
  armCircles: [
    fig(FRONT, { elL: [14, 25], haL: [5, 25], elR: [46, 25], haR: [55, 25] }),
    fig(FRONT, {
      elL: [14, 22], haL: [6, 17], elR: [46, 22], haR: [54, 17],
      marks: 'M6 17 A6 6 0 1 0 6.1 17 M54 17 A6 6 0 1 1 53.9 17',
    }),
  ],
  kneeToElbow: [
    fig(FRONT, { elL: [15, 18], haL: [26, 12], elR: [45, 18], haR: [34, 12] }),
    fig(FRONT, {
      head: [32, 16], neck: [31, 26], shL: [24, 28], shR: [38, 26],
      elL: [27, 42], haL: [27, 15], elR: [46, 20], haR: [35, 14],
      knR: [28, 47], ftR: [35, 64],
    }),
  ],
  chairStands: [
    fig(SIDE, {
      head: [27, 24], neck: [27, 34], hip: [22, 57],
      elL: [33, 42], haL: [30, 36], elR: [33, 42], haR: [30, 36],
      knL: [39, 57], ftL: [39, 84], knR: [39, 57], ftR: [39, 84], chair: true,
    }),
    fig(SIDE, {
      head: [33, 13], neck: [33, 23], hip: [32, 49],
      elL: [39, 31], haL: [36, 25], elR: [39, 31], haR: [36, 25],
      knL: [33, 66], ftL: [34, 84], knR: [33, 66], ftR: [34, 84], chair: true,
    }),
  ],
  forwardFold: [
    SIDE,
    fig(SIDE, {
      head: [43, 66], neck: [41, 57], hip: [28, 47],
      elL: [44, 69], haL: [43, 79], elR: [44, 69], haR: [43, 79],
      knL: [30, 66], ftL: [30, 84], knR: [30, 66], ftR: [30, 84],
    }),
  ],
};

const pt = (p: P) => `${p[0]} ${p[1]}`;
const line = (...ps: P[]) => `M${ps.map(pt).join(' L')}`;

function draw(f: Fig, label: string): string {
  const shL = f.shL ?? f.neck;
  const shR = f.shR ?? f.neck;
  const torso = [line(f.neck, f.hip), line(shL, shR)].join(' ');
  const limbs = [line(shL, f.elL, f.haL), line(shR, f.elR, f.haR), line(f.hip, f.knL, f.ftL), line(f.hip, f.knR, f.ftR)].join(' ');
  const chair = f.chair ? '<path class="fig-prop" d="M10 60 L30 60 M12 60 L12 85 M28 60 L28 85 M10 60 L10 34"/>' : '';
  const marks = f.marks ? `<path class="fig-mark" d="${f.marks}"/>` : '';
  return `<svg viewBox="0 0 60 90" role="img" aria-label="${label}" class="fig">
  <line class="fig-prop" x1="2" y1="86" x2="58" y2="86"/>
  ${chair}
  <path class="fig-limbs" d="${limbs}"/>
  <path class="fig-torso" d="${torso}"/>
  <circle class="fig-head" cx="${f.head[0]}" cy="${f.head[1]}" r="6.2"/>
  ${marks}
</svg>`;
}

export function illustration(id: ExerciseId, name: string): { start: string; end: string } {
  const [a, b] = POSES[id];
  return { start: draw(a, `${name}: start position`), end: draw(b, `${name}: end position`) };
}

// ---- Animated demo -----------------------------------------------------------------------

const JOINTS = ['head', 'neck', 'hip', 'shL', 'shR', 'elL', 'haL', 'elR', 'haR', 'knL', 'ftL', 'knR', 'ftR'] as const;
type Joint = (typeof JOINTS)[number];

/** Side-view drawings: alternating sides swap legs instead of mirroring left/right. */
const SIDE_VIEW = new Set<ExerciseId>(['squats', 'lunges', 'chairStands', 'forwardFold']);
const ALTERNATING = new Set<ExerciseId>(['highKnees', 'lunges', 'sideBends', 'torsoTwists', 'kneeToElbow']);

function full(f: Fig): Record<Joint, P> {
  return { ...f, shL: f.shL ?? f.neck, shR: f.shR ?? f.neck } as Record<Joint, P>;
}

/** The end pose for the other side: mirrored (front view) or legs swapped (side view). */
function otherSide(id: ExerciseId, f: Fig): Fig {
  if (SIDE_VIEW.has(id)) return { ...f, knL: f.knR, ftL: f.ftR, knR: f.knL, ftR: f.ftL };
  const m = (p: P): P => [60 - p[0], p[1]];
  const out: Fig = { ...f, marks: undefined };
  for (const j of JOINTS) {
    const v = (f as unknown as Record<string, P | undefined>)[j];
    if (v) (out as unknown as Record<string, P>)[j] = m(v);
  }
  return out;
}

function lerpFig(a: Fig, b: Fig, t: number): Fig {
  const A = full(a);
  const B = full(b);
  const out = { chair: a.chair || b.chair } as Fig;
  for (const j of JOINTS) {
    (out as unknown as Record<string, P>)[j] = [A[j][0] + (B[j][0] - A[j][0]) * t, A[j][1] + (B[j][1] - A[j][1]) * t];
  }
  if (t > 0.92) out.marks = b.marks;
  return out;
}

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);

/**
 * A looping demo: start -> end -> start, about 2.6 s per rep. Alternating exercises show the
 * other side on every second rep. With reduced motion it switches between the still poses.
 */
export function createDemo(id: ExerciseId, name: string, reducedMotion: boolean): { el: HTMLElement; destroy(): void } {
  const el = document.createElement('div');
  el.className = 'demo';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${name}: animated demonstration`);
  const [start, end] = POSES[id];
  const ends = ALTERNATING.has(id) ? [end, otherSide(id, end)] : [end];
  const CYCLE = 2600;
  let raf = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const t0 = performance.now();

  const render = (f: Fig) => {
    el.innerHTML = draw(f, '').replace('role="img" aria-label=""', 'aria-hidden="true"');
  };

  if (reducedMotion) {
    let i = 0;
    const frames = [start, ...ends.flatMap((e) => [e, start])].slice(0, -1);
    render(frames[0]);
    timer = setInterval(() => render(frames[++i % frames.length]), 1400);
  } else {
    const loop = (now: number) => {
      const elapsed = Math.max(0, now - t0); // the first rAF timestamp can predate t0
      const rep = Math.floor(elapsed / CYCLE);
      const x = (elapsed % CYCLE) / CYCLE;
      // 0-0.1 hold start, 0.1-0.45 move, 0.45-0.6 hold end, 0.6-0.95 return, 0.95-1 hold.
      const t = x < 0.1 ? 0 : x < 0.45 ? ease((x - 0.1) / 0.35) : x < 0.6 ? 1 : x < 0.95 ? 1 - ease((x - 0.6) / 0.35) : 0;
      render(lerpFig(start, ends[rep % ends.length], t));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return {
    el,
    destroy() {
      cancelAnimationFrame(raf);
      if (timer) clearInterval(timer);
    },
  };
}
