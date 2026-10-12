/**
 * Live heart rate from a Bluetooth monitor using the standard Heart Rate Service (0x180D),
 * via Web Bluetooth. Works with most chest straps and with watches that "broadcast heart
 * rate" (e.g. many Garmin/Polar models). Apple Watch and most Wear OS watches do not broadcast
 * it. Web Bluetooth is available in Chrome/Edge on desktop and Android, not in Safari/iOS or
 * Firefox. Readings stay in this page: nothing is stored beyond a per-break peak/average.
 */

// Minimal Web Bluetooth typings (not in TypeScript's DOM lib).
interface HrCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<HrCharacteristic>;
}
interface HrDevice extends EventTarget {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{ getPrimaryService(s: string): Promise<{ getCharacteristic(c: string): Promise<HrCharacteristic> }> }>;
    disconnect(): void;
  };
}
interface BluetoothLike {
  requestDevice(o: { filters: Array<{ services: string[] }> }): Promise<HrDevice>;
}

/** Parses a Heart Rate Measurement value: flags bit 0 selects uint8 or uint16 BPM. */
export function parseHeartRate(view: DataView): number | null {
  if (view.byteLength < 2) return null;
  const flags = view.getUint8(0);
  const bpm = flags & 0x01 ? (view.byteLength >= 3 ? view.getUint16(1, true) : null) : view.getUint8(1);
  return bpm && bpm > 20 && bpm < 250 ? bpm : null;
}

export type HrStatus = 'unsupported' | 'idle' | 'connecting' | 'connected' | 'error';

/** Peak/average over a recording window (one break). */
export class HrRecorder {
  private sum = 0;
  private count = 0;
  private peak = 0;
  add(bpm: number) {
    this.sum += bpm;
    this.count++;
    this.peak = Math.max(this.peak, bpm);
  }
  result(): { peak: number; avg: number } | null {
    return this.count ? { peak: this.peak, avg: Math.round(this.sum / this.count) } : null;
  }
}

/** Readings older than this are treated as stale (strap off, out of range). */
const STALE_MS = 5000;

export class HeartRateMonitor {
  status: HrStatus;
  bpm: number | null = null;
  deviceName: string | null = null;
  error: string | null = null;
  private lastAt = 0;
  private device: HrDevice | null = null;
  private recorder: HrRecorder | null = null;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.status = this.supported ? 'idle' : 'unsupported';
  }

  get supported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator && typeof window !== 'undefined' && window.isSecureContext;
  }

  /** Current BPM, or null when not connected or the last reading is stale. */
  current(now = Date.now()): number | null {
    return this.status === 'connected' && this.bpm !== null && now - this.lastAt < STALE_MS ? this.bpm : null;
  }

  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  /** Must be called from a click: the browser shows its own device picker. */
  async connect(): Promise<void> {
    if (!this.supported) return;
    this.status = 'connecting';
    this.error = null;
    this.emit();
    try {
      const bt = (navigator as unknown as { bluetooth: BluetoothLike }).bluetooth;
      const device = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      this.device = device;
      this.deviceName = device.name ?? 'Heart-rate monitor';
      device.addEventListener('gattserverdisconnected', () => {
        this.status = 'idle';
        this.bpm = null;
        this.emit();
      });
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService('heart_rate');
      const ch = await service.getCharacteristic('heart_rate_measurement');
      ch.addEventListener('characteristicvaluechanged', () => {
        const bpm = ch.value ? parseHeartRate(ch.value) : null;
        if (bpm === null) return;
        this.bpm = bpm;
        this.lastAt = Date.now();
        this.recorder?.add(bpm);
        this.emit();
      });
      await ch.startNotifications();
      this.status = 'connected';
      this.emit();
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      // Closing the picker is not an error.
      this.status = name === 'NotFoundError' ? 'idle' : 'error';
      this.error = name === 'NotFoundError' ? null : 'Could not connect. Make sure the device is broadcasting heart rate and nearby.';
      this.emit();
    }
  }

  disconnect(): void {
    try {
      this.device?.gatt?.disconnect();
    } catch {
      // ignore
    }
    this.device = null;
    this.status = this.supported ? 'idle' : 'unsupported';
    this.bpm = null;
    this.emit();
  }

  startRecording(): void {
    this.recorder ??= new HrRecorder();
  }

  stopRecording(): { peak: number; avg: number } | null {
    const r = this.recorder?.result() ?? null;
    this.recorder = null;
    return r;
  }
}

export const heartRate = new HeartRateMonitor();
