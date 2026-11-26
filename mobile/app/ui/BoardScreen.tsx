/**
 * The judge board, laid out as the PWA's: the picture with the overlay, the tools under it, and the scoreboard the
 * judge reads from across the station, under the picture or, on its side, beside it. A recording shows its search frame while the target is chosen and then plays
 * as it is judged; the camera is judged live. The live scoreboard's tally runs across sets until Reset; a replayed
 * clip's starts at zero.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutRectangle,
  type PanResponderGestureState,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Camera, useCameraDevice, useCameraPermission, useFrameOutput, useVideoOutput } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import { ClipView, wallballVision, type PoseFrame } from 'wallball-vision';
import { PipelineBoard } from '../board';
import type { TrainedFile } from '../detect';
import { ballCheckOn, clockText, decimal, FINDER, FINGERTIP_PT, grabPlate, type NoticeTone, LIT_MS, paceOf, STATION_REPS, t, Tally, type LitPart, type PlateGrab, type Rect, type Target } from '../core';
import type { DisplaySender } from '../pair';
import { judgeOptions, judgeRecording } from '../run';
import { saveSetsOn, SetKeeper } from '../sets';
import { tallySounds } from '../sound';
import { cameraVideo, VIDEO_BIT_RATE, VIDEO_SIZE } from '../video';
import { searchCamera, searchRecording } from '../search';
import { fitFrame, fromView, type Fit } from './fit';
import { Bar, Button, CONDENSED, IconButton } from './controls';
import { Aim, CameraIcon, Film, Flip, Gear, Plate, Play, SquatFault, StopSquare, TargetFault } from './icons';
import { Overlay, type Notice } from './Overlay';
import { COLOURS, REM, TAP } from './theme';

export type BoardSource = { kind: 'camera' } | { kind: 'recording'; uri: string; name: string; durationMs: number };

/** A set started without taps, for checks over adb: the candidate to place, and the target to judge or null for the first hit to pick. */
export interface AutoSet {
  pick: number;
  required: Target | null;
}

type Phase = 'searching' | 'choosing' | 'counting' | 'done';

/** How near a candidate a tap must land to pick it, as a share of the frame's height; the PWA board's TAP_REACH. */
const TAP_REACH = 0.08;
/** The smallest a plate may be sized, in frame units, the PWA's MIN_PLATE. */
const MIN_PLATE = 0.015;
/** How far a touch may move and still be a tap, in screen points. */
const TAP_SLOP = 10;
/** The longest the board waits between two redraws while it judges, in milliseconds. */
const REDRAW_MS = 66;
/** How often a running set clock redraws, the PWA's. */
const CLOCK_MS = 250;
/** How long the camera runs before the first search, so the pose has found the athlete. */
const FIRST_SEARCH_MS = 1500;
/** How long Reset waits for the second tap, and shows that there is nothing to clear; the PWA's. */
const RESET_ARMED_MS = 4000;
const NOTHING_TO_RESET_MS = 1500;
/** The picture's corner radius, the PWA's 1rem. */
const CORNER = REM;
/** Reset's width, and the division block's above it, so the two line up; the PWA's --side. */
const SIDE = 8.5 * REM;
/** A fault's number and label, in their line heights. */
const FAULT_N_LINE = 28;
const FAULT_WHAT_LINE = 15;
/** The narrowest screen on its side that puts the scoreboard beside the picture, and the scoreboard's width there; the PWA's. */
const WIDE_MIN = 600;
const WIDE_SIDE = 24 * REM;
/** The unit the target search runs on: LiteRT on the CPU. */
const FINDER_UNIT = 'CPU';
const FACING_KEY = 'facingMode';

type Facing = 'user' | 'environment';

/** A touch on the picture: a tap so far, a tap on a plate's remove button, or a plate's move or resize, in frame units as shown. */
type Drag =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'remove'; index: number }
  | { kind: Exclude<PlateGrab['part'], 'remove'>; index: number; from: { x: number; y: number }; plate: Rect };

/** The camera's frames reach the board through these, as a worklet captures module functions and not React state. */
const cameraHandlers = {
  frame: (_frame: PoseFrame) => {},
  error: (_why: string) => {},
};

function onCameraFrame(frame: PoseFrame): void {
  cameraHandlers.frame(frame);
}

function onCameraError(why: string): void {
  cameraHandlers.error(why);
}

/** A notice on the status line, with its banner on the picture, which a judge standing back can read. */
interface Said {
  line: string;
  banner: Notice;
}

