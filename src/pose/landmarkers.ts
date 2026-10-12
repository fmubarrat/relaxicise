/**
 * MediaPipe loaders. WASM runtime and models are served from this app's own /mediapipe folder
 * (see scripts/fetch-assets.mjs), so there are no third-party requests at runtime.
 */
import type { FaceLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

const BASE = `${import.meta.env.BASE_URL}mediapipe`;

type Vision = typeof import('@mediapipe/tasks-vision');
let visionModule: Promise<Vision> | null = null;
let filesetPromise: Promise<unknown> | null = null;

async function vision() {
  visionModule ??= import('@mediapipe/tasks-vision');
  const mod = await visionModule;
  filesetPromise ??= mod.FilesetResolver.forVisionTasks(`${BASE}/wasm`);
  return { mod, fileset: (await filesetPromise) as Awaited<ReturnType<Vision['FilesetResolver']['forVisionTasks']>> };
}

let posePromise: Promise<PoseLandmarker> | null = null;

/** Pose landmarker (lite), VIDEO mode. Tries the GPU delegate, falls back to CPU. */
export function loadPoseLandmarker(): Promise<PoseLandmarker> {
  posePromise ??= (async () => {
    const { mod, fileset } = await vision();
    const create = (delegate: 'GPU' | 'CPU') =>
      mod.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${BASE}/pose_landmarker_lite.task`, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return await create('GPU');
    } catch {
      return await create('CPU');
    }
  })();
  // Allow a retry after a failure.
  posePromise.catch(() => (posePromise = null));
  return posePromise;
}

let facePromise: Promise<FaceLandmarker> | null = null;

/** Face landmarker with blendshapes, loaded lazily only for eyes-closed verification. */
export function loadFaceLandmarker(): Promise<FaceLandmarker> {
  facePromise ??= (async () => {
    const { mod, fileset } = await vision();
    const create = (delegate: 'GPU' | 'CPU') =>
      mod.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${BASE}/face_landmarker.task`, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    try {
      return await create('GPU');
    } catch {
      return await create('CPU');
    }
  })();
  facePromise.catch(() => (facePromise = null));
  return facePromise;
}

/** Average of eyeBlinkLeft/eyeBlinkRight, or null when no face is detected. */
export function blinkScore(face: FaceLandmarker, video: HTMLVideoElement, t: number): number | null {
  const r = face.detectForVideo(video, t);
  const cats = r.faceBlendshapes?.[0]?.categories;
  if (!cats) return null;
  const get = (name: string) => cats.find((c) => c.categoryName === name)?.score;
  const l = get('eyeBlinkLeft');
  const rr = get('eyeBlinkRight');
  if (l === undefined || rr === undefined) return null;
  return (l + rr) / 2;
}
