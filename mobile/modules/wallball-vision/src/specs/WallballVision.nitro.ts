import type { HybridObject } from 'react-native-nitro-modules'

/** A video as the decoder gives its frames: upright, in pixels. */
export interface ClipInfo {
  width: number
  height: number
  frames: number
  durationMs: number
}

/** A part of a frame, in the frame's pixels; it may reach past the frame's edges. */
export interface LookWindow {
  x: number
  y: number
  w: number
  h: number
}

/** A span across a frame, from `x0` to `x1`, in the frame's pixels. */
export interface PoseView {
  x0: number
  x1: number
}

/** One look of the ball model: the anchors whose best class score reaches the PWA's minimum, as `[6, count]` rows, channel first, boxes in input pixels. */
export interface Look {
  /** The frame the look was taken of. */
  frameIndex: number
  rows: number[]
  count: number
  /** The part of the frame the look drew into the model's input, or nothing for the whole frame. */
  window?: LookWindow
  /** Drawing the frame into the model's input. */
  prepMs: number
  /** Copying the input in, running the model, and reading the output. */
  runMs: number
}

/** The ball model's unit and input size, and the PWA's thresholds for reading its output. */
export interface BallOptions {
  /** TPU, CPU or off. */
  unit: string
  /** The model's square input side in pixels, which picks the model file: one of the sizes the app ships. */
  input: number
  /** The lowest class score a box needs, as the PWA's boxes.ts gives it. */
  minScore: number
  /** The width a frame is shrunk to before the letterbox, as the PWA's boxes.ts gives it. */
  cutWidth: number
}

/** How frames are judged: the pose, the ball model, and the pose's confidences. */
export interface JudgeOptions {
  /** OWN_CPU or OWN_TPU runs the module's own rebuild of MediaPipe's landmarker with its landmark model on that unit; CPU or GPU runs MediaPipe Tasks. */
  pose: string
  ball: BallOptions
  detection: number
  presence: number
  tracking: number
}

/** One frame and the pose found on it. */
export interface PoseFrame {
  index: number
  /** The frame's time, in milliseconds. */
  tMs: number
  /** The upright frame's size in pixels. */
  width: number
  height: number
  /** x, y, z and visibility for each of the 33 points, in fractions of the frame; empty when no athlete is found. */
  landmarks: number[]
  decodeMs: number
  /** The frame to upright RGBA. */
  convertMs: number
  poseMs: number
  /** The pose detector's part of `poseMs`: 0 on a frame that tracked the athlete, and always 0 for MediaPipe, which does not say. */
  detectorMs: number
  /** Whether a look of this frame started; it does not while the last one still runs. */
  lookStarted: boolean
  /** The looks that finished while this frame was processed, oldest first: of this frame, or of earlier ones. */
  looks: Look[]
}

/** The search model's anchors that reach the minimum score, as `[6, count]` rows, boxes in input pixels. */
export interface TargetRows {
  rows: number[]
  count: number
  ms: number
}

/** How long this phone takes for each part of the judge, in milliseconds a run; a part that did not run has no time. */
export interface PhoneCheck {
  /** The unit the ball model runs on: the first of `ballUnits`. */
  ballUnit: string
  /** A look of the ball model on that unit. */
  ballMs?: number
  /** A frame of the pose while it tracks the athlete: the landmark crop and model, as most frames of a set run. */
  poseMs?: number
  /** A look of the target search. */
  finderMs?: number
}

/** One search look at a frame. */
export interface TargetLook {
  /** The upright frame's size in pixels. */
  width: number
  height: number
  found: TargetRows
  /** The still pose's landmarks on the frame, as in `PoseFrame`; empty when it finds no athlete or was not asked to look. */
  landmarks: number[]
  /** The frame as a JPEG, a `file://` address, for the board to show while the target is chosen. */
  image: string
}

/** A video the app can judge. */
export interface VideoItem {
  /** Its address, as `openClip` takes it. */
  uri: string
  name: string
  durationMs: number
}