export function BoardScreen({
  source,
  ballUnit,
  ballModel,
  liveTally,
  sender,
  onHome,
  onSettings,
  onLive,
  onRecording,
  auto,
}: {
  source: BoardSource;
  ballUnit: string;
  /** The ball model this board judges with, as the settings chose it when the board opened. */
  ballModel: TrainedFile;
  /** The live board's tally, kept across sets; a replay gets its own. */
  liveTally: Tally;
  /** The link to a display, which gets this board's tally while the board is open. */
  sender: DisplaySender;
  onHome: () => void;
  onSettings: () => void;
  onLive: () => void;
  onRecording: () => void;
  auto?: AutoSet;
}) {
  // A replay's counts are no part of the live totals, and the live totals no part of a replay's.
  const tally = useMemo(() => (source.kind === 'recording' ? new Tally(tallySounds) : liveTally), [source.kind, liveTally]);
  // The board tells of its pick through this, as the notice that shows it comes after the board.
  const onPicked = useRef(() => {});
  const board = useMemo(
    () => new PipelineBoard(ballCheckOn() && ballUnit !== 'off', tally, ballModel, () => onPicked.current()),
    [ballUnit, ballModel, tally],
  );
  const [phase, setPhase] = useState<Phase>('searching');
  const [, setTick] = useState(0);
  const redraw = useCallback(() => setTick((n) => n + 1), []);
  const [said, setSaid] = useState<Said | null>(null);
  const saidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const screen = useWindowDimensions();
  const wide = screen.width > screen.height && screen.width >= WIDE_MIN;
  const [image, setImage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [facing, setFacing] = useState<Facing>(() => (localStorage.getItem(FACING_KEY) === 'environment' ? 'environment' : 'user'));
  const [fps, setFps] = useState(0);
  useEffect(
    () => sender.watch({ tally, required: () => board.required, setRequired: (which) => board.setRequired(which) }),
    [sender, tally, board],
  );
  useEffect(() => sender.subscribe(redraw), [sender, redraw]);
  const [cameraReady, setCameraReady] = useState(false);
  const stopped = useRef(false);

  const notice = useCallback((line: string, banner: string, tone: NoticeTone, holdMs: number) => {
    if (saidTimer.current) clearTimeout(saidTimer.current);
    setSaid({ line, banner: { text: banner, tone } });
    saidTimer.current = setTimeout(() => setSaid(null), holdMs);
  }, []);
  onPicked.current = () => {
    // For checks over adb: the station the athlete's squat picked, in frame pixels.
    console.log(`PICKED ${JSON.stringify(board.plates.map((p) => [p.x, p.y, p.w, p.h].map((v) => Math.round(v * board.height))))}`);
    notice(t('board.picked'), t('board.placedBanner'), 'ok', 6000);
  };

  const find = useCallback(async () => {
    if (!board.armed) setPhase('searching');
    notice(t('board.looking'), t('board.lookingBanner'), 'plain', 30000);
    const started = wallballVision.nowMs();
    try {
      const found = source.kind === 'recording' ? await searchRecording(source.uri, source.durationMs) : await searchCamera(board.landmarks);
      if (source.kind === 'recording') {
        board.width = found.frame.width;
        board.height = found.frame.height;
        setImage(found.frame.image);
      }
      const outcome = board.searched(found.seen, FINDER);
      // One number on the preview for each station, the plates of a station together.
      const n = board.stations.length;
      // For checks over adb: the search's plates, in frame pixels, best first.
      const round = (v: number) => Math.round(v);
      console.log(
        `SEARCH ${JSON.stringify({
          size: [found.frame.width, found.frame.height],
          outcome,
          stations: board.stations,
          best: Number(found.best.toFixed(3)),
          candidates: found.seen.look.plates.map((b) => [round(b.x), round(b.y), round(b.w), round(b.h), Number(b.score.toFixed(3))]),
        })}`,
      );
      const took = t('board.searched')(FINDER_UNIT, decimal((wallballVision.nowMs() - started) / 1000, 1));
      if (outcome === 'placed') notice(t('board.placed') + took, t('board.placedBanner'), 'ok', 6000);
      else if (outcome === 'squat') notice(t('board.atSquat')(n) + took, t('board.atSquatBanner'), 'ok', 15000);
      else if (n === 1) notice(t('board.oneCandidate') + took, t('board.oneCandidateBanner'), 'ok', 15000);
      else if (n > 1) notice(t('board.candidates')(n) + took, t('board.candidatesBanner')(n), 'ok', 15000);
      else notice(t('board.noTarget')(found.best ? decimal(found.best, 2) : null) + took, t('board.noTargetBanner'), 'warn', 20000);
    } catch (err) {
      notice(t('board.finderUnavailable')(err instanceof Error ? err.message : String(err)), t('board.finderUnavailableBanner'), 'warn', 8000);
    }
    if (!board.armed) setPhase('choosing');
    redraw();
  }, [board, redraw, notice, source]);

  // A recording is searched at once; the camera once the pose has had its first frames.
  useEffect(() => {
    if (source.kind === 'recording') {
      void find();
      return undefined;
    }
    const timer = setTimeout(() => void find(), FIRST_SEARCH_MS);
    return () => clearTimeout(timer);
  }, [find, source.kind]);

  useEffect(
    () => () => {
      stopped.current = true;
      if (saidTimer.current) clearTimeout(saidTimer.current);
      wallballVision.closeSearch();
      tally.hold();
    },
    [tally],
  );

  // The set clock moves while it runs, as the PWA's board redraws it.
  useEffect(() => {
    const timer = setInterval(() => {
      if (tally.clock.running) redraw();
    }, CLOCK_MS);
    return () => clearInterval(timer);
  }, [redraw, tally]);

  // The camera's pipeline opens once for the board, so a flip of the camera keeps the pose's tracking.
  useEffect(() => {
    if (source.kind !== 'camera') return undefined;
    wallballVision.openCamera(judgeOptions(ballUnit, board.ballModel.input));
    setCameraReady(true);
    let lastDraw = 0;
    let frames = 0;
    let since = wallballVision.nowMs();
    let lastFrameMs: number | null = null;
    const gaps: number[] = [];
    cameraHandlers.frame = (frame) => {
      const ask = board.frame(frame);
      wallballVision.setLookWanted(ask.wanted, ask.window);
      frames += 1;
      if (lastFrameMs !== null) gaps.push(frame.tMs - lastFrameMs);
      lastFrameMs = frame.tMs;
      const now = wallballVision.nowMs();
      if (now - since >= 1000) {
        const rate = Math.round((frames * 1000) / (now - since));
        setFps(rate);
        // For checks over adb: the judged rate, the camera's own frame spacing, and the pose's time.
        const sorted = gaps.sort((a, b) => a - b);
        console.log(`CAMERA ${JSON.stringify({ fps: rate, gapMs: Math.round(sorted[sorted.length >> 1] ?? 0), poseMs: Math.round(frame.poseMs), ballUnit })}`);
        [frames, since] = [0, now];
        gaps.length = 0;
      }
      if (now - lastDraw >= REDRAW_MS) {
        lastDraw = now;
        redraw();
      }
    };
    cameraHandlers.error = (why) => setFailure(t('board.failed')(false, why));
    return () => {
      cameraHandlers.frame = () => {};
      cameraHandlers.error = () => {};
      wallballVision.setLookWanted(false, undefined);
      wallballVision.closeCamera();
    };
  }, [ballUnit, board, redraw, source.kind]);

  // The picture takes its own shape inside the room it has, as the PWA's fitted viewport does.
  const known = board.width > 0 && board.height > 0;
  const placedIn = useMemo(
    () => (known ? fitFrame(area.width, area.height, board.width, board.height, false) : null),
    // The board's size changes with the first frame or the search frame, which a redraw follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [area, board.width, board.height, known],
  );
  const viewport: LayoutRectangle = placedIn
    ? { x: placedIn.left, y: placedIn.top, width: board.width * placedIn.scale, height: board.height * placedIn.scale }
    : { x: 0, y: 0, width: area.width, height: area.height };
  const fit: Fit = useMemo(
    () => ({
      left: 0,
      top: 0,
      scale: placedIn?.scale ?? 0,
      width: board.width || 1,
      height: board.height || 1,
      mirrored: source.kind === 'camera' && facing === 'user',
    }),
    [placedIn, board.width, board.height, source.kind, facing],
  );

  /** A tap at `vx`, `vy` in view points: it picks the nearest candidate, or adds a plate where it lands. */
  const tapAt = (vx: number, vy: number) => {
    const at = fromView(fit, vx, vy);
    if (!at || !board.ballCheck) return;
    if (board.candidates.length) {
      const px = at.x * board.width;
      const py = at.y * board.height;
      let nearest = -1;
      let nearestGap = Infinity;
      board.candidates.forEach((c, i) => {
        const gap = Math.hypot(c.x + c.w / 2 - px, c.y + c.h / 2 - py);
        if (gap <= Math.max(c.w, c.h, TAP_REACH * board.height) && gap < nearestGap) [nearest, nearestGap] = [i, gap];
      });
      if (nearest >= 0) {
        board.placeCandidate(nearest);
        notice(t('board.placedPick'), t('board.placedBanner'), 'ok', 6000);
      } else {
        board.placeAt(at.x, at.y);
        notice(t('board.placedByTap'), t('board.placedBanner'), 'ok', 6000);
      }
    } else if ((!board.armed || !board.placed) && board.addAt(at.x, at.y) >= 0) {
      notice(t('board.placedByTap'), t('board.placedBanner'), 'ok', 6000);
    }
    redraw();
  };

  const drag = useRef<Drag | null>(null);
  /** Frame units as the picture shows them: x scaled by the frame's aspect, mirrored with the picture. */
  const shown = (vx: number, vy: number) => {
    const across = (vx - fit.left) / fit.scale / fit.width;
    return { x: (across * fit.width) / fit.height, y: (vy - fit.top) / fit.scale / fit.height };
  };
  const mirror = (plate: Rect): Rect => (fit.mirrored ? { ...plate, x: fit.width / fit.height - (plate.x + plate.w) } : plate);

  // The touch handlers change with each render; the responder, made once, keeps one gesture's distance across redraws.
  const touch = {
    grant: (event: GestureResponderEvent) => {
      const { locationX: vx, locationY: vy } = event.nativeEvent;
      drag.current = { kind: 'tap', x: vx, y: vy };
      if (!board.ballCheck || board.candidates.length || !fit.scale) return;
      const p = shown(vx, vy);
      const plates = board.plates.map(mirror);
      const grab = grabPlate(plates, p, FINGERTIP_PT / (fit.height * fit.scale), !board.armed);
      if (grab?.part === 'remove') drag.current = { kind: 'remove', index: grab.index };
      else if (grab) drag.current = { kind: grab.part, index: grab.index, from: p, plate: plates[grab.index] };
    },
    move: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      const held = drag.current;
      if (!held || held.kind === 'tap' || held.kind === 'remove') return;
      const dx = gesture.dx / (fit.height * fit.scale);
      const dy = gesture.dy / (fit.height * fit.scale);
      const { plate } = held;
      const moved =
        held.kind === 'move'
          ? { ...plate, x: plate.x + dx, y: plate.y + dy }
          : { ...plate, w: Math.max(MIN_PLATE, plate.w + dx), h: Math.max(MIN_PLATE, plate.h + dy) };
      held.index = board.setPlate(held.index, mirror(moved));
      redraw();
    },
    release: (gesture: PanResponderGestureState) => {
      const held = drag.current;
      drag.current = null;
      const still = Math.hypot(gesture.dx, gesture.dy) <= TAP_SLOP;
      if (held?.kind === 'tap' && still) tapAt(held.x, held.y);
      if (held?.kind === 'remove' && still) {
        board.removePlate(held.index);
        redraw();
      }
    },
  };
  const latestTouch = useRef(touch);
  latestTouch.current = touch;
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => latestTouch.current.grant(event),
      onPanResponderMove: (event, gesture) => latestTouch.current.move(event, gesture),
      onPanResponderRelease: (_event, gesture) => latestTouch.current.release(gesture),
    }),
  ).current;

  const go = () => {
    board.armed = true;
    setPhase('counting');
    if (board.ballCheck && !board.placed) notice(t('board.untargeted'), t('board.untargetedBanner'), 'warn', 4000);
    else notice(t('board.counting'), t('board.goBanner'), 'ok', 2000);
    // Only a live set is kept; a judged video never is.
    if (source.kind === 'camera') keeper.current = new SetKeeper(tally, auto === undefined && saveSetsOn());
    if (source.kind !== 'recording') return;
    let lastDraw = 0;
    let frames = 0;
    let since = wallballVision.nowMs();
    judgeRecording(
      board,
      source.uri,
      judgeOptions(ballUnit, board.ballModel.input),
      (done, total) => {
        frames += 1;
        const now = wallballVision.nowMs();
        if (now - since >= 1000) {
          setFps(Math.round((frames * 1000) / (now - since)));
          [frames, since] = [0, now];
        }
        if (done < total && now - lastDraw < REDRAW_MS) return;
        lastDraw = now;
        redraw();
      },
      () => stopped.current,
    )
      .then(() => {
        tally.hold();
        setPhase('done');
        saveSet(board, source.name, ballUnit);
        endSet();
      })
      .catch((err: unknown) => setFailure(t('board.failed')(true, err instanceof Error ? err.message : String(err))));
  };

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!auto || phase !== 'choosing' || autoStarted.current) return;
    autoStarted.current = true;
    board.setRequired(auto.required);
    board.placeCandidate(auto.pick);
    go();
    // A set started without taps starts once, when the search is done.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const keeper = useRef<SetKeeper | null>(null);
  /** Ends the set that runs, if one does, and keeps it. */
  const endSet = () => {
    const end = keeper.current?.end();
    keeper.current = null;
    return end;
  };

  const stop = () => {
    if (source.kind !== 'camera') {
      // The recording's judging ends with this, and its end keeps the set.
      stopped.current = true;
      setPhase('done');
      return;
    }
    board.end();
    tally.hold();
    const end = endSet();
    // The camera feeds the set's video, so it closes only once the recording has stopped.
    if (end) void end.recorded.then(() => setPhase('done'));
    else setPhase('done');
  };

  // A set ends on every way out of it: Stop, the board closing, and the app leaving the screen.
  const latest = useRef({ stop, endSet, phase });
  latest.current = { stop, endSet, phase };
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && latest.current.phase === 'counting') latest.current.stop();
    });
    return () => {
      subscription.remove();
      latest.current.endSet();
    };
  }, []);

  const flip = () => {
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    localStorage.setItem(FACING_KEY, next);
    setFacing(next);
  };

  /** A tap on the scoreboard counts by hand, and the part it changed lights. */
  const byHand = (count: () => void) => {
    count();
    redraw();
  };

  const live = source.kind === 'camera' && phase !== 'done';
  const playing = source.kind === 'recording' && (phase === 'counting' || phase === 'done');
  const running = live || (playing && phase === 'counting');
  const status = failure ?? said?.line ?? (running ? `${fps} fps` : '');
  const chips = [
    ...(board.ballCheck ? [t('board.chip')('ball', ballUnit)] : []),
    t('board.chip')('finder', FINDER_UNIT),
    t('board.chip')('pose', 'CPU'),
    ...(sender.state === 'none' ? [] : [sender.state === 'linked' ? t('pair.displayLinked') : t('board.linking')]),
  ].join(' · ');

  return (
    <View style={styles.screen}>
      <Bar onHome={onHome}>
        <IconButton small label={t('nav.settings')} onPress={onSettings}>
          <Gear />
        </IconButton>
      </Bar>

      <View style={[styles.station, wide && styles.stationWide]}>
        <View style={styles.camera}>
          <View style={styles.frame} onLayout={(e) => setArea(e.nativeEvent.layout)}>
            <View
              style={[
                styles.viewport,
                { left: viewport.x, top: viewport.y, width: viewport.width, height: viewport.height },
                known && styles.fitted,
              ]}
            >
              {live && cameraReady ? (
                <CameraFeed key={facing} facing={facing} />
              ) : playing ? (
                <ClipView vision={wallballVision} style={StyleSheet.absoluteFill} />
              ) : image ? (
                <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              ) : null}
              <Overlay fit={fit} board={board} notice={said?.banner ?? null} showPose={running} />
              <View style={StyleSheet.absoluteFill} {...responder.panHandlers} />
              {phase === 'done' ? (
                <View style={styles.prompt}>
                  <Button label={t('board.startCamera')} onPress={onLive} primary large icon={<CameraIcon colour={COLOURS.onChalk} />} />
                  <Button label={t('board.playRecording')} onPress={onRecording} icon={<Film />} />
                </View>
              ) : null}
              <Corners width={viewport.width} height={viewport.height} />
            </View>
          </View>

          {status || running ? (
            <View style={styles.camBar}>
              {running ? (
                <IconButton label={t('board.stop')} onPress={stop}>
                  <StopSquare />
                </IconButton>
              ) : null}
              <Text style={styles.camStatus}>{status}</Text>
              {phase === 'counting' && board.ballCheck ? (
                <IconButton label={t('board.refind')} onPress={() => void find()}>
                  <Aim />
                </IconButton>
              ) : null}
              {live && phase !== 'counting' ? (
                <IconButton label={t('board.flip')} onPress={flip}>
                  <Flip />
                </IconButton>
              ) : null}
            </View>
          ) : null}

          {phase === 'choosing' || phase === 'searching' ? (
            <View style={styles.setup}>
              <Button label={t('board.go')} onPress={go} primary tall icon={<Play colour={COLOURS.onChalk} />} />
              <Button label={t('board.find')} onPress={() => void find()} tall icon={<Aim />} />
            </View>
          ) : null}
        </View>

        <View style={wide ? styles.side : styles.under}>
          <Scoreboard
            tally={tally}
            required={board.required}
            onRequired={(which) => {
              board.setRequired(which);
              sender.resend();
              redraw();
            }}
            byHand={byHand}
          />

          <View style={styles.foot}>
            <Text style={styles.footText}>{chips}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** The board's place while the app learns where the ball model runs, a check of some seconds once after each install. */
export function BoardStarting({ onHome, onSettings }: { onHome: () => void; onSettings: () => void }) {
  return (
    <View style={styles.screen}>
      <Bar onHome={onHome}>
        <IconButton small label={t('nav.settings')} onPress={onSettings}>
          <Gear />
        </IconButton>
      </Bar>
      <View style={styles.station}>
        <View style={styles.camera}>
          <View style={[styles.frame, styles.starting]}>
            <Text style={styles.startingText} accessibilityLiveRegion="polite">
              {t('board.starting')}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** The scoreboard: the no-reps, the count, the division and its plates, and the set clock with Reset. */
function Scoreboard({
  tally,
  required,
  onRequired,
  byHand,
}: {
  tally: Tally;
  required: Target | null;
  onRequired: (which: Target) => void;
  byHand: (count: () => void) => void;
}) {
  const [tallyWidth, setTallyWidth] = useState(0);
  const [reset, setReset] = useState<'idle' | 'armed' | 'nothing'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  // A lit part goes out on its own, also when nothing else redraws the board, as after a set ends.
  const [, setTick] = useState(0);
  const litUntil = Math.max(0, ...[...tally.lit.values()].map((light) => light.at + LIT_MS));
  useEffect(() => {
    const left = litUntil - Date.now();
    if (left <= 0) return undefined;
    const timer = setTimeout(() => setTick((n) => n + 1), left + 20);
    return () => clearTimeout(timer);
  });

  const now = Date.now();
  const lit = (part: LitPart) => tally.litAt(part, now);
  const elapsed = tally.clock.elapsedMs(now);
  const pace = paceOf(elapsed, tally.count);

  // Two taps on the button itself, as the PWA asks: no dialog covers the count, and walking away undoes it.
  const askReset = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    if (reset === 'armed') {
      setReset('idle');
      byHand(() => tally.reset());
      return;
    }
    const next = tally.empty ? 'nothing' : 'armed';
    setReset(next);
    resetTimer.current = setTimeout(() => setReset('idle'), next === 'armed' ? RESET_ARMED_MS : NOTHING_TO_RESET_MS);
  };

  const fault = (part: 'targetFault' | 'moveFault', n: number, what: string, icon: React.ReactNode, count: () => void) => (
    <Pressable style={[styles.fault, lit(part) && styles.faultLit]} onPress={() => byHand(count)} accessibilityRole="button">
      {icon}
      <View>
        <Text style={styles.faultN}>{n}</Text>
        <Text style={styles.faultWhat}>{what}</Text>
      </View>
    </Pressable>
  );

  const plate = (which: Target, label: string) => {
    const light = lit(which);
    return (
      <Pressable style={styles.plateButton} onPress={() => byHand(() => tally.hitByHand(which, required))} accessibilityLabel={label}>
        <Plate
          size={TAP - 10}
          colour={which === required ? COLOURS.chalk : COLOURS.rule}
          fill={light ? (light.good ? COLOURS.rep : COLOURS.norep) : 'transparent'}
        />
      </Pressable>
    );
  };

  const pill = (which: Target, label: string) => (
    <Pressable style={[styles.pill, which === required && styles.pillOn]} onPress={() => onRequired(which)}>
      <Text style={[styles.pillText, which === required && styles.pillTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.scoreboard}>
      <View style={styles.board}>
        <View style={styles.faults}>
          {fault('targetFault', tally.targetFaults, t('board.target'), <TargetFault />, () => tally.targetFault())}
          {fault('moveFault', tally.moveFaults, t('board.squat'), <SquatFault />, () => tally.noRep())}
        </View>
        <View style={styles.tally} onLayout={(e) => setTallyWidth(e.nativeEvent.layout.width)}>
          <Text
            style={[styles.count, { fontSize: Math.min(9 * REM, 0.66 * tallyWidth) || 4 * REM }, lit('count') && styles.countLit]}
            numberOfLines={1}
          >
            {tally.count}
          </Text>
          <Text style={styles.tallyWhat}>{t('board.reps')}</Text>
        </View>
        <View style={styles.targets}>
          <View style={styles.targetRow}>
            {pill('upper', t('board.upper'))}
            {plate('upper', t('board.hitUpper'))}
          </View>
          <View style={styles.targetRow}>
            {pill('lower', t('board.lower'))}
            {plate('lower', t('board.hitLower'))}
          </View>
        </View>
      </View>

      <View style={styles.clockRow}>
        <View style={styles.clocks}>
          <Text style={styles.clockLabel}>{t('board.time')}</Text>
          <Text style={styles.clockValue}>{clockText(elapsed)}</Text>
          {pace ? (
            <Text style={styles.pace}>
              {t('board.pace')(decimal(pace.msPerRep / 1000, 1), STATION_REPS, pace.targetAtMs === null ? null : clockText(pace.targetAtMs))}
            </Text>
          ) : null}
        </View>
        <Pressable style={[styles.reset, reset === 'armed' && styles.resetArmed]} onPress={askReset} accessibilityRole="button">
          <Text style={[styles.resetText, reset === 'armed' && styles.resetArmedText]} numberOfLines={1}>
            {reset === 'armed' ? t('board.tapToClear') : reset === 'nothing' ? t('board.nothingToReset') : t('board.reset')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Black corners over the picture, so it shows rounded as the PWA's: the camera's preview and a clip's frames are
 * surfaces, which a parent's rounded clip does not cut.
 */
function Corners({ width: w, height: h }: { width: number; height: number }) {
  if (w <= 0 || h <= 0) return null;
  const r = Math.min(CORNER, w / 2, h / 2);
  const d =
    `M0 0H${w}V${h}H0Z` +
    `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={d} fill={COLOURS.black} fillRule="evenodd" />
    </Svg>
  );
}

/** The camera's preview, with each frame handed to the board's pipeline through `cameraHandlers`. */
function CameraFeed({ facing }: { facing: Facing }) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(facing === 'user' ? 'front' : 'back');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  // A camera session opened behind the lock screen never streams, so the session follows the app's state.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  const videoOutput = useVideoOutput({ targetResolution: VIDEO_SIZE, targetBitRate: VIDEO_BIT_RATE, enableAudio: false });
  useEffect(() => {
    cameraVideo.output = videoOutput;
    return () => {
      if (cameraVideo.output === videoOutput) cameraVideo.output = null;
    };
  }, [videoOutput]);

  const frameOutput = useFrameOutput({
    pixelFormat: 'rgb',
    targetResolution: { width: 1280, height: 720 },
    onFrame(frame) {
      'worklet';
      try {
        const [plane] = frame.getPlanes();
        if (!plane) throw new Error(`the camera frame has no plane, as ${frame.pixelFormat}`);
        const result = wallballVision.cameraFrame(
          plane.getPixelBuffer(),
          plane.bytesPerRow,
          frame.width,
          frame.height,
          frame.orientation,
          frame.isMirrored,
          frame.timestamp / 1e6,
        );
        scheduleOnRN(onCameraFrame, result);
      } catch (err) {
        scheduleOnRN(onCameraError, String(err));
      } finally {
        frame.dispose();
      }
    },
  });

  if (!hasPermission || device == null) return null;
  // The preview streams 4:3 and the judged frames 16:9, both from the sensor's middle. In a view of the frames' shape,
  // cover shows the preview's middle, which is what the frames hold, so the overlay sits on what it judged.
  // The activity takes a turn of the phone without restarting, and only a TextureView preview turns with the display then.
  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={foreground}
      outputs={[frameOutput, videoOutput]}
      constraints={[{ fps: 30 }]}
      resizeMode="cover"
      implementationMode="compatible"
    />
  );
}

/** Writes the set's verdicts beside the app's other reports, for checks over adb against the PWA's judge logs. */
function saveSet(board: PipelineBoard, name: string, ballUnit: string): void {
  const verdicts = board.verdicts.map((v) => ({ endMs: v.rep.endMs, valid: v.valid, reason: v.reason, target: v.target }));
  const set = {
    name,
    required: board.required,
    ballUnit,
    ballInput: board.ballModel.input,
    valid: verdicts.filter((v) => v.valid).length,
    targetFaults: verdicts.filter((v) => !v.valid && v.reason !== 'depth').length,
    moveFaults: verdicts.filter((v) => !v.valid && v.reason === 'depth').length,
    verdicts,
  };
  wallballVision.saveText(`set-${name.replace(/\.mp4$/, '')}-${board.required ?? 'unpicked'}.json`, JSON.stringify(set));
  console.log(`SET ${JSON.stringify({ ...set, verdicts: undefined })}`);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOURS.black },
  station: { flex: 1, gap: 10, paddingHorizontal: 10 },
  stationWide: { flexDirection: 'row', gap: 12, paddingBottom: 8 },
  under: { gap: 10 },
  side: { width: WIDE_SIDE, justifyContent: 'center', gap: 10 },
  camera: { flex: 1, gap: 8 },
  frame: { flex: 1, minHeight: 11 * REM },
  viewport: { position: 'absolute', backgroundColor: COLOURS.graphite, borderRadius: CORNER, overflow: 'hidden' },
  fitted: { backgroundColor: COLOURS.black },
  prompt: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
    backgroundColor: 'rgba(20,22,24,0.82)',
  },
  starting: { alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: COLOURS.graphite, borderRadius: CORNER },
  startingText: { color: COLOURS.chalk, fontSize: 1.05 * REM, fontWeight: '600', textAlign: 'center' },
  camBar: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP },
  camStatus: { flex: 1, color: COLOURS.steel, fontSize: 15, lineHeight: 19, textAlign: 'center' },
  setup: { flexDirection: 'row', gap: 8 },
  scoreboard: { gap: 4, paddingTop: 8, paddingHorizontal: 12, paddingBottom: 6, backgroundColor: COLOURS.graphite, borderRadius: CORNER },
  // The faults take the room their words need, and the count the rest; the count's label sits on the squat's baseline.
  board: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  faults: { gap: 6, alignItems: 'flex-start' },
  fault: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP, paddingHorizontal: 5, marginHorizontal: -5, borderRadius: 8 },
  faultLit: { backgroundColor: 'rgba(255,82,72,0.35)' },
  faultN: { color: COLOURS.chalk, fontFamily: CONDENSED, fontSize: 26, fontWeight: '800', lineHeight: FAULT_N_LINE },
  faultWhat: { color: COLOURS.steel, fontFamily: CONDENSED, fontSize: 13, lineHeight: FAULT_WHAT_LINE },
  tally: { flex: 1, alignItems: 'center', paddingBottom: (TAP - FAULT_N_LINE - FAULT_WHAT_LINE) / 2 },
  count: { color: COLOURS.chalk, fontFamily: CONDENSED, fontWeight: '800', includeFontPadding: false, letterSpacing: -1 },
  countLit: { color: COLOURS.rep },
  tallyWhat: { marginTop: 2, color: COLOURS.steel, fontSize: 13, lineHeight: FAULT_WHAT_LINE },
  targets: { gap: 6, minWidth: SIDE },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { flex: 1, minHeight: TAP, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLOURS.rule, borderRadius: 999 },
  pillOn: { backgroundColor: COLOURS.chalk, borderColor: COLOURS.chalk },
  pillText: { color: COLOURS.steel, fontFamily: CONDENSED, fontSize: 15, fontWeight: '600' },
  pillTextOn: { color: COLOURS.onChalk },
  plateButton: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLOURS.rule },
  clocks: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10 },
  clockLabel: { color: COLOURS.steel, fontSize: 13 },
  clockValue: { color: COLOURS.chalk, fontFamily: CONDENSED, fontSize: 28, fontWeight: '800', lineHeight: 31 },
  pace: { flexBasis: '100%', color: COLOURS.steel, fontSize: 13, lineHeight: 16 },
  reset: {
    width: SIDE,
    minHeight: TAP,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOURS.graphite,
    borderWidth: 1.5,
    borderColor: COLOURS.rule,
    borderRadius: 10,
  },
  resetText: { color: COLOURS.chalk, fontSize: 15, fontWeight: '700' },
  resetArmed: { borderColor: COLOURS.norep },
  resetArmedText: { color: COLOURS.norep },
  foot: { paddingBottom: 6 },
  footText: { color: COLOURS.steel, fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
