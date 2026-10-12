/**
 * Voice-over for the demo video, generated locally with Kokoro (open-source TTS, Apache-2.0).
 * The model (~90 MB) downloads once from Hugging Face; after that it runs offline on the CPU.
 * Lines are cached by voice + text, so re-recording only synthesizes lines that changed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const DEFAULT_VOICE = 'af_heart'; // warm, natural female voice. Others: am_michael, bf_emma, am_adam

/** @returns {Promise<Map<string, { file: string, seconds: number }>>} */
export async function synthesize(lines, { voice = DEFAULT_VOICE, cacheDir, ffprobe, speed = 0.95 }) {
  mkdirSync(cacheDir, { recursive: true });
  const out = new Map();
  let tts = null;
  for (const { id, text } of lines) {
    const key = createHash('sha1').update(`${voice}|${speed}|${text}`).digest('hex').slice(0, 16);
    const file = join(cacheDir, `${id}-${key}.wav`);
    if (!existsSync(file)) {
      if (!tts) {
        console.log('[voice] loading the Kokoro voice model (first run downloads ~90 MB) ...');
        const { KokoroTTS } = await import('kokoro-js');
        tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
      }
      console.log(`[voice] "${text}"`);
      const audio = await tts.generate(text, { voice, speed });
      await audio.save(file);
    }
    const seconds = Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
    out.set(id, { file, seconds });
  }
  return out;
}
