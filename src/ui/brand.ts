/**
 * relaxicise brand: a lowercase wordmark where the "x" (the point where relaxation meets
 * exercise) is set in coral, and a geometric mark of two offset half-discs: two phases of
 * one rhythm, focus and movement, slightly out of step.
 */
import { h } from './dom';

export const MARK_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" class="mark-svg">
  <path d="M15 4a11 11 0 0 0 0 22z" class="mark-a"/>
  <path d="M17 8a11 11 0 0 1 0 22z" class="mark-b"/>
</svg>`;

export function brandMark(size = 32): HTMLElement {
  const el = h('span', { class: 'mark', style: `width:${size}px;height:${size}px` });
  el.innerHTML = MARK_SVG;
  return el;
}

/** The wordmark as text, so it stays crisp and readable: "rela" + coral "x" + "icise". */
export function wordmark(): HTMLElement {
  return h('span', { class: 'wordmark', 'aria-label': 'relaxicise' }, h('span', { 'aria-hidden': 'true' }, 'rela', h('span', { class: 'wm-x' }, 'x'), 'icise'));
}

export function brandLockup(size = 32): HTMLElement {
  return h('span', { class: 'brand' }, brandMark(size), wordmark());
}
