// Copies the MediaPipe WASM runtime out of node_modules and downloads the model files
// into public/mediapipe so the app serves them itself (no third-party calls at runtime).
// Idempotent: files already present are left alone. Never fails the install.
import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'mediapipe');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmOut = join(outDir, 'wasm');

const MODELS = [
  {
    file: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
];

async function main() {
  mkdirSync(wasmOut, { recursive: true });

  if (existsSync(wasmSrc)) {
    const missing = readdirSync(wasmSrc).some((f) => !existsSync(join(wasmOut, f)));
    if (missing) {
      cpSync(wasmSrc, wasmOut, { recursive: true });
      console.log('[assets] copied MediaPipe WASM runtime');
    }
  } else {
    console.warn('[assets] @mediapipe/tasks-vision not installed yet; run `npm install`.');
  }

  for (const m of MODELS) {
    const dest = join(outDir, m.file);
    if (existsSync(dest)) continue;
    try {
      console.log(`[assets] downloading ${m.file} ...`);
      const res = await fetch(m.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      console.log(`[assets] saved ${m.file}`);
    } catch (err) {
      console.warn(`[assets] could not download ${m.file}: ${err.message}. Re-run \`npm run assets\` when online.`);
    }
  }
}

const strict = process.argv.includes('--strict');

main()
  .catch((err) => console.warn('[assets]', err))
  .then(() => {
    // For production builds: refuse to ship without the runtime and models.
    if (!strict) return;
    const required = [...MODELS.map((m) => join(outDir, m.file)), join(wasmOut, 'vision_wasm_internal.wasm')];
    const missing = required.filter((f) => !existsSync(f));
    if (missing.length) {
      console.error(`[assets] missing required files: ${missing.join(', ')}`);
      process.exit(1);
    }
  });