/** The app's native vision and phone services. */
export interface WallballVision
  extends HybridObject<{ android: 'kotlin'; ios: 'swift' }> {
  /** Milliseconds on the phone's monotonic clock, which every thread and runtime shares. */
  nowMs(): number
  /**
   * The ball units this phone runs the ball model at `input` pixels on, the fastest first: TPU when the model compiled
   * for a TPU loads here and answers as the CPU does, then CPU. The first call per system build and input size runs the
   * check, a few seconds; later calls read its result.
   */
  ballUnits(input: number): Promise<string[]>
  /**
   * Times each part of the judge on this phone, on the search thread: a look of the ball model at `input` pixels as the
   * unit check timed it, and a frame of the pose and a look of the target search, timed now. A look shrinks the frame to
   * `cutWidth` first, as the board's looks do. A few seconds.
   */
  checkPhone(cutWidth: number, input: number): Promise<PhoneCheck>

  /** Opens a video to judge frame by frame: a `content://` address or a file in the app's `clips` folder. */
  openClip(source: string, options: JudgeOptions): ClipInfo
  /**
   * Decodes the next frame and finds the pose on it, or returns nothing past the last frame.
   * With `look`, the frame also starts a look of the ball model at `window`, or at the whole frame without one,
   * unless the last look still runs.
   */
  nextPoseFrame(look: boolean, window: LookWindow | undefined): PoseFrame | undefined
  closeClip(): void

  /**
   * A search look at the frame a player shows at `seconds` into a video, with the still pose at `confidence`. The video
   * is read by its own decoder, kept open for the next second asked of the same video.
   */
  searchClipAt(source: string, seconds: number, cutWidth: number, minScore: number, confidence: number): Promise<TargetLook>
  closeSearch(): void

  /** Opens the pose and the ball model for camera frames. */
  openCamera(options: JudgeOptions): void
  /**
   * Judges one camera frame on the frame processor's thread: `pixels` is its RGBA plane, `bytesPerRow` bytes a row,
   * turned from upright as `orientation` names it and mirrored when `mirrored`; the frame is copied, so the caller may
   * dispose of it afterwards. A look starts while [setLookWanted] asks for looks.
   */
  cameraFrame(pixels: ArrayBuffer, bytesPerRow: number, width: number, height: number, orientation: string, mirrored: boolean, tMs: number): PoseFrame
  /** Whether the next camera frames start a look of the ball model, and at which part of the frame, or at the whole frame without `window`. */
  setLookWanted(wanted: boolean, window: LookWindow | undefined): void
  /**
   * Drops the athlete the camera's and the clip's pose follow, so the next frame of each finds them afresh. The pose
   * turns its crop to the body it found, and keeps a crop turned upside down while anyone is in view.
   */
  retrackPose(): void
  /**
   * The span of the frame that the camera's and the clip's pose see, or the whole frame without `view`. The pose reads
   * the frame as black outside the span, and drops a person it follows there.
   */
  setPoseView(view: PoseView | undefined): void
  /** A search look at the next camera frame, without the still pose: a running camera's judging pose already places the athlete. */
  searchCamera(cutWidth: number, minScore: number): Promise<TargetLook>
  closeCamera(): void

  /** The app's settings, strings under the PWA's localStorage keys. */
  getSetting(key: string): string | undefined
  setSetting(key: string, value: string): void
  removeSetting(key: string): void
  /** The phone's language, as a BCP 47 tag. */
  locale(): string
  /** The app's version, which its build takes from the repository's package.json, as the PWA's build does. */
  appVersion(): string
  /** Says `text` in the language `tag` names, dropping anything still being said. */
  say(text: string, tag: string, rate: number): void
  /**
   * Plays tones: five numbers a tone, its start and length in milliseconds, its frequency in hertz, its gain, and 1 for
   * a square wave or 0 for a sine. Each rises over `attackMs` to its gain and falls exponentially to `floor` by its end.
   */
  tones(parts: number[], attackMs: number, floor: number): void
  /**
   * Opens Android's own picker for one video and returns the video the user picks, or nothing when they cancel. The
   * pick lets the app read that video, so the app needs no permission for the phone's videos.
   */
  pickVideo(): Promise<VideoItem | undefined>
  /** The video at `source`, as `openClip` takes it, or nothing when it is gone, unreadable or empty. */
  videoAt(source: string): VideoItem | undefined
  /** Writes `text` to a file in the app's external files folder, for `adb pull`. */
  saveText(name: string, text: string): void
  /** The text the app kept under `name` in its private files folder, or nothing when there is no such file. */
  readKeptText(name: string): string | undefined
  /**
   * Keeps `text` under `name` in the app's private files folder, replacing the file whole: the text goes to a temporary
   * file first, which then takes the name, so a failure leaves the old file as it was.
   */
  keepText(name: string, text: string): void
  /**
   * Moves the recording at `path` into the phone's Movies folder, in `Wall Ball Judge`, named `title`, and returns its
   * content:// address, or '' when the move fails and the recording stays where it was. It copies on its own thread.
   */
  keepVideo(path: string, title: string): Promise<string>
  /** Deletes the recording at `path`, which the app did not keep. */
  dropVideo(path: string): void
  /** Deletes a video the app kept, by its content:// address, and says whether it did. */
  deleteVideo(uri: string): boolean
  /** Opens a video in the phone's own player. */
  openVideo(uri: string): void
}
