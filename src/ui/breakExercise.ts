/**
 * Break overlay, exercise phase. Explains the camera, then for each planned exercise:
 * illustration, "get in position" check, live rep counting with the tracked pose drawn over
 * the camera. The camera stream lives only as long as this screen: destroy() releases it.
 */
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { FEATURES } from '../config/features';
import { getExercise, targetReps } from '../exercises/configs';
import { ExerciseTracker, type TrackerFrame } from '../exercises/tracker';
import type { Landmark } from '../exercises/types';
import { CameraError, startCamera, stopCamera } from '../pose/camera';
import { runFrameLoop, type FrameLoop } from '../pose/frameLoop';
import { loadPoseLandmarker } from '../pose/landmarkers';
import { drawPose } from '../pose/overlay';
import type { SessionState } from '../session/machine';
import { canCancelBreak, postponesLeft } from '../session/machine';
import type { AppContext, Screen } from './context';
import { h, prefersReducedMotion, setText, svg, trapFocus } from './dom';
import { clock, duration } from './format';
import { icon } from './icons';
import { createDemo, illustration } from './illustrations';
import { createPostponeControl } from './postpone';
import { createHeartWidget, createMusicToggle, createNextTrackButton } from './widgets';
import { createFullscreenButton } from './fullscreen';
import { getRest } from '../rest/activities';

type Mode = 'intro' | 'starting' | 'error' | 'active';
type Tone = 'ok' | 'warn' | 'idle';

