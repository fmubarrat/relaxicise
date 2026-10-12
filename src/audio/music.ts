/**
 * Break music, generated live with the Web Audio API. No audio files, no network, nothing to
 * license. Several tracks share one small engine: pad chords, bell or piano-like notes, a noise
 * bed (waves, rain, vinyl) and, for lo-fi, a soft beat. Fades in and out.
 */
import { getAudio } from '../ui/alerts';

export const TRACK_IDS = ['calm', 'rain', 'ocean', 'piano', 'lofi'] as const;
export type TrackId = (typeof TRACK_IDS)[number];
export type MusicChoice = TrackId | 'shuffle';

interface Track {
  name: string;
  chords: number[][]; // MIDI notes
  chordSeconds: number;
  padWaves: OscillatorType[];
  padCutoff: number;
  padLevel: number;
  /** 'bells': random notes from `scale`; 'arp': arpeggiate the current chord. */
  notes: 'bells' | 'arp' | null;
  scale?: number[];
  noteEvery: [number, number];
  noteWave: OscillatorType;
  noteLevel: number;
  noteDecay: number;
  noise: 'waves' | 'rain' | 'vinyl' | null;
  noiseLevel: number;
  beat: boolean;
}

export const TRACKS: Record<TrackId, Track> = {
  calm: {
    name: 'Calm',
    chords: [[48, 55, 59, 62, 64], [45, 52, 55, 59, 60], [41, 48, 52, 57, 60], [43, 50, 52, 57, 59]],
    chordSeconds: 8,
    padWaves: ['triangle', 'sine'],
    padCutoff: 900,
    padLevel: 0.06,
    notes: 'bells',
    scale: [72, 74, 76, 79, 81, 84],
    noteEvery: [1.6, 4],
    noteWave: 'sine',
    noteLevel: 0.045,
    noteDecay: 3,
    noise: 'waves',
    noiseLevel: 0.03,
    beat: false,
  },
  rain: {
    name: 'Rain',
    chords: [[50, 57, 60, 64, 65], [46, 53, 57, 62], [41, 48, 53, 57, 60], [48, 55, 60, 64]],
    chordSeconds: 10,
    padWaves: ['sine'],
    padCutoff: 650,
    padLevel: 0.07,
    notes: 'bells',
    scale: [74, 77, 79, 81, 84],
    noteEvery: [3.5, 7],
    noteWave: 'sine',
    noteLevel: 0.03,
    noteDecay: 3.5,
    noise: 'rain',
    noiseLevel: 0.05,
    beat: false,
  },
  ocean: {
    name: 'Ocean',
    chords: [[51, 58, 62, 65, 67], [44, 51, 55, 60], [48, 55, 58, 63], [46, 53, 58, 62]],
    chordSeconds: 12,
    padWaves: ['sine', 'sine'],
    padCutoff: 700,
    padLevel: 0.05,
    notes: 'bells',
    scale: [75, 79, 82, 84, 87],
    noteEvery: [4, 8],
    noteWave: 'sine',
    noteLevel: 0.028,
    noteDecay: 4,
    noise: 'waves',
    noiseLevel: 0.075,
    beat: false,
  },
  piano: {
    name: 'Piano',
    chords: [[48, 52, 55, 59, 62], [45, 48, 52, 55, 59], [41, 45, 48, 52, 57], [43, 47, 50, 55, 59]],
    chordSeconds: 7.2,
    padWaves: ['sine'],
    padCutoff: 500,
    padLevel: 0.025,
    notes: 'arp',
    noteEvery: [0.9, 0.9],
    noteWave: 'triangle',
    noteLevel: 0.06,
    noteDecay: 2.6,
    noise: null,
    noiseLevel: 0,
    beat: false,
  },
  lofi: {
    name: 'Lo-fi',
    chords: [[53, 57, 60, 64, 67], [52, 55, 59, 62], [50, 53, 57, 60, 64], [48, 52, 55, 59, 62]],
    chordSeconds: 3.2, // 75 bpm, one bar
    padWaves: ['triangle'],
    padCutoff: 1100,
    padLevel: 0.05,
    notes: 'bells',
    scale: [72, 74, 76, 79, 81],
    noteEvery: [1.6, 3.2],
    noteWave: 'triangle',
    noteLevel: 0.03,
    noteDecay: 1.4,
    noise: 'vinyl',
    noiseLevel: 0.02,
    beat: true,
  },
};

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const VOLUME = 0.6;

function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return buf;
}

function noiseBuffer(ctx: AudioContext, seconds: number, kind: 'brown' | 'white' | 'crackle'): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    if (kind === 'brown') {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    } else if (kind === 'white') {
      d[i] = Math.random() * 2 - 1;
    } else {
      d[i] = Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 0.9 : (Math.random() * 2 - 1) * 0.03;
    }
  }
  return buf;
}

/** One playing track with its own audio graph. Stopping fades it out and tears it down. */
class TrackPlayer {
  private readonly master: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly delayIn: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextChordAt: number;
  private nextNoteAt: number;
  private nextBeatAt: number;
  private chord = 0;
  private arpStep = 0;
  private beatStep = 0;

  constructor(
    private readonly ctx: AudioContext,
    readonly id: TrackId,
  ) {
    const t = TRACKS[id];
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 4);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    this.reverb.connect(wet).connect(this.master);

    const delay = ctx.createDelay(2);
    delay.delayTime.value = t.beat ? 0.4 : 0.48;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    this.delayIn = ctx.createGain();
    this.delayIn.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(this.reverb);
    delay.connect(this.master);

    if (t.noise) this.noiseBed(t.noise, t.noiseLevel);

