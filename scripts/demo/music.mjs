#!/usr/bin/env node
/**
 * Background music for the demo video: an original, generated track (no samples, no licences).
 * Rendered offline with the Web Audio API in Chromium, then mixed under the voice-over with
 * ducking (the music dips while the narrator speaks).
 *
 *   node scripts/demo/music.mjs <in.mp4> <out.mp4> [--drop 15.5] [--level 0.55]
 *     Adds music to an existing video (keeps its voice track). --drop = when the beat comes in (s).
 *
 * Used by record.mjs automatically (the beat drops at "Meet relaxicise").
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

/** Runs inside the browser: builds and renders the track with an OfflineAudioContext. Returns a WAV as base64. */
async function renderInPage({ seconds, dropAt, seed }) {
  const SR = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const note = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // Master: gentle compression, overall fade-in and fade-out.
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(1, 1.5);
  master.gain.setValueAtTime(1, Math.max(1.6, seconds - 3.5));
  master.gain.linearRampToValueAtTime(0, seconds);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);

  // Shared reverb and a tempo-synced delay.
  const len = SR * 2.5;
  const ir = ctx.createBuffer(2, len, SR);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const reverb = ctx.createConvolver();
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  reverb.connect(wet).connect(master);

  const BPM = 96;
  const beat = 60 / BPM;
  const bar = beat * 4;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = beat * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const delayIn = ctx.createGain();
  delayIn.gain.value = 0.5;
  delayIn.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(master);

  // Noise buffer for drums.
  const noise = ctx.createBuffer(1, SR, SR);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < SR; i++) nd[i] = rand() * 2 - 1;

  // Warm, hopeful progression: Cmaj9 - Am9 - Fmaj9 - G6/9 (bass roots C, A, F, G).
  const CHORDS = [
    { root: 36, notes: [60, 64, 67, 71, 74] },
    { root: 33, notes: [57, 60, 64, 67, 71] },
    { root: 29, notes: [53, 57, 60, 64, 67] },
    { root: 31, notes: [55, 59, 62, 64, 69] },
  ];

  const env = (g, t, a, peak, d, sustain = 0.0001) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  };

  function pad(t, chord, dur, level) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.6);
    g.gain.setValueAtTime(level, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
    lp.connect(g);
    g.connect(master);
    g.connect(reverb);
    for (const n of chord.notes) {
      for (const [type, det] of [['sawtooth', -8], ['triangle', 7]]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = note(n);
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = type === 'sawtooth' ? 0.05 : 0.12;
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + dur + 0.4);
      }
    }
  }
  function pluck(t, n, level) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = note(n);
    const g = ctx.createGain();
    env(g, t, 0.005, level, 0.35);
    o.connect(g);
    g.connect(master);
    g.connect(delayIn);
    g.connect(reverb);
    o.start(t);
    o.stop(t + 0.45);
  }
  function bass(t, n, dur) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = note(n);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    env(g, t, 0.01, 0.32, dur, 0.05);
    o.connect(lp).connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  function kick(t) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    const g = ctx.createGain();
    env(g, t, 0.004, 0.75, 0.32);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.4);
  }
  function hit(t, type, freq, level, decay) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    env(g, t, 0.002, level, decay);
    src.connect(f).connect(g);
    g.connect(master);
    if (type === 'bandpass') g.connect(reverb);
    src.start(t, rand() * 0.5);
    src.stop(t + decay + 0.05);
  }

  // Arrangement: soft intro (pad + sparse plucks), then the beat drops at `dropAt`.
  const bars = Math.ceil(seconds / bar);
  const dropBar = Math.max(0, Math.round(dropAt / bar)); // 0 = beat from the first bar
  const ARP = [0, 2, 4, 2, 1, 3, 4, 3];
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const chord = CHORDS[b % CHORDS.length];
    const full = b >= dropBar;
    pad(t0, chord, bar, full ? 0.11 : 0.15);
    for (let i = 0; i < 8; i++) {
      const t = t0 + i * (beat / 2);
      if (!full && i % 2 === 1) continue; // sparser before the drop
      pluck(t, chord.notes[ARP[i] % chord.notes.length] + 12, full ? 0.09 : 0.06);
    }
    if (!full) continue;
    bass(t0, chord.root + 12, beat * 1.5);
    bass(t0 + beat * 2, chord.root + 12, beat * 1.2);
    bass(t0 + beat * 3.5, chord.root + 19, beat * 0.4);
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * beat;
      if (i === 0 || i === 2) kick(t);
      if (i === 1 || i === 3) hit(t, 'bandpass', 1900, 0.32, 0.16); // clap/snare
      hit(t + beat / 2, 'highpass', 7500, 0.11, 0.05); // off-beat hat
      hit(t, 'highpass', 9000, 0.05, 0.03);
    }
  }

  const buf = await ctx.startRendering();
  // Encode 16-bit PCM WAV.
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s2) => [...s2].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVEfmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 2, true);
  out.setUint32(24, SR, true);
  out.setUint32(28, SR * 4, true);
  out.setUint16(32, 4, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++) {
    for (let c = 0; c < 2; c++, o += 2) out.setInt16(o, Math.max(-1, Math.min(1, ch[c][i])) * 0x7fff, true);
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Renders `seconds` of music to a WAV file. */
export async function renderMusic(seconds, outWav, { dropAt = 15, seed = 7 } = {}) {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const b64 = await page.evaluate(renderInPage, { seconds, dropAt, seed });
  await browser.close();
  writeFileSync(outWav, Buffer.from(b64, 'base64'));
}

/**
 * Mixes the music under a video's existing voice track, ducking it while the voice speaks.
 * `level` is the music volume between lines (0..1).
 */
export function mixUnderVoice(ffmpeg, video, musicWav, out, { level = 0.55 } = {}) {
  const filter = [
    '[0:a]aresample=48000,asplit=2[vo][key]',
    `[1:a]aresample=48000,volume=${level}[m]`,
    // Duck: when the voice is present the music drops by ~10 dB, recovering over ~0.5 s.
    '[m][key]sidechaincompress=threshold=0.02:ratio=8:attack=30:release=550:makeup=1[md]',
    '[vo][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]',
  ].join(';');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', video, '-i', musicWav, '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { stdio: 'inherit' });
}

// ---------------------------------------------------------------- CLI: add music to an existing video
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const val = (name, d) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? Number(process.argv[i + 1]) : d;
  };
  if (!input || !output) {
    console.log('usage: node scripts/demo/music.mjs <in.mp4> <out.mp4> [--drop 15] [--level 0.55]');
    process.exit(1);
  }
  const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
  const ffprobe = process.env.FFPROBE ?? 'ffprobe';
  const seconds = Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input]).toString().trim());
  const wav = join(tmpdir(), `relaxicise-music-${Date.now()}.wav`);
  console.log(`[music] composing ${seconds.toFixed(1)} s of music (beat drops at ${val('drop', 15)} s) ...`);
  await renderMusic(seconds, wav, { dropAt: val('drop', 15) });
  console.log('[music] mixing under the voice-over (with ducking) ...');
  mixUnderVoice(ffmpeg, input, wav, output, { level: val('level', 0.55) });
  console.log(`[music] done: ${output}`);
}
