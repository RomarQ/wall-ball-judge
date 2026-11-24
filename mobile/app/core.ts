/** The PWA's judging core and texts, which the app runs unchanged. The only file that imports from the repository's `src`. */
export { TARGETS, type Target, type Verdict } from '../../src/ball';
export { ballFileAt, ballInputs } from '../../src/ball-model';
export { CUT_WIDTH, cutScale, cutSize, decode, fromArea, IOU_MAX, letterbox, MAX_BOXES, MIN_SCORE } from '../../src/boxes';
export { clockText, paceOf, SetClock, STATION_REPS } from '../../src/clock';
export { sceneAt, STILL_MS, type Division, type Point, type StationScene } from '../../src/demo-scene';
export { DEFAULTS as DEPTH, LM, type Depth } from '../../src/depth';
export { Board, type Flash, type SearchOutcome } from '../../src/board';
export { flashText } from '../../src/flash';
export { layoutOverlay, type Colour, type NoticeTone, type OverlayLayout, type PlateMark } from '../../src/overlay-layout';
export { FrameJudge, type JudgedFrame, type LookTicket } from '../../src/frame-judge';
export { LINKS } from '../../src/links';
export { chooseLanguage, decimal, t, warningText } from '../../src/i18n';
export type { LoggedTarget } from '../../src/judge-log';
export {
  athleteFrom,
  DEFAULTS as FINDER,
  FINGERTIP_PT,
  grabPlate,
  holdsTwoMarks,
  readLook,
  searchClip,
  weighedMarks,
  type PlateGrab,
  type Seen,
} from '../../src/placement';
export { DEFAULTS as REACH, type Rect } from '../../src/reach';
export {
  ballReadiness,
  phoneReadiness,
  poseReadiness,
  type Measured,
  type Parts,
  type Readiness,
} from '../../src/readiness';
export {
  callsFor,
  decodeBoard,
  decodeCommand,
  encodeBoard,
  encodeCommand,
  encodeScore,
  scoreCalls,
  type BoardEvent,
  type BoardFlash,
  type BoardState,
  type Call,
  type DisplayCommand,
  type Score,
} from '../../src/scoreboard-wire';
export {
  parseHistory,
  SetRecorder,
  type SetHistory,
  type SetRecord,
} from '../../src/set-record';
export {
  ballCheckOn,
  CONFIDENCE_DEFAULT,
  deviceLanguage,
  divisionByHit,
  JUDGING_DETECTION,
  language,
  languageChoice,
  LANGUAGES,
  poseConfidence,
  requiredAtStart,
  SEARCH_CONFIDENCE,
  setBallCheckOn,
  setBallInput,
  setDivisionByHit,
  setLanguage,
  setPoseConfidence,
  storedBallInput,
  storedRequired,
  storeRequired,
  type LanguageChoice,
  type LanguageTag,
} from '../../src/settings';
export { ATTACK_MS, FLOOR, SPEECH_RATE, TONES, type Tone } from '../../src/tones';
export {
  LIT_MS,
  Tally,
  TALLY_KEY,
  type LitPart,
  type RepTimes,
  type TallyChange,
  type TallySounds,
  type TallyStore,
} from '../../src/tally';
export type { Box, Landmark } from '../../src/types';
