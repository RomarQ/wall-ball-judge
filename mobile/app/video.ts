/**
 * The camera's video of a live set, recorded beside the frames the judge reads, without the overlay, as the PWA's
 * recording is.
 */
import type { CameraVideoOutput, Recorder } from 'react-native-vision-camera';

/** The video's size: the judged frames' own, so the camera streams one size to both. */
export const VIDEO_SIZE = { width: 1280, height: 720 };
/** About 22 MB a minute: a set of a hundred reps fits in a few hundred MB. */
export const VIDEO_BIT_RATE = 3_000_000;

/** How long a stopped recording gets to report its file: a camera that closed first may never report it. */
const FINISH_WAIT_MS = 5000;

/** The live board's video output, while its camera runs. */
export const cameraVideo: { output: CameraVideoOutput | null } = { output: null };

/** One set's recording, from its start until `stop`. */
export class SetVideo {
  private constructor(
    private readonly recorder: Recorder,
    /** The recorded file's path once the recording ends, or null when it failed. */
    private readonly finished: Promise<string | null>,
  ) {}

  /** Starts recording the live camera, or returns null when no camera runs or the recording does not start. */
  static async start(): Promise<SetVideo | null> {
    const output = cameraVideo.output;
    if (!output) return null;
    try {
      const recorder = await output.createRecorder({});
      let settle: (path: string | null) => void = () => {};
      const finished = new Promise<string | null>((resolve) => (settle = resolve));
      await recorder.startRecording(
        (path) => settle(path),
        (error) => {
          console.log(`VIDEO failed ${error.message}`);
          settle(null);
        },
      );
      return new SetVideo(recorder, finished);
    } catch (err) {
      console.log(`VIDEO failed to start ${String(err)}`);
      return null;
    }
  }

  /** Stops the recording and returns the file's path, or null when it failed or never reported one. */
  async stop(): Promise<string | null> {
    try {
      await this.recorder.stopRecording();
    } catch (err) {
      console.log(`VIDEO failed to stop ${String(err)}`);
    }
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), FINISH_WAIT_MS));
    return Promise.race([this.finished, late]);
  }
}
