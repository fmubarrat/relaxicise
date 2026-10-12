/**
 * requestAnimationFrame loop over a playing <video>. Runs `onFrame` once per new video frame
 * and reports a smoothed frames-per-second figure for the debug panel.
 */
export interface FrameLoop {
  stop(): void;
  readonly fps: number;
}

export function runFrameLoop(video: HTMLVideoElement, onFrame: (t: number) => void): FrameLoop {
  let raf = 0;
  let stopped = false;
  let lastVideoTime = -1;
  let lastT = 0;
  let fps = 0;

  const loop = () => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    const t = performance.now();
    if (lastT) fps = fps * 0.9 + (1000 / Math.max(1, t - lastT)) * 0.1;
    lastT = t;
    onFrame(t);
  };
  raf = requestAnimationFrame(loop);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
    get fps() {
      return fps;
    },
  };
}
