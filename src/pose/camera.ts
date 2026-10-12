/** Camera access. The stream is only ever shown in a <video> element and passed to MediaPipe in memory. */

export type CameraErrorKind = 'insecure' | 'unsupported' | 'denied' | 'no-camera' | 'busy' | 'unknown';

export class CameraError extends Error {
  constructor(readonly kind: CameraErrorKind, message: string) {
    super(message);
  }
}

export const CAMERA_MESSAGES: Record<CameraErrorKind, string> = {
  insecure: 'The camera only works over HTTPS or on localhost. Open relaxicise from a secure address.',
  unsupported: 'This browser does not support camera access.',
  denied: 'Camera access was blocked. Allow the camera for this site in your browser settings, then retry.',
  'no-camera': 'No camera was found. Connect a webcam, then retry.',
  busy: 'The camera is in use by another app (for example a video call). Close it, then retry.',
  unknown: 'The camera could not be started.',
};

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('insecure', CAMERA_MESSAGES.insecure);
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported', CAMERA_MESSAGES.unsupported);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraError('denied', CAMERA_MESSAGES.denied);
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CameraError('no-camera', CAMERA_MESSAGES['no-camera']);
    if (name === 'NotReadableError' || name === 'AbortError') throw new CameraError('busy', CAMERA_MESSAGES.busy);
    throw new CameraError('unknown', CAMERA_MESSAGES.unknown);
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
  } catch {
    // Autoplay of a muted inline video is allowed; ignore spurious interruptions.
  }
  return stream;
}

/** Stops every track so the browser's camera indicator turns off immediately. */
export function stopCamera(stream: MediaStream | null, video?: HTMLVideoElement | null): void {
  stream?.getTracks().forEach((t) => t.stop());
  if (video) {
    video.pause();
    video.srcObject = null;
  }
}
