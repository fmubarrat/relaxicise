/**
 * Draws the tracked pose over the (mirrored) camera frame so the user can see what is tracked.
 * Bones are light lines; joints the current exercise needs are filled in the accent colour,
 * or drawn as hollow warning rings when they are not visible enough.
 */
import type { Landmark } from '../exercises/types';
import { SKELETON } from '../exercises/landmarks';

const FACE = new Set([1, 2, 3, 4, 5, 6, 9, 10, 17, 18, 19, 20, 21, 22]);

/**
 * @param videoW/videoH the video's intrinsic size. The video is shown with object-fit: cover, so
 *   it may be cropped to fill the frame; landmarks are mapped through the same crop to line up.
 */
export function drawPose(
  canvas: HTMLCanvasElement,
  pose: readonly Landmark[] | null,
  required: readonly number[],
  minVisibility: number,
  videoW = 0,
  videoH = 0,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!pose) return;

  const style = getComputedStyle(canvas);
  const accent = style.getPropertyValue('--track-ok').trim() || '#7fd49b';
  const warn = style.getPropertyValue('--track-warn').trim() || '#f2a65a';
  const bone = 'rgba(255,255,255,0.85)';
  const req = new Set(required);
  // Only draw what the camera can actually see. MediaPipe also *guesses* joints outside the picture
  // (e.g. hands raised above a laptop webcam); drawing those produced bent, floating arms.
  const M = 0.01;
  const seen = (l: Landmark) => (l.visibility ?? 1) >= 0.5 && l.x >= -M && l.x <= 1 + M && l.y >= -M && l.y <= 1 + M;
  const vw = videoW || w;
  const vh = videoH || h;
  const scale = Math.max(w / vw, h / vh);
  const ox = (w - vw * scale) / 2;
  const oy = (h - vh * scale) / 2;
  const P = (l: Landmark) => [ox + l.x * vw * scale, oy + l.y * vh * scale] as const;

  ctx.lineCap = 'round';
  // Bones: dark halo first so they read on any background, then the light line.
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.35)' : bone;
    ctx.lineWidth = pass === 0 ? 6 : 3;
    for (const [a, b] of SKELETON) {
      if (!seen(pose[a]) || !seen(pose[b])) continue;
      const [x1, y1] = P(pose[a]);
      const [x2, y2] = P(pose[b]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  // Joints.
  pose.forEach((l, i) => {
    if (FACE.has(i)) return;
    const [x, y] = P(l);
    const isReq = req.has(i);
    const ok = (l.visibility ?? 1) >= minVisibility && l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1;
    // Off-screen guesses are not drawn at all (no fake joints, no warning rings outside the picture).
    if (l.x < -M || l.x > 1 + M || l.y < -M || l.y > 1 + M) return;
    if (!isReq) {
      if (!seen(l)) return;
      ctx.fillStyle = bone;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    if (ok) {
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.strokeStyle = warn;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}
