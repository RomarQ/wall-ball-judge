/**
 * Session recording: the camera's own picture, without the overlay.
 */

function pickMimeType(): string {
  const options = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return options.find((t) => window.MediaRecorder?.isTypeSupported(t)) ?? '';
}

/** True when this browser can record the camera's video. */
export function canRecordVideo(): boolean {
  return recordingType() !== null;
}

/** The video type this browser records the camera in, or null when it cannot record. */
export function recordingType(): string | null {
  if (typeof window === 'undefined' || !window.MediaRecorder) return null;
  return pickMimeType() || null;
}

export interface Recording {
  video: Blob | null;
}

export class SessionRecorder {
  recorder: MediaRecorder | null = null;
  chunks: Blob[] = [];
  started = false;

  /** True between `start` and `stop`. */
  get active(): boolean {
    return this.started;
  }

  /** Starts recording `stream`, when the browser supports MediaRecorder. Returns whether it records. */
  start(stream: MediaStream): boolean {
    this.chunks = [];
    this.started = true;

    if (!window.MediaRecorder) return false;
    const mimeType = pickMimeType();
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
    return true;
  }

  async stop(): Promise<Recording> {
    const recorder = this.recorder;
    await new Promise<void>((resolve) => {
      if (!recorder) return resolve();
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    const type = recorder?.mimeType || 'video/webm';
    const video = this.chunks.length ? new Blob(this.chunks, { type }) : null;
    this.recorder = null;
    this.started = false;
    return { video };
  }
}

/** A recorded video's dated name, with the extension its type calls for. */
export function videoName(video: Blob): string {
  return stampedName('wallball', video.type.includes('mp4') ? 'mp4' : 'webm');
}

/** Asks the browser to save what `url` points at under `filename`. */
export function downloadUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function stampedName(prefix: string, ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${prefix}-${stamp}.${ext}`;
}