export function createBreakExerciseScreen(ctx: AppContext): Screen {
  const { controller, debug } = ctx;

  let mode: Mode = 'intro';
  let destroyed = false;
  let stream: MediaStream | null = null;
  let loop: FrameLoop | null = null;
  let landmarker: PoseLandmarker | null = null;
  let noCamera = false; // debug: continue without a camera, reps by key press
  let tracker: ExerciseTracker | null = null;
  let trackerKey = '';
  let finishing = false;
  let finishTimer: ReturnType<typeof setTimeout> | null = null;
  let lastStage = '';

  // ---- Header ----------------------------------------------------------------------------
  const meta = h('p', { class: 'overlay-meta' });
  const breakLeft = h('span', { class: 'tabular' });
  const heart = createHeartWidget(ctx.settingsStore);
  const steps = h('div', { class: 'steps', 'aria-hidden': 'true' });
  // "Back": undoes a break you started early; otherwise it is an honest snooze/postpone.
  const backLabel = h('span', null);
  let backAction: () => string | null = () => null;
  const backBtn = h('button', { type: 'button', class: 'btn btn-quiet back-btn', onclick: () => say(backAction()) }, icon('arrowLeft', 18), backLabel);

  const head = h(
    'header',
    { class: 'overlay-head' },
    h('div', { class: 'head-title' }, backBtn, h('div', null, h('h1', { id: 'break-title', class: 'overlay-title' }, 'Time to move'), meta)),
    h(
      'div',
      { class: 'head-actions' },
      heart.chip,
      h('p', { class: 'time-chip' }, icon('clock', 16), h('span', { class: 'visually-hidden' }, 'Break time left '), breakLeft),
      createMusicToggle(ctx.settingsStore),
      createNextTrackButton(ctx.settingsStore),
      createFullscreenButton(true),
    ),
  );
  const cardioNote = h('p', { class: 'cardio-note', hidden: true }, icon('heartPulse', 18), 'Keep it light. You should still be able to talk.');

  // ---- Intro -----------------------------------------------------------------------------
  const planCards = h('div', { class: 'plan-cards' });
  const cameraBtn = h('button', { type: 'button', class: 'btn btn-primary btn-xl', onclick: () => void beginCamera() }, icon('camera', 20), 'Start camera');
  const intro = h(
    'section',
    { class: 'intro' },
    planCards,
    h('div', { class: 'start-row' }, cameraBtn, debug.enabled ? h('button', { type: 'button', class: 'btn debug-only', onclick: () => continueWithoutCamera() }, 'No camera (debug)') : null),
    h('p', { class: 'quiet-note' }, icon('lock', 16), 'Counts reps on this device. Nothing is recorded or sent.'),
  );

  // ---- Starting / error ------------------------------------------------------------------
  const starting = h('section', { class: 'starting', hidden: true }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { role: 'status' }, 'Starting camera…'));
  const errorText = h('p', { class: 'error-text' });
  const retryBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => void beginCamera() }, icon('repeat', 18), 'Try again');
  const errorBox = h(
    'section',
    { class: 'error-box', role: 'alert', hidden: true },
    h('div', { class: 'error-title' }, icon('camera', 22), errorText),
    h(
      'div',
      { class: 'button-row' },
      retryBtn,
      FEATURES.manualConfirmFallback ? h('button', { type: 'button', class: 'btn', onclick: () => controller.completeExercise(tracker?.target ?? 0) }, 'I did the reps') : null,
    ),
  );

  // ---- Active ----------------------------------------------------------------------------
  const exName = h('h2', { class: 'exercise-name' });
  const instructions = h('p', { class: 'instructions' });
  // Looping demo of the movement: visible the whole time, so the user can copy it.
  const demoSlot = h('div', { class: 'demo-slot' });
  let demo: { el: HTMLElement; destroy(): void } | null = null;
  const demoCard = h('figure', { class: 'demo-card' }, demoSlot, h('figcaption', null, h('span', { class: 'demo-tag' }, icon('play', 12), 'Copy this'), instructions));
  const holdBar = h('span', { class: 'bar-fill' });
  const positionBlock = h(
    'div',
    { class: 'position-block' },
    h('div', { class: 'hold' }, h('span', { class: 'hold-label' }, 'Get in frame and hold still to start'), h('div', { class: 'bar thin', 'aria-hidden': 'true' }, holdBar)),
  );

  const repNow = h('span', { class: 'rep-now' });
  const repTarget = h('span', { class: 'rep-target' });
  const repBar = h('span', { class: 'bar-fill' });
  const repProgress = h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-label': 'Reps' }, repBar);
  const sideHint = h('p', { class: 'side-hint' });
  const nextStep = h('p', { class: 'next-step' });
  const countBlock = h('div', { class: 'count-block', hidden: true }, h('p', { class: 'rep-count tabular' }, repNow, repTarget), repProgress, sideHint);
  const announcer = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });

  const video = h('video', { class: 'camera-video', muted: true, playsinline: true, autoplay: true, 'aria-label': 'Your camera, mirrored, with tracked body points' });
  const canvas = h('canvas', { class: 'camera-canvas', 'aria-hidden': 'true' });
  const pillText = h('span', null);
  const pill = h('p', { class: 'track-pill', 'data-tone': 'idle', role: 'status' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), pillText);
  const cameraPlaceholder = h('p', { class: 'camera-placeholder', hidden: true }, 'No camera (debug). Press R to add a rep.');
  const cameraFrame = h('div', { class: 'camera-frame' }, video, canvas, pill, cameraPlaceholder);

  const active = h(
    'section',
    { class: 'active-grid', hidden: true },
    h('div', { class: 'active-left' }, h('div', { class: 'ex-head' }, exName, cardioNote), demoCard, h('div', { class: 'progress-area' }, positionBlock, countBlock, nextStep), announcer),
    cameraFrame,
  );

  // ---- Controls --------------------------------------------------------------------------
  const message = h('p', { class: 'inline-message', role: 'status' });
  const say = (text: string | null) => setText(message, text ?? '');
  const skipBtn = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => say(controller.skipExercise(tracker?.reps ?? 0)) }, icon('skip', 18), 'Skip');
  const swapBtn = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => say(controller.swapExercise()) }, icon('shuffle', 18), 'Swap');
  const snoozeLabel = h('span', null);
  const snoozeBtn = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => say(controller.snooze()) }, icon('alarm', 18), snoozeLabel);
  const postpone = createPostponeControl(ctx, say);

  const controls = h(
    'div',
    { class: 'overlay-controls' },
    h('div', { class: 'button-row' }, skipBtn, swapBtn),
    h('div', { class: 'button-row' }, snoozeBtn, postpone.el),
  );

  const el = h(
    'div',
    { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'break-title' },
    h(
      'div',
      { class: 'overlay-inner' },
      steps,
      head,
      heart.banner,
      intro,
      starting,
      errorBox,
      active,
      message,
      controls,
      h('p', { class: 'quiet-note' }, icon('heart', 16), 'Move gently. Stop if anything hurts.'),
    ),
  );
  const releaseTrap = trapFocus(el);

  // ---- Behaviour -------------------------------------------------------------------------
  function setMode(m: Mode) {
    mode = m;
    intro.hidden = m !== 'intro';
    starting.hidden = m !== 'starting';
    errorBox.hidden = m !== 'error';
    active.hidden = m !== 'active';
    el.classList.toggle('is-active', m === 'active');
    if (m === 'error') retryBtn.focus();
    if (m === 'active') skipBtn.focus();
    renderExercise();
  }

  async function beginCamera() {
    setMode('starting');
    try {
      stream = await startCamera(video);
      if (destroyed) return release();
      try {
        landmarker = await loadPoseLandmarker();
      } catch {
        release();
        throw new Error('The pose model could not be loaded. Reload the page and try again.');
      }
      if (destroyed) return release();
      debug.setLive({ camera: 'on' });
      loop = runFrameLoop(video, onFrame);
      setMode('active');
    } catch (err) {
      release();
      if (destroyed) return;
      setText(errorText, err instanceof CameraError || err instanceof Error ? err.message : 'Something went wrong starting the camera.');
      setMode('error');
    }
  }

  function continueWithoutCamera() {
    noCamera = true;
    video.hidden = true;
    pill.hidden = true;
    cameraPlaceholder.hidden = false;
    setMode('active');
  }

  function release() {
    loop?.stop();
    loop = null;
    if (stream) debug.setLive({ camera: 'off' });
    stopCamera(stream, video);
    stream = null;
  }

  function ensureTracker(s: SessionState) {
    if (!s.brk) return;
    const id = s.brk.exercises[s.brk.current];
    if (!id) return;
    const key = `${s.brk.no}:${s.brk.current}:${id}`;
    if (key === trackerKey) return;
    trackerKey = key;
    finishing = false;
    if (finishTimer) clearTimeout(finishTimer);
    const cfg = getExercise(id);
    tracker = new ExerciseTracker(cfg, targetReps(cfg, s.config.repsPerExercise));
    lastStage = '';
    setText(exName, cfg.name);
    setText(instructions, cfg.instructions);
    cardioNote.hidden = !cfg.cardio;
    demo?.destroy();
    demo = createDemo(cfg.id, cfg.name, prefersReducedMotion());
    demoSlot.replaceChildren(demo.el);
    debug.setLive({ exercise: cfg.name });
    renderExercise();
  }

  function setPill(tone: Tone, text: string) {
    if (pill.dataset.tone !== tone) pill.dataset.tone = tone;
    setText(pillText, text);
  }

  function renderExercise(frame?: TrackerFrame) {
    if (!tracker) return;
    const stage = tracker.stage;
    const reps = tracker.reps;
    const target = tracker.target;
    if (stage !== lastStage) {
      positionBlock.hidden = stage !== 'position';
      countBlock.hidden = stage === 'position';
      lastStage = stage;
    }
    setText(repNow, String(reps).padStart(2, '0'));
    setText(repTarget, ` / ${String(target).padStart(2, '0')}`);
    repBar.style.width = `${(reps / target) * 100}%`;
    const cur = steps.querySelector<HTMLElement>('.step.is-current .step-fill');
    if (cur) cur.style.width = `${(reps / target) * 100}%`;
    repProgress.setAttribute('aria-valuemax', String(target));
    repProgress.setAttribute('aria-valuenow', String(reps));
    setText(sideHint, tracker.cfg.alternating ? 'Alternate sides. Each side counts.' : '');

    if (stage === 'position') {
      holdBar.style.width = `${(frame?.holdProgress ?? 0) * 100}%`;
      if (!frame) setPill('idle', 'Looking for you…');
      else if (frame.message) setPill('warn', frame.message);
      else setPill('ok', 'Pose tracking ready. Hold still');
    } else if (stage === 'counting') {
      if (frame && !frame.visible && frame.message) setPill('warn', `${frame.message}`);
      else setPill('ok', 'Pose tracking on');
    } else {
      setPill('ok', 'Done');
    }

    if (frame?.repCounted || (noCamera && stage !== 'position')) setText(announcer, `${reps} of ${target}`);

    debug.setLive({
      stage,
      reps: `${reps} / ${target}`,
      signal: frame?.signal ?? null,
      counterState: frame?.counterState,
      visible: frame?.visible,
      fps: loop?.fps,
    });

    if (stage === 'done') finish();
  }

  function onFrame(t: number) {
    if (!tracker || !landmarker || finishing) return;
    let pose: Landmark[] | null = null;
    try {
      const result = landmarker.detectForVideo(video, t);
      pose = (result.landmarks?.[0] as Landmark[] | undefined) ?? null;
    } catch {
      pose = null;
    }
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
    const frame = tracker.update(pose, t, aspect);
    drawPose(canvas, pose, tracker.cfg.required, tracker.cfg.thresholds.visibility, video.videoWidth, video.videoHeight);
    renderExercise(frame);
  }

  function finish() {
    if (finishing || !tracker) return;
    finishing = true;
    const reps = tracker.reps;
    // A short pause on the full count before moving on.
    finishTimer = setTimeout(() => {
      if (!destroyed) say(controller.completeExercise(reps));
    }, 700);
  }

  const offDebug = debug.on((e) => {
    if (e !== 'rep' || !tracker || mode !== 'active') return;
    tracker.simulateRep();
    renderExercise();
  });

  function renderMeta() {
    const s = controller.current;
    if (!s?.brk) return;
    const brk = s.brk;
    const total = brk.exercises.length;
    setText(meta, mode === 'intro' ? `Break ${brk.no}` : `Exercise ${Math.min(brk.current + 1, total)} of ${total}`);
    const left = brk.deadline - controller.now();
    setText(breakLeft, left > 0 ? clock(left) : '0:00');
    const nextId = brk.exercises[brk.current + 1];
    if (nextId) setText(nextStep, `Then: ${getExercise(nextId).name.toLowerCase()}`);
    else if (brk.rest && left > s.config.minRestMs) setText(nextStep, `Then: ${duration(left)} ${getRest(brk.rest).name.replace(/ \(.*\)/, '').toLowerCase()}`);
    else setText(nextStep, 'Then: back to focus');

    const key = brk.exercises.join(',') + brk.current;
    if (planCards.dataset.key !== key) {
      planCards.dataset.key = key;
      steps.replaceChildren(
        ...brk.exercises.map((_, i) =>
          h('span', { class: `step${i < brk.current ? ' is-done' : i === brk.current ? ' is-current' : ''}` }, h('span', { class: 'step-fill' })),
        ),
      );
      planCards.replaceChildren(
        ...brk.exercises.map((id, i) => {
          const cfg = getExercise(id);
          const reps = targetReps(cfg, s.config.repsPerExercise);
          return h(
            'div',
            { class: `plan-card${i < brk.current ? ' is-done' : ''}` },
            svg(illustration(cfg.id, cfg.name).end),
            h('span', { class: 'tile-title' }, cfg.name),
            h('span', { class: 'plan-reps tabular' }, i < brk.current ? 'Done' : `× ${reps}`),
          );
        }),
      );
    }

    if (canCancelBreak(s)) {
      setText(backLabel, 'Back to focus');
      backBtn.title = 'You started this break early. Go back with your focus time restored.';
      backAction = () => controller.cancelBreak();
      backBtn.hidden = false;
    } else if (s.config.snoozeEnabled && !brk.snoozeUsed) {
      setText(backLabel, `Back · snooze ${duration(s.config.snoozeMs)}`);
      backBtn.title = 'Uses your snooze for this break (shown in your summary).';
      backAction = () => controller.snooze();
      backBtn.hidden = false;
    } else if (postponesLeft(s) > 0) {
      const ms = 5 * 60_000 * s.config.timeScale;
      setText(backLabel, `Back · postpone ${duration(ms)}`);
      backBtn.title = 'Uses one meeting postpone (shown in your summary).';
      backAction = () => controller.postpone(ms);
      backBtn.hidden = false;
    } else {
      backBtn.hidden = true;
    }
    snoozeBtn.hidden = !s.config.snoozeEnabled;
    snoozeBtn.disabled = brk.snoozeUsed;
    setText(snoozeLabel, brk.snoozeUsed ? 'Snoozed' : `Snooze ${duration(s.config.snoozeMs)}`);
    snoozeBtn.setAttribute('aria-label', brk.snoozeUsed ? 'Snooze already used for this break' : `Snooze ${duration(s.config.snoozeMs)}, once per break`);
    swapBtn.disabled = s.config.exercises.filter((id) => !brk.exercises.includes(id)).length === 0;
    postpone.update();
  }

  const metaTimer = setInterval(renderMeta, 250);

  const update = (s: SessionState | null) => {
    if (!s || s.phase !== 'BREAK_EXERCISE') return;
    ensureTracker(s);
    renderMeta();
  };
  if (controller.current) update(controller.current);
  setMode('intro');

  return {
    el,
    overlay: true,
    initialFocus: cameraBtn,
    update,
    destroy() {
      destroyed = true;
      clearInterval(metaTimer);
      if (finishTimer) clearTimeout(finishTimer);
      offDebug();
      heart.destroy();
      demo?.destroy();
      releaseTrap();
      release();
      debug.setLive({ exercise: undefined, stage: undefined, signal: null, counterState: undefined, reps: undefined, visible: undefined });
    },
  };
}