    const now = ctx.currentTime;
    this.nextChordAt = now + 0.05;
    this.nextNoteAt = now + (t.notes === 'arp' ? 0.6 : 2);
    this.nextBeatAt = now + 0.05;
    this.master.gain.linearRampToValueAtTime(VOLUME, now + 3);
    this.timer = setInterval(() => this.schedule(), 300);
    this.schedule();
  }

  stop(): void {
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 1.8);
    setTimeout(() => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      for (const s of this.sources) {
        try {
          s.stop();
        } catch {
          // already stopped
        }
      }
      this.master.disconnect();
    }, 2000);
  }

  private noiseBed(kind: 'waves' | 'rain' | 'vinyl', level: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 6, kind === 'waves' ? 'brown' : kind === 'rain' ? 'white' : 'crackle');
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    gain.gain.value = level;
    if (kind === 'waves') {
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      // A slow swell, like waves.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const depth = ctx.createGain();
      depth.gain.value = level * 0.8;
      lfo.connect(depth).connect(gain.gain);
      lfo.start();
      this.sources.push(lfo);
    } else if (kind === 'rain') {
      filter.type = 'bandpass';
      filter.frequency.value = 2400;
      filter.Q.value = 0.5;
    } else {
      filter.type = 'highpass';
      filter.frequency.value = 1500;
    }
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.sources.push(src);
  }

  private schedule() {
    const t = TRACKS[this.id];
    const horizon = this.ctx.currentTime + 1.2;
    while (this.nextChordAt < horizon) {
      this.pad(t, t.chords[this.chord % t.chords.length], this.nextChordAt);
      this.chord++;
      this.nextChordAt += t.chordSeconds;
    }
    while (t.notes && this.nextNoteAt < horizon) {
      if (t.notes === 'arp') {
        const ch = t.chords[(this.chord - 1 + t.chords.length) % t.chords.length];
        const pattern = [0, 2, 4, 3, 1, 3, 4, 2];
        const n = ch[pattern[this.arpStep++ % pattern.length] % ch.length] + 12;
        this.note(t, n, this.nextNoteAt);
      } else if (Math.random() < 0.7) {
        this.note(t, t.scale![Math.floor(Math.random() * t.scale!.length)], this.nextNoteAt);
      }
      const [lo, hi] = t.noteEvery;
      this.nextNoteAt += lo + Math.random() * (hi - lo);
    }
    while (t.beat && this.nextBeatAt < horizon) {
      const step = this.beatStep++ % 8; // eighth notes
      if (step === 0 || step === 5) this.kick(this.nextBeatAt);
      if (step % 2 === 1) this.hat(this.nextBeatAt);
      this.nextBeatAt += t.chordSeconds / 8;
    }
  }

  private pad(t: Track, notes: number[], at: number) {
    const ctx = this.ctx;
    const dur = t.chordSeconds + Math.min(3, t.chordSeconds * 0.4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = t.padCutoff;
    const env = ctx.createGain();
    const attack = Math.min(2.8, t.chordSeconds * 0.35);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(t.padLevel, at + attack);
    env.gain.setValueAtTime(t.padLevel, Math.max(at + attack, at + dur - attack));
    env.gain.linearRampToValueAtTime(0.0001, at + dur);
    filter.connect(env);
    env.connect(this.master);
    env.connect(this.reverb);
    for (const n of notes) {
      t.padWaves.forEach((type, i) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = NOTE(n);
        osc.detune.value = i === 0 ? -6 : 7;
        const g = ctx.createGain();
        g.gain.value = 0.18 / t.padWaves.length;
        osc.connect(g).connect(filter);
        osc.start(at);
        osc.stop(at + dur + 0.1);
      });
    }
  }

  private note(t: Track, n: number, at: number) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = t.noteWave;
    osc.frequency.value = NOTE(n);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(t.noteLevel, at + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, at + t.noteDecay);
    osc.connect(env);
    env.connect(this.delayIn);
    env.connect(this.reverb);
    env.connect(this.master);
    osc.start(at);
    osc.stop(at + t.noteDecay + 0.1);
  }

  private kick(at: number) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(110, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.16, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    osc.connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + 0.4);
  }

  private hat(at: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.08, 'white');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.02, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    src.connect(hp).connect(g).connect(this.master);
    src.start(at);
  }
}

class Music {
  private player: TrackPlayer | null = null;
  private choice: MusicChoice = 'calm';

  get playing(): boolean {
    return this.player !== null;
  }

  get currentTrack(): TrackId | null {
    return this.player?.id ?? null;
  }

  /** Sets the track preference; switches the playing track if it differs. */
  setChoice(choice: MusicChoice): void {
    this.choice = choice;
    if (this.player && choice !== 'shuffle' && choice !== this.player.id) {
      this.stop();
      this.start();
    }
  }

  start(): void {
    const ctx = getAudio();
    if (!ctx || this.player) return;
    const id = this.choice === 'shuffle' ? TRACK_IDS[Math.floor(Math.random() * TRACK_IDS.length)] : this.choice;
    this.player = new TrackPlayer(ctx, id);
  }

  stop(): void {
    this.player?.stop();
    this.player = null;
  }

  /** Skips to another track (used by the "next track" button). */
  next(): TrackId | null {
    const cur = this.player?.id ?? (this.choice === 'shuffle' ? 'calm' : this.choice);
    const id = TRACK_IDS[(TRACK_IDS.indexOf(cur) + 1) % TRACK_IDS.length];
    if (this.player) {
      this.stop();
      const ctx = getAudio();
      if (ctx) this.player = new TrackPlayer(ctx, id);
    }
    return id;
  }
}

export const music = new Music();
