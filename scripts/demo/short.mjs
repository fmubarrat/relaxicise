#!/usr/bin/env node
/**
 * A ~30 s vertical (4:5, 1080x1350) social video for LinkedIn / Reels / Shorts, built to hook in
 * the first seconds: it OPENS on the person exercising with live pose tracking and a bold line,
 * then tells the story (problem -> app -> recovery -> try it), with voice-over and music.
 *
 *   npm run demo:short                          # uses demo/character.mp4 as the webcam
 *   npm run demo:short -- --exercise armRaises --out demo/relaxicise-short.mp4
 *
 * The app is recorded in one natural pass (focus, break, reps, recovery), each moment is marked,
 * and the footage is re-ordered so the exercise comes first. Needs FFmpeg and `npm run dev`.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { synthesize, DEFAULT_VOICE } from './voice.mjs';
import { mixUnderVoice, renderMusic } from './music.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const URL = opt('url', 'http://localhost:5173');
const CLIP = opt('clip', 'demo/character.mp4');
const EXERCISE = opt('exercise', 'armRaises');
const OUT = resolve(opt('out', 'demo/relaxicise-short.mp4'));
const VOICE = opt('voice', DEFAULT_VOICE);
const HOOK = opt('hook', "My laptop won't let me skip breaks.");
// Page is laid out at 540x675 CSS px (the app's phone layout) and rendered at 2x -> 1080x1350.
const CW = 540;
const CH = 675;
const VW = CW * 2;
const VH = CH * 2;

const SCRIPT = [
  { id: 'hook', text: "My laptop won't let me skip breaks anymore." },
  { id: 'problem', text: 'Break reminders? We just click them away.' },
  { id: 'focus', text: 'So I built relaxicise. You focus,' },
  { id: 'move', text: "and when it's time, you move. Your webcam counts every rep, right in your browser." },
  { id: 'rest', text: 'Then breathe, and get back to work.' },
  { id: 'end', text: "It's free, with no signup. Try it at relaxicise dot vercel dot app." },
];

// ---------------------------------------------------------------- tools
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

if (!existsSync(CLIP)) throw new Error(`Clip not found: ${CLIP} (the short opens on the exercising person, so it needs a clip)`);
const voice = await synthesize(SCRIPT, { voice: VOICE, cacheDir: resolve('demo/.voice-cache'), ffprobe: FFPROBE });
const vlen = (id) => voice.get(id).seconds;

const work = join(tmpdir(), `relaxicise-short-${Date.now()}`);
mkdirSync(work, { recursive: true });
const fakeCam = join(work, 'camera.y4m');
console.log('[short] preparing the webcam feed ...');
ff('-i', CLIP, '-t', '40', '-vf', 'scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p', fakeCam);

// ---------------------------------------------------------------- browser
// Chrome's new headless mode: off-screen (any size, no window on your screen) and still GPU
// accelerated, so pose tracking runs in real time. The app runs in a 540x675 iframe scaled 2x,
// so it uses its phone layout but is drawn and recorded at a crisp 1080x1350.
const browser = await chromium.launch({
  headless: false,
  ignoreDefaultArgs: ['--enable-automation'],
  args: [
    '--headless=new',
    '--use-angle=d3d11',
    '--enable-gpu',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${fakeCam}`,
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    // Headless Chrome still reserves window-frame space; ask for it on top of the page size
    // (corrected below if this machine's frame differs).
    `--window-size=${VW + 16},${VH + 95}`,
  ],
});
const context = await browser.newContext({
  viewport: null, // the page is exactly the window's inner size (no emulation, captured in full)
  colorScheme: 'light',
  permissions: ['camera'],
  recordVideo: { dir: work, size: { width: VW, height: VH } },
});
const page = await context.newPage();
{
  // Make the page exactly VW x VH: measure, then resize the window by the difference.
  const [iw, ih] = await page.evaluate(() => [innerWidth, innerHeight]);
  if (iw !== VW || ih !== VH) {
    const cdp = await context.newCDPSession(page);
    const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: bounds.width + VW - iw, height: bounds.height + VH - ih } });
    await page.waitForTimeout(300);
  }
  const [fw, fh] = await page.evaluate(() => [innerWidth, innerHeight]);
  if (fw !== VW || fh !== VH) console.warn(`[short] page is ${fw}x${fh}, expected ${VW}x${VH}`);
}
const t0 = Date.now();
const at = () => (Date.now() - t0) / 1000;
const sleep = (ms) => page.waitForTimeout(ms);
let app = null; // the app's frame (set after load)
const phase = () => app.evaluate(() => JSON.parse(localStorage.getItem('recess.session.v1') ?? 'null')?.phase ?? 'IDLE');
const click = (name) => app.getByRole('button', { name, exact: true }).first().click();
const seg = {}; // id -> [start, end] in the raw recording

const CSS = `
  .debug-panel, .debug-only { display: none !important; }
  html { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }
  /* Promo framing of the break screen: big camera, no secondary controls. */
  .overlay.is-active .overlay-head, .overlay.is-active .steps, .overlay.is-active .overlay-controls,
  .overlay.is-active .overlay-inner > .quiet-note, .overlay.is-active .side-hint { display: none !important; }
  .overlay.is-active .camera-frame { height: 300px !important; max-height: none !important; aspect-ratio: auto !important; border-radius: 14px; }
  .overlay.is-active .overlay-inner { padding-top: 12px !important; }
  body.hooking .overlay.is-active .overlay-inner { padding-top: 112px !important; }
  #s-hook { position: fixed; left: 0; right: 0; top: 0; z-index: 9999; padding: 18px 20px 16px; background: #6554d9; color: #fff;
    font: 750 31px/1.08 'Bricolage Grotesque Variable', sans-serif; letter-spacing: -0.03em; text-align: center;
    transform: translateY(-100%); transition: transform 260ms ease-out; }
  #s-hook.on { transform: none; }
  #s-cap { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 9999; width: calc(100% - 32px);
    padding: 10px 14px; border-radius: 12px; background: rgba(32,32,39,.94); color: #fff; text-align: center;
    font: 650 19px/1.3 'Inter Variable', Inter, sans-serif; opacity: 0; transition: opacity 200ms; }
  #s-cap b { color: #ffb4a8; }
  #s-layer { position: fixed; inset: 0; z-index: 10000; display: grid; place-content: center; justify-items: center; gap: 18px;
    padding: 28px; text-align: center; background: #19191f; color: #f2f0f7; font-family: 'Inter Variable', Inter, sans-serif; }
  #s-layer.violet { background: #6554d9; color: #fff; }
  .s-big { font: 750 44px/1.05 'Bricolage Grotesque Variable', sans-serif; letter-spacing: -0.035em; }
  .s-sub { font-size: 20px; color: #aaa8b8; }
  #s-layer.violet .s-sub { color: rgba(255,255,255,.92); }
  .s-url { font: 700 26px 'Inter Variable', Inter, sans-serif; padding: 12px 18px; border-radius: 12px; background: #fff; color: #6554d9; }
  .s-wm { font: 750 58px/1 'Bricolage Grotesque Variable', sans-serif; letter-spacing: -0.04em; } .s-wm span { color: #ffc2b8; }
  .s-toast { width: 420px; display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; text-align: left;
    padding: 16px 18px; border-radius: 14px; background: #24242d; border: 1px solid #34343f; transition: all 450ms ease; }
  .s-toast b { display: block; font-size: 18px; } .s-toast small { color: #aaa8b8; font-size: 14px; }
  .s-toast button { font: 650 15px Inter, sans-serif; padding: 8px 12px; border-radius: 8px; border: 1px solid #4b4a58; background: #4b4a58; color: #fff; }
  .s-toast.gone { transform: translateX(120px); opacity: 0; }
  .s-mark { width: 84px; height: 84px; }
  /* Frame tag: a thin colour-coded strip at the bottom edge, cropped off in the edit. */
  #s-code { position: fixed; left: 0; right: 0; bottom: 0; height: 4px; z-index: 2147483647; background: #000; }
`;
const MARK = `<svg viewBox="0 0 32 32" class="s-mark"><path d="M15 4a11 11 0 0 0 0 22z" fill="#fff"/><path d="M17 8a11 11 0 0 1 0 22z" fill="#ff8a78"/></svg>`;
async function prepare() {
  await app.addStyleTag({ content: CSS });
  await app.evaluate(() => {
    if (!document.getElementById('s-cap')) {
      const c = document.createElement('div');
      c.id = 's-cap';
      document.body.appendChild(c);
    }
    if (!document.getElementById('s-code')) {
      const k = document.createElement('div');
      k.id = 's-code';
      document.body.appendChild(k);
    }
  });
}
const caption = (html) =>
  app.evaluate((h) => {
    const c = document.getElementById('s-cap');
    if (c) {
      c.innerHTML = h;
      c.style.opacity = h ? '1' : '0';
    }
  }, html);
const layer = (html, cls = '') =>
  app.evaluate(
    ({ html, cls }) => {
      document.getElementById('s-layer')?.remove();
      const l = document.createElement('div');
      l.id = 's-layer';
      l.className = cls;
      l.innerHTML = html;
      document.body.appendChild(l);
    },
    { html, cls },
  );
const removeLayer = () => app.evaluate(() => document.getElementById('s-layer')?.remove());

/**
 * Frame tags: each section paints a unique colour in a thin strip along the bottom edge, in the
 * same frame as its content. The edit reads the strip colour of every frame and cuts exactly where
 * it changes, so timing jitter in the recording cannot misplace a cut.
 */
const CODES = { hook: [255, 0, 0], problem: [0, 255, 0], focus: [0, 0, 255], intro: [255, 255, 0], move: [0, 255, 255], rest: [255, 0, 255], end: [255, 255, 255] };
async function tag(id) {
  await app.evaluate((rgb) => {
    const k = document.getElementById('s-code');
    if (k) k.style.background = rgb ? `rgb(${rgb.join(',')})` : '#000';
  }, id ? CODES[id] : null);
}

// ---------------------------------------------------------------- record in natural order
console.log('[short] recording off-screen ...');
// The wrapper is served from the app's own origin (generated here, never part of the app), so the
// iframe is same-origin and can use storage.
const WRAP = `${URL}/__relaxicise_demo_frame__`;
await page.route(WRAP, (route) =>
  route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body style="margin:0;overflow:hidden;background:#f7f5f2">
  <iframe id="app" src="${URL}/?debug=1" allow="camera; autoplay; fullscreen"
    style="border:0;width:${CW}px;height:${CH}px;transform:scale(2);transform-origin:0 0"></iframe></body></html>`,
  }),
);
await page.goto(WRAP);
const appFrame = async () => {
  for (let i = 0; i < 100; i++) {
    const f = page.frames().find((fr) => fr !== page.mainFrame() && fr.url().startsWith(URL));
    if (f) {
      await f.waitForLoadState('load');
      return f;
    }
    await sleep(100);
  }
  throw new Error('app frame did not load');
};
app = await appFrame();
await app.evaluate((exercise) => {
  localStorage.clear();
  localStorage.setItem('recess.debug.fastTimers', '0');
  localStorage.setItem(
    'recess.settings.v1',
    JSON.stringify({ workHours: 4, focusMinutes: 30, breakMinutes: 3, repsPerExercise: 3, exercisesPerBreak: 1, enabledExercises: [exercise], enabledRest: ['breathing'], warningEnabled: false, theme: 'light', musicEnabled: false }),
  );
}, EXERCISE);
await app.goto(`${URL}/?debug=1`);
await app.waitForLoadState('load');
await prepare();
await app.evaluate(() => {
  void import('/src/pose/landmarkers.ts').then((m) => m.loadPoseLandmarker()).catch(() => undefined);
});

await sleep(800);

// Problem: a break reminder, dismissed in one click.
await layer(`<div class="s-big">Break reminders?</div>
  <div class="s-toast"><div><b>Time for a break</b><small>Stand up and stretch</small></div><button>Dismiss</button></div>
  <div class="s-sub">One click, and they're gone.</div>`);
await sleep(300);
await tag('problem');
seg.problem = [at()];
await sleep(1100);
await app.evaluate(() => document.querySelector('.s-toast')?.classList.add('gone'));
await sleep(Math.max(3600, vlen('problem') * 1000 + 500) - 1100);
seg.problem.push(at());
await tag(null);
await removeLayer();

// Focus ring.
await click('Start session');
await sleep(500);
await caption('So I built <b>relaxicise</b>. You focus…');
await sleep(300); // let each change paint before marking a section
await tag('focus');
seg.focus = [at()];
await sleep(Math.max(2600, vlen('focus') * 1000 + 350));
seg.focus.push(at());
await tag(null);
await caption('');

// Break intro, then the camera.
await click('Start a break');
await sleep(300);
await prepare();
await caption('…and when it\'s time, you move.');
await sleep(300);
await tag('intro');
seg.intro = [at()];
await sleep(1500);
seg.intro.push(at());
await tag(null);
await caption('');
await click('Start camera');
await app.locator('.active-grid').waitFor({ state: 'visible', timeout: 120_000 });
await prepare();
await sleep(400);

// HOOK: bold line over live tracking (this part opens the final video).
await app.evaluate((text) => {
  document.body.classList.add('hooking');
  const h = document.createElement('div');
  h.id = 's-hook';
  h.textContent = text;
  document.body.appendChild(h);
  requestAnimationFrame(() => requestAnimationFrame(() => h.classList.add('on')));
}, HOOK);
await sleep(450); // banner fully in: the very first frame of the video must show the hook
await tag('hook');
seg.hook = [at()];
await sleep(Math.max(3300, vlen('hook') * 1000 + 450));
seg.hook.push(at());
await tag(null);
await app.evaluate(() => {
  document.getElementById('s-hook')?.remove();
  document.body.classList.remove('hooking');
});
await caption('Your webcam counts every rep. <b>Right in your browser.</b>');
await sleep(350);
await tag('move');
seg.move = [at()];
let simulated = false;
let last = '';
let lastChange = Date.now();
while ((await phase()) === 'BREAK_EXERCISE' && at() - seg.move[0] < 60) {
  const reps = (await app.locator('.rep-now').textContent().catch(() => '')) ?? '';
  if (reps !== last) {
    last = reps;
    lastChange = Date.now();
  }
  if (!simulated && Date.now() - lastChange > 12_000) {
    simulated = true;
    console.warn('[short] no reps detected for 12 s; simulating the rest.');
  }
  if (simulated) await app.locator('body').press('r');
  // End the section the moment the last rep lands (before the app moves on to recovery).
  const target = ((await app.locator('.rep-target').textContent().catch(() => '')) ?? '').replace(/\D/g, '');
  if (target && reps.replace(/\D/g, '') === target) break;
  await sleep(simulated ? 650 : 120);
}
await sleep(450); // hold briefly on the full count
seg.move.push(at());
await tag(null);
while ((await phase()) === 'BREAK_EXERCISE') await sleep(100);
if (!simulated) console.log('[short] reps counted by real pose tracking.');

// Recovery.
await sleep(500);
await prepare();
await caption('Then breathe. Back to work.');
await sleep(800); // well past the screen fade-in
await tag('rest');
seg.rest = [at()];
await sleep(Math.max(3000, vlen('rest') * 1000 + 400));
seg.rest.push(at());
await tag(null);
await caption('');

// End card.
await layer(`${MARK}<div class="s-wm">rela<span>x</span>icise</div><div class="s-sub">Free. No signup. Runs in your browser.</div><div class="s-url">relaxicise.vercel.app</div>`, 'violet');
await sleep(300);
await tag('end');
seg.end = [at()];
await sleep(Math.max(3600, vlen('end') * 1000 + 500));
seg.end.push(at());
await tag(null);
await removeLayer();

const video = page.video();
await context.close();
await browser.close();
const webm = await video.path();

// ---------------------------------------------------------------- find each section by its frame tag
const frameRange = {}; // id -> [firstFrame, lastFrame] at 30 fps
{
  const strip = execFileSync(FFMPEG, ['-loglevel', 'error', '-i', webm, '-vf', `fps=30,crop=iw:4:0:ih-5,scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
  const n = strip.length / 3;
  const ids = Object.keys(CODES);
  const runs = {};
  let cur = null;
  let runStart = 0;
  const classify = (i) => {
    const c = [strip[i * 3], strip[i * 3 + 1], strip[i * 3 + 2]];
    let best = null;
    let bestD = 90; // must be close to a code colour; anything else (black, mixed) is "no section"
    for (const id of ids) {
      const d = Math.abs(c[0] - CODES[id][0]) + Math.abs(c[1] - CODES[id][1]) + Math.abs(c[2] - CODES[id][2]);
      if (d < bestD) [best, bestD] = [id, d];
    }
    return best;
  };
  for (let i = 0; i <= n; i++) {
    const id = i < n ? classify(i) : null;
    if (id !== cur) {
      if (cur) {
        const len = i - runStart;
        if (!runs[cur] || len > runs[cur][1] - runs[cur][0] + 1) runs[cur] = [runStart, i - 1];
      }
      cur = id;
      runStart = i;
    }
  }
  for (const id of ids) {
    if (!runs[id]) throw new Error(`section "${id}" not found in the recording`);
    // Drop one frame at each edge so no transitional frame slips in.
    // Skip a few frames at the start (and one at the end) so no transitional frame slips in.
    frameRange[id] = [runs[id][0] + 4, runs[id][1] - 1];
  }
}

// ---------------------------------------------------------------- edit: hook first
const ORDER = ['hook', 'problem', 'focus', 'intro', 'move', 'rest', 'end'];
// Each line starts at the beginning of its segment ("move" narration starts on the break intro).
const VO_AT = { hook: 'hook', problem: 'problem', focus: 'focus', move: 'intro', rest: 'rest', end: 'end' };
let tl = 0;
const startOf = {};
// Section lengths follow the narration (headless recording stretches idle scenes, so recorded
// length is not reliable). The exercise keeps its real length so every rep is shown.
const TARGET = {
  hook: Math.max(3.2, vlen('hook') + 0.45),
  problem: Math.max(3.2, vlen('problem') + 0.5),
  focus: Math.max(2.6, vlen('focus') + 0.35),
  intro: 1.4,
  move: Infinity,
  rest: Math.max(2.8, vlen('rest') + 0.45),
  end: Math.max(3.6, vlen('end') + 0.6),
};
const native = (id) => (frameRange[id][1] - frameRange[id][0] + 1) / 30;
const dur = (id) => (TARGET[id] === Infinity ? native(id) : TARGET[id]);
for (const id of ORDER) {
  startOf[id] = tl;
  tl += dur(id);
}
const total = tl;
console.log(`[short] editing ${ORDER.map((id) => `${id} ${dur(id).toFixed(1)}s`).join(', ')} = ${total.toFixed(1)} s (cut on frame tags)`);

// Crop the 8 px frame-tag strip off the bottom and scale back to full size (0.6%, invisible).
const crop = `,crop=${VW}:${VH - 8}:0:0,scale=${VW}:${VH}`;
const split = `[0:v]fps=30,split=${ORDER.length}${ORDER.map((_, i) => `[s${i}]`).join('')}`;
const parts = ORDER.map((id, i) => {
  const [a, b] = frameRange[id];
  const want = Math.round(dur(id) * 30);
  const have = b - a + 1;
  const end = a + Math.min(have, want);
  // Too short: hold the last frame for the remainder.
  const pad = want > have ? `,tpad=stop_mode=clone:stop=${want - have}` : '';
  return `[s${i}]trim=start_frame=${a}:end_frame=${end},setpts=PTS-STARTPTS${pad}${crop}[v${i}]`;
});
const silent = join(work, 'silent.mp4');
ff('-i', webm, '-filter_complex', `${split};${parts.join(';')};${ORDER.map((_, i) => `[v${i}]`).join('')}concat=n=${ORDER.length}:v=1:a=0[v]`, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30', silent);

// Voice-over on the new timeline.
const inputs = [];
const chains = [];
const labels = [];
for (const { id } of SCRIPT) {
  inputs.push('-i', voice.get(id).file);
  const idx = inputs.length / 2;
  const ms = Math.round((startOf[VO_AT[id]] + (id === 'hook' ? 0.15 : 0.1)) * 1000);
  chains.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=1.5[a${idx}]`);
  labels.push(`[a${idx}]`);
}
const voiced = join(work, 'voiced.mp4');
ff('-i', silent, ...inputs, '-filter_complex', `${chains.join(';')};${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,apad,atrim=0:${total.toFixed(3)},alimiter=limit=0.95[vo]`, '-map', '0:v', '-map', '[vo]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', voiced);

// Music: beat from the first second (no slow intro in a short), ducked under the voice.
console.log('[short] composing music ...');
const wav = join(work, 'music.wav');
await renderMusic(total, wav, { dropAt: 0, seed: 11 });
mkdirSync(dirname(OUT), { recursive: true });
mixUnderVoice(FFMPEG, voiced, wav, OUT, { level: 0.6 });
rmSync(work, { recursive: true, force: true });
console.log(`[short] done: ${OUT}`);
