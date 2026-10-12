#!/usr/bin/env node
/**
 * Records a narrated product video of relaxicise by driving the real app in Chromium:
 * an animated intro about the problem, then a captioned tour of the app, an end card, and a
 * voice-over (Kokoro, generated locally). Scene lengths follow the narration.
 *
 *   npm run demo:video                                  # tour (camera step is a labelled placeholder)
 *   npm run demo:video -- --clip demo/character.mp4 --exercise armRaises
 *                                                       # a person video is used as the webcam, so
 *                                                       # pose tracking and rep counting are real
 * Options:
 *   --url <url>         app URL (default http://localhost:5173; run `npm run dev` first)
 *   --clip <file>       video of a person exercising (default demo/character.mp4 if present)
 *   --exercise <id>     what the clip shows (default armRaises; see src/exercises/types.ts)
 *   --out <file>        output (default demo/relaxicise-demo.mp4)
 *   --theme <light|dark>
 *   --voice <name>      Kokoro voice (default af_heart; e.g. am_michael, bf_emma)
 *   --no-voice          silent video, captions only
 *   --no-music          no background music (by default an original generated track is mixed in,
 *                       soft under the intro, the beat drops at "Meet relaxicise", ducked under the voice)
 *   --headless          no visible browser window (smoother tracking needs the window + GPU)
 *   --width/--height    video size (default 1280x720; must fit on your screen with the window chrome)
 *
 * Needs FFmpeg (winget install --id Gyan.FFmpeg -e).
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { synthesize, DEFAULT_VOICE } from './voice.mjs';
import { mixUnderVoice, renderMusic } from './music.mjs';

// ---------------------------------------------------------------- options
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const URL = opt('url', 'http://localhost:5173');
const CLIP = opt('clip', existsSync('demo/character.mp4') ? 'demo/character.mp4' : null);
const EXERCISE = opt('exercise', 'armRaises');
const OUT = resolve(opt('out', 'demo/relaxicise-demo.mp4'));
const THEME = opt('theme', 'light');
const VOICE = opt('voice', DEFAULT_VOICE);
const NARRATE = !flag('no-voice');
const MUSIC = !flag('no-music');
const HEADLESS = flag('headless');
// 1280x720 (HD): fits a visible window on common laptop screens (the GPU needs a visible window).
const W = Number(opt('width', 1280));
const H = Number(opt('height', 720));

// ---------------------------------------------------------------- the script
// No statistics or health claims (see BRD): only what people recognise, and what the app does.
const SCRIPT = [
  { id: 'intro1', text: 'Long days at a screen. Hours, without moving.' },
  { id: 'intro2', text: 'Stiff shoulders. Tired eyes. And the stress quietly builds up.' },
  { id: 'intro3', text: 'Break reminders pop up, and we click them away. The break never happens.' },
  { id: 'intro4', text: 'Meet relaxicise. Where relaxation meets exercise.' },
  { id: 'plan', text: 'Plan your day in focus blocks, with a short break after each one.' },
  { id: 'exercises', text: 'Pick moves that suit your space. Office mode keeps you in your chair.' },
  { id: 'settings', text: 'Calm music, heart-rate caution, light or dark. And everything stays on your device.' },
  { id: 'focus', text: 'While you work, a simple ring counts down. The camera stays off.' },
  { id: 'break', text: "When it's time, relaxicise takes over the screen, for a couple of quick exercises." },
  { id: 'move', text: 'Just copy the move. Pose tracking counts every rep, right in your browser. No video ever leaves your computer.' },
  { id: 'recover', text: 'Then recover, with paced breathing, eye rest, or a glass of water.' },
  { id: 'theme', text: 'Light or dark. Your call.' },
  { id: 'summary', text: 'And at the end of the day, see your rhythm.' },
  { id: 'outro', text: 'relaxicise. Work with focus. Move with intention. Return refreshed.' },
];
const LINE = Object.fromEntries(SCRIPT.map((l) => [l.id, l.text]));

// ---------------------------------------------------------------- ffmpeg
function findTool(name) {
  const env = process.env[name.toUpperCase()];
  if (env && existsSync(env)) return env;
  try {
    execFileSync(name, ['-version'], { stdio: 'ignore' });
    return name;
  } catch {
    const base = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages');
    const stack = existsSync(base) ? [base] : [];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (entry.toLowerCase() === `${name}.exe`) return p;
        try {
          if (statSync(p).isDirectory() && /ffmpeg|bin|build/i.test(p)) stack.push(p);
        } catch {
          // ignore
        }
      }
    }
  }
  throw new Error(`${name} not found. Install FFmpeg with: winget install --id Gyan.FFmpeg -e`);
}
const FFMPEG = findTool('ffmpeg');
const FFPROBE = findTool('ffprobe');
const ff = (...a) => execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });

// ---------------------------------------------------------------- voice
const voice = NARRATE ? await synthesize(SCRIPT, { voice: VOICE, cacheDir: resolve('demo/.voice-cache'), ffprobe: FFPROBE }) : new Map();

// ---------------------------------------------------------------- fake camera from the clip
const work = join(tmpdir(), `relaxicise-demo-${Date.now()}`);
mkdirSync(work, { recursive: true });
let fakeCam = null;
if (CLIP) {
  if (!existsSync(CLIP)) throw new Error(`Clip not found: ${CLIP}`);
  fakeCam = join(work, 'camera.y4m');
  console.log(`[demo] converting ${CLIP} into a widescreen webcam feed ...`);
  // 16:9 like most webcams, so the app shows no black bars. Padded (never cropped) if the clip differs.
  ff('-i', CLIP, '-t', '40', '-vf', 'scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p', fakeCam);
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch({
  headless: HEADLESS,
  // Hides the "controlled by automated test software" bar, which steals height from the page.
  ignoreDefaultArgs: ['--enable-automation'],
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    ...(fakeCam ? [`--use-file-for-fake-video-capture=${fakeCam}`] : []),
    '--autoplay-policy=no-user-gesture-required',
    // Use the real GPU so pose tracking runs in real time (smooth skeleton, no lag).
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    `--window-size=${W + 16},${H + 140}`,
    '--window-position=0,0',
  ],
});
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  colorScheme: THEME === 'dark' ? 'dark' : 'light',
  permissions: ['camera'],
  recordVideo: { dir: work, size: { width: W, height: H } },
});
const page = await context.newPage();
const videoStart = Date.now();
const at = () => (Date.now() - videoStart) / 1000;
const cuts = []; // [from, to] seconds removed from the final video
const spoken = []; // { id, t } narration start times
const sleep = (ms) => page.waitForTimeout(ms);
const phase = () => page.evaluate(() => JSON.parse(localStorage.getItem('recess.session.v1') ?? 'null')?.phase ?? 'IDLE');
const click = (role, name) => page.getByRole(role, { name, exact: true }).first().click();

// Demo-only layers (captions, intro, end card), injected on top of the real app.
const DEMO_CSS = `
  .debug-panel { display: none !important; }
  /* Debug-only controls never appear in the video. */
  .debug-only { display: none !important; }
  html { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }
  #demo-caption { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 9999;
    padding: 12px 22px; border-radius: 10px; background: rgba(32,32,39,.94); color: #fff;
    font: 600 20px/1.35 'Inter Variable', Inter, system-ui, sans-serif; letter-spacing: -0.01em;
    max-width: 78%; text-align: center; transition: opacity 250ms ease; }
  #demo-caption.top { bottom: auto; top: 84px; }
  #demo-layer { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center;
    background: #19191f; color: #f2f0f7; font-family: 'Inter Variable', Inter, sans-serif; overflow: hidden;
    transition: opacity 500ms ease; }
  #demo-layer .scene { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center;
    gap: 26px; text-align: center; opacity: 0; transition: opacity 500ms ease; }
  #demo-layer .scene.on { opacity: 1; }
  .big { font: 750 76px/1.05 'Bricolage Grotesque Variable', sans-serif; letter-spacing: -0.035em; max-width: 15ch; }
  .sub { font-size: 26px; color: #aaa8b8; }
  .words span { display: inline-block; opacity: 0; transform: translateY(14px); transition: all 600ms ease; margin: 0 .18em; }
  .scene.on .words span { opacity: 1; transform: none; }
  .day { width: 560px; display: grid; gap: 10px; }
  .day-track { height: 18px; border-radius: 9px; background: #2c2944; overflow: hidden; }
  .day-fill { height: 100%; width: 0; background: #9284f4; transition: width 3.2s cubic-bezier(.4,0,.2,1); }
  .scene.on .day-fill { width: 100%; }
  .day-axis { display: flex; justify-content: space-between; color: #aaa8b8; font-size: 18px; font-variant-numeric: tabular-nums; }
  .toast-wrap { position: relative; }
  .toast { width: 470px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; text-align: left;
    padding: 18px 20px; border-radius: 12px; background: #24242d; border: 1px solid #34343f;
    transform: translateY(-40px); opacity: 0; transition: all 500ms ease; }
  .scene.on .toast { transform: none; opacity: 1; }
  .scene.on .toast.gone { transform: translateX(80px); opacity: 0; }
  .toast b { display: block; font-size: 19px; } .toast small { color: #aaa8b8; font-size: 15px; }
  .toast .bell { width: 44px; height: 44px; border-radius: 10px; background: #2c2944; }
  .toast button { font: 600 15px Inter, sans-serif; padding: 9px 14px; border-radius: 8px; border: 1px solid #4b4a58; background: transparent; color: #f2f0f7; }
  .toast button.press { background: #4b4a58; }
  .cursor { position: absolute; left: 0; top: 0; width: 22px; height: 22px; border-radius: 50%; background: #fff;
    box-shadow: 0 0 0 5px rgba(255,255,255,.22); transition: transform 900ms cubic-bezier(.4,0,.2,1); }
  .mark-xl { width: 120px; height: 120px; transform: scale(.6); opacity: 0; transition: all 700ms cubic-bezier(.2,.8,.2,1); }
  .scene.on .mark-xl { transform: none; opacity: 1; }
  .wm { font: 750 96px/1 'Bricolage Grotesque Variable', sans-serif; letter-spacing: -0.04em; }
  .wm span { color: #ff8a78; }
  #demo-layer.violet { background: #6554d9; color: #fff; }
  #demo-layer.violet .sub { color: rgba(255,255,255,.9); }
  #demo-layer.violet .wm span { color: #ffc2b8; }
  #demo-layer.violet .mark-xl path:first-child { fill: #fff; }
`;
const MARK = `<svg viewBox="0 0 32 32" class="mark-xl"><path d="M15 4a11 11 0 0 0 0 22z" fill="#9284f4"/><path d="M17 8a11 11 0 0 1 0 22z" fill="#ff8a78"/></svg>`;

async function prepare() {
  await page.addStyleTag({ content: DEMO_CSS });
  await page.evaluate(() => {
    if (!document.getElementById('demo-caption')) {
      const c = document.createElement('div');
      c.id = 'demo-caption';
      c.style.opacity = '0';
      document.body.appendChild(c);
    }
    const ph = document.querySelector('.camera-placeholder');
    if (ph) ph.textContent = 'Your camera appears here. Reps are counted on your device.';
  });
}

async function showCaption(text, pos = 'bottom') {
  await page.evaluate(
    ({ text, pos }) => {
      const c = document.getElementById('demo-caption');
      if (!c) return;
      c.textContent = text;
      c.classList.toggle('top', pos === 'top');
      c.style.opacity = '1';
    },
    { text, pos },
  );
}
const hideCaption = () => page.evaluate(() => document.getElementById('demo-caption')?.style.setProperty('opacity', '0'));
const lineMs = (id) => (voice.has(id) ? voice.get(id).seconds * 1000 + 450 : Math.max(2600, LINE[id].length * 55));

/** Shows the line as a caption, starts its narration, and waits for it (at least `minMs`). */
async function say(id, { minMs = 0, pos = 'bottom', caption = true } = {}) {
  spoken.push({ id, t: at() });
  if (caption) await showCaption(LINE[id], pos);
  await sleep(Math.max(lineMs(id), minMs));
}

/** Full-screen intro/outro layer with one scene. */
async function scene(html, cls = '') {
  await page.evaluate(
    ({ html, cls }) => {
      let layer = document.getElementById('demo-layer');
      if (!layer) {
        layer = document.createElement('div');
        layer.id = 'demo-layer';
        document.body.appendChild(layer);
      }
      layer.className = cls;
      layer.style.opacity = '1';
      layer.querySelectorAll('.scene').forEach((s) => s.classList.remove('on'));
      const s = document.createElement('div');
      s.className = 'scene';
      s.innerHTML = html;
      layer.appendChild(s);
      requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('on')));
    },
    { html, cls },
  );
}
async function removeLayer() {
  await page.evaluate(() => {
    const l = document.getElementById('demo-layer');
    if (l) l.style.opacity = '0';
  });
  await sleep(550);
  await page.evaluate(() => document.getElementById('demo-layer')?.remove());
}

// ---------------------------------------------------------------- setup
console.log(`[demo] recording ${CLIP ? `with character clip (${EXERCISE})` : 'tour (no character clip)'}${NARRATE ? `, voice ${VOICE}` : ''} ...`);
await page.goto(`${URL}/?debug=1`);
await page.evaluate(
  ({ exercise, clip, theme }) => {
    localStorage.clear();
    localStorage.setItem('recess.debug.fastTimers', '0');
    localStorage.setItem(
      'recess.settings.v1',
      JSON.stringify({
        workHours: 4,
        focusMinutes: 30,
        breakMinutes: 3,
        repsPerExercise: clip ? 4 : 5,
        exercisesPerBreak: clip ? 1 : 2,
        enabledExercises: clip ? [exercise] : ['armRaises', 'shrugs', 'squats', 'sideBends'],
        enabledRest: ['breathing'],
        warningEnabled: false,
        theme,
        musicEnabled: false,
      }),
    );
  },
  { exercise: EXERCISE, clip: !!CLIP, theme: THEME },
);
await page.reload();
await prepare();
if (CLIP) {
  // Load the pose model in the background now, so the camera step is ready when we get there.
  await page.evaluate(() => {
    void import('/src/pose/landmarkers.ts').then((m) => m.loadPoseLandmarker()).catch(() => undefined);
  });
}

// ---------------------------------------------------------------- 1. intro: the problem
await scene(`<div class="big">Long days at a screen.</div>
  <div class="day"><div class="day-track"><div class="day-fill"></div></div>
  <div class="day-axis"><span>9 AM</span><span>12 PM</span><span>3 PM</span><span>6 PM</span></div></div>`);
// Start the video on the intro: cut the page-loading frames before it.
cuts.push([0, Math.max(0.05, at() - 0.05)]);
await say('intro1', { caption: false, minMs: 3400 });

await scene(`<div class="big words"><span>Stiff</span><span>shoulders.</span></div>
  <div class="big words"><span>Tired</span><span>eyes.</span></div>
  <div class="sub words"><span>And</span><span>the</span><span>stress</span><span>quietly</span><span>builds</span><span>up.</span></div>`);
await page.evaluate(() => {
  // Stagger the words for a typographic build.
  document.querySelectorAll('#demo-layer .scene:last-child .words span').forEach((s, i) => (s.style.transitionDelay = `${i * 260}ms`));
});
await say('intro2', { caption: false });

await scene(`<div class="toast-wrap"><div class="toast"><div class="bell"></div><div><b>Time for a break</b><small>Stand up and stretch</small></div><button>Dismiss</button></div>
  <div class="cursor" style="transform: translate(300px, 220px)"></div></div>
  <div class="sub" style="margin-top: 20px">The break never happens.</div>`);
spoken.push({ id: 'intro3', t: at() });
await sleep(900);
await page.evaluate(() => {
  // The cursor moves to Dismiss, clicks, and the reminder slides away.
  const s = document.querySelector('#demo-layer .scene:last-child');
  const btn = s.querySelector('button').getBoundingClientRect();
  const wrap = s.querySelector('.toast-wrap').getBoundingClientRect();
  s.querySelector('.cursor').style.transform = `translate(${btn.left - wrap.left + btn.width / 2 - 11}px, ${btn.top - wrap.top + btn.height / 2 - 11}px)`;
  setTimeout(() => s.querySelector('button').classList.add('press'), 950);
  setTimeout(() => s.querySelector('.toast').classList.add('gone'), 1250);
});
await sleep(Math.max(3600, lineMs('intro3') - 900));

await scene(`${MARK}<div class="wm">rela<span>x</span>icise</div><div class="sub">Relaxation meets exercise.</div>`);
await say('intro4', { caption: false });
await removeLayer();

// ---------------------------------------------------------------- 2. the app
await say('plan', { minMs: 3200 });
await click('button', 'Exercises');
await say('exercises', { minMs: 3200 });
await click('button', 'Settings');
await page.getByText('Sound', { exact: true }).scrollIntoViewIfNeeded();
await say('settings', { minMs: 3400 });
await page.evaluate(() => window.scrollTo(0, 0));
await click('button', 'Today');
await sleep(400);
await click('button', 'Start session');
await sleep(400);
await say('focus', { minMs: 3600 });

await click('button', 'Start a break');
await sleep(500);
await prepare();
await say('break', { minMs: 3000 });
await hideCaption();
if (CLIP) await click('button', 'Start camera');
// The debug "No camera" button is hidden in recordings, so trigger it directly.
else await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('No camera'))?.click());
const cameraClickedAt = at();
if (CLIP) {
  await page.locator('.active-grid').waitFor({ state: 'visible', timeout: 120_000 }).catch(() => undefined);
  const liveAt = at();
  if (liveAt - cameraClickedAt > 1.5) cuts.push([cameraClickedAt + 0.8, liveAt - 0.1]);
}
await prepare();
const moveStarted = at();
// Narrate over the exercise; reps continue while the line plays.
spoken.push({ id: 'move', t: at() });
await showCaption(LINE.move);

if (CLIP) {
  let lastReps = '';
  let lastChange = Date.now();
  let simulated = false;
  const fpsSamples = [];
  while ((await phase()) === 'BREAK_EXERCISE' && at() - moveStarted < 120) {
    const reps = (await page.locator('.rep-now').textContent().catch(() => '')) ?? '';
    const fps = await page.evaluate(() => Number(/fps\s+([\d.]+)/.exec(document.querySelector('.debug-readout')?.textContent ?? '')?.[1] ?? 0));
    if (fps) fpsSamples.push(fps);
    if (reps !== lastReps) {
      lastReps = reps;
      lastChange = Date.now();
    }
    if (!simulated && Date.now() - lastChange > 12_000) {
      simulated = true;
      console.warn('[demo] no reps detected for 12 s. Check the clip: front-facing, body in frame, good light. Simulating the rest.');
    }
    if (simulated) await page.keyboard.press('r');
    await sleep(simulated ? 650 : 400);
  }
  const avg = fpsSamples.length ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : 0;
  console.log(`[demo] pose tracking ran at ~${avg.toFixed(0)} fps${avg && avg < 12 ? ' (low: a visible window on a PC with a GPU gives a smooth skeleton)' : ''}`);
  if (!simulated) console.log('[demo] all reps were counted by real pose tracking.');
} else {
  await sleep(1200);
  while ((await phase()) === 'BREAK_EXERCISE') {
    await page.keyboard.press('r');
    await sleep(700);
  }
}
// Let the narration over the exercise finish before moving on.
const moveLeft = (voice.get('move')?.seconds ?? 0) - (at() - moveStarted);
if (moveLeft > 0) await sleep(moveLeft * 1000 + 300);

await sleep(400);
await prepare();
await say('recover', { pos: 'top', minMs: 5200 });
if ((await phase()) === 'BREAK_REST') await click('button', 'Skip rest');
await sleep(500);
await prepare();
await page.getByRole('button', { name: /Switch to dark mode|Switch to light mode/ }).first().click();
await say('theme', { minMs: 2600 });
await click('button', 'End session');
await click('button', 'End');
await sleep(500);
await prepare();
await say('summary', { minMs: 3400 });
await hideCaption();

// ---------------------------------------------------------------- 3. end card
const endCardAt = at() + 1.2;
await scene(`${MARK}<div class="wm">rela<span>x</span>icise</div><div class="sub">Work with focus. Move with intention. Return refreshed.</div>`, 'violet');
await say('outro', { caption: false, minMs: 3600 });
await sleep(600);

const video = page.video();
await context.close();
await browser.close();
const webm = await video.path();

// ---------------------------------------------------------------- export
mkdirSync(dirname(OUT), { recursive: true });
const silent = join(work, 'silent.mp4');
// A visible window that is a few pixels short leaves a flat grey band in the recording: measure
// the content area on the last frame (the end card is a solid colour) and crop to it.
let crop = '';
try {
  // Decode one frame from the end card (solid violet), by timestamp: the raw WebM has no seek index.
  const raw = execFileSync(FFMPEG, ['-loglevel', 'error', '-i', webm, '-ss', endCardAt.toFixed(2), '-frames:v', '1', '-s', `${W}x${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
  const px = (x, y) => raw.subarray((y * W + x) * 3, (y * W + x) * 3 + 3);
  const same = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 12;
  const card = px(Math.floor(W / 2), 20);
  let h = H;
  while (h > H * 0.9 && !same(px(Math.floor(W / 2), h - 1), card)) h--;
  let w = W;
  while (w > W * 0.9 && !same(px(w - 1, 20), card)) w--;
  if (h < H || w < W) {
    crop = `,crop=${w - (w % 2)}:${h - (h % 2)}:0:0,scale=${W}:${H}`;
    console.log(`[demo] cropping a ${W - w}x${H - h} px band from the window edge`);
  }
} catch (e) {
  console.warn('[demo] could not measure the frame edge; keeping the full frame.', e.message);
}
const select = cuts.length ? `,select='not(${cuts.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+')})',setpts=N/30/TB` : '';
if (cuts.length) console.log(`[demo] trimming ${cuts.map(([a, b]) => `${(b - a).toFixed(1)} s`).join(', ')} of camera start-up`);
console.log('[demo] encoding video ...');
ff('-i', webm, '-vf', `fps=30${select}${crop}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', silent);

/** Where a recording timestamp lands in the trimmed video. */
const mapTime = (t) => t - cuts.filter(([, b]) => b <= t).reduce((sum, [a, b]) => sum + (b - a), 0);

if (voice.size) {
  console.log('[demo] mixing the voice-over ...');
  const inputs = [];
  const chains = [];
  const labels = [];
  for (const { id, t } of spoken) {
    const v = voice.get(id);
    if (!v) continue;
    inputs.push('-i', v.file);
    const idx = inputs.length / 2; // input 0 is the video
    const ms = Math.max(0, Math.round(mapTime(t) * 1000));
    chains.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=1.5[a${idx}]`);
    labels.push(`[a${idx}]`);
  }
  const filter = `${chains.join(';')};${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95[vo]`;
  const voiced = MUSIC ? join(work, 'voiced.mp4') : OUT;
  ff('-i', silent, ...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[vo]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', voiced);
  if (MUSIC) {
    const reveal = spoken.find((x) => x.id === 'intro4');
    const dropAt = reveal ? mapTime(reveal.t) : 15;
    const seconds = Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', voiced]).toString().trim());
    console.log(`[demo] composing background music (beat drops at ${dropAt.toFixed(1)} s) ...`);
    const wav = join(work, 'music.wav');
    await renderMusic(seconds, wav, { dropAt });
    mixUnderVoice(FFMPEG, voiced, wav, OUT);
  }
} else {
  ff('-i', silent, '-c', 'copy', '-movflags', '+faststart', OUT);
}
rmSync(work, { recursive: true, force: true });
console.log(`[demo] done: ${OUT}`);
