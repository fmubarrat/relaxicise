/**
 * An animated eye for the eyes-closed rest. `openness` 1 = wide open, 0 = closed (lid down,
 * lashes showing). The lid eases toward a target each frame; an open eye blinks now and then.
 */
import { prefersReducedMotion } from './dom';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// Geometry (viewBox 200 x 130): corners at (20,65) and (180,65); lower lid fixed.
const LOWER_Y = 112; // control point of the lower lid curve
const OPEN_Y = 8; // control point of the upper lid when fully open
const lid = (y: number) => `M20 65 Q100 ${y} 180 65`;

export function createEye() {
  const reduced = prefersReducedMotion();
  const svg = el('svg', { viewBox: '0 0 200 130', class: 'eye', 'aria-hidden': 'true' });
  const clipId = `eye-clip-${Math.random().toString(36).slice(2)}`;
  const clip = el('clipPath', { id: clipId });
  const clipShape = el('path', { d: '' });
  clip.appendChild(clipShape);
  const defs = el('defs', {});
  defs.appendChild(clip);

  const white = el('path', { class: 'eye-white', d: '' });
  const irisGroup = el('g', { 'clip-path': `url(#${clipId})` });
  irisGroup.append(el('circle', { class: 'eye-iris', cx: '100', cy: '66', r: '27' }), el('circle', { class: 'eye-pupil', cx: '100', cy: '66', r: '11' }), el('circle', { class: 'eye-glint', cx: '108', cy: '58', r: '4' }));
  const upper = el('path', { class: 'eye-lid', d: lid(OPEN_Y) });
  const lower = el('path', { class: 'eye-line', d: `M20 65 Q100 ${LOWER_Y} 180 65` });
  const lashes = el('g', { class: 'eye-lashes' });
  for (const [x1, y1, x2, y2] of [
    [52, 84, 44, 100],
    [76, 90, 72, 108],
    [100, 92, 100, 111],
    [124, 90, 128, 108],
    [148, 84, 156, 100],
  ]) {
    lashes.appendChild(el('path', { d: `M${x1} ${y1} L${x2} ${y2}` }));
  }
  svg.append(defs, white, irisGroup, upper, lower, lashes);

  let openness = 1;
  let target = 1;
  let blinkUntil = 0;
  let nextBlink = performance.now() + 2500;

  const draw = (o: number) => {
    // Upper lid control point slides from OPEN_Y down to the lower lid (closed).
    const y = LOWER_Y - (LOWER_Y - OPEN_Y) * o;
    const shape = `${lid(y)} Q100 ${LOWER_Y} 20 65 Z`.replace(/M20 65 Q100 (\S+) 180 65 Q100/, 'M20 65 Q100 $1 180 65 Q100');
    white.setAttribute('d', shape);
    clipShape.setAttribute('d', shape);
    upper.setAttribute('d', lid(y));
    lashes.style.opacity = String(Math.max(0, 1 - o * 3));
    irisGroup.style.opacity = String(Math.min(1, o * 1.6));
  };
  draw(1);

  return {
    el: svg,
    /** 1 = open, 0 = closed. */
    setTarget(t: number) {
      target = Math.max(0, Math.min(1, t));
    },
    /** Advance the animation; call every frame or tick. */
    tick(now: number) {
      let t = target;
      // Occasional blink while the eye is meant to be open.
      if (!reduced && target > 0.9) {
        if (now >= nextBlink) {
          blinkUntil = now + 180;
          nextBlink = now + 2800 + Math.random() * 2500;
        }
        if (now < blinkUntil) t = 0.05;
      }
      if (reduced) openness = t;
      else openness += (t - openness) * (now < blinkUntil || t < 0.1 ? 0.35 : 0.12);
      svg.classList.toggle('is-closed', openness < 0.15);
      draw(openness);
    },
  };
}
