/**
 * Feeds a judge log back through the board's judge and lists where its
 * decisions part from the logged ones, frame by frame.
 *
 * Each look's boxes reach the judge before the frame the log says came after
 * them, as they reached the board. The thresholds are the log's own.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { Target } from '../src/ball';
import { Board } from '../src/board';
import type { DepthOptions } from '../src/depth';
import type { LookTicket } from '../src/frame-judge';
import { landmarksFrom, loggedVerdict, type JudgeLogData, type LoggedLook } from '../src/judge-log';

/** The side of the window a look reads, as the 416 ball model's input gives it. */
const WINDOW_SIDE = 416;

export interface Excerpt extends JudgeLogData {
  /** Set on a committed excerpt: its landmarks keep 9 digits, which hold a float32 exactly. */
  float32?: boolean;
}

export function readLog(path: string): Excerpt {
  const raw = readFileSync(path);
  return JSON.parse((path.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')) as Excerpt;
}

export interface Replayed {
  /** One line per frame, look or verdict whose decision differs, the first first. */
  differences: string[];
  valid: number;
  noRep: number;
  /** The board, as the replay left it, for a test to look further. */
  board: Board;
}

/** Replays `log` up to frame `until`, judging the division `required` in place of the logged one when it is given. */
export function replay(log: Excerpt, until = log.frames.length, required?: Target | null): Replayed {
  const config = log.config as { depth: DepthOptions; ball: { bite: number; windows: boolean } };
  let valid = 0;
  let noRep = 0;
  const board = new Board({
    depth: config.depth,
    ball: { bite: config.ball.bite },
    onVerdict: (verdict) => {
      if (verdict.valid) valid += 1;
      else noRep += 1;
      return valid;
    },
  });
  const { judge } = board;
  if (required !== undefined) board.setRequired(required);
  const answers = new Map<number, LoggedLook[]>();
  for (const look of log.looks) {
    if (look.after === undefined) continue;
    answers.set(look.after, [...(answers.get(look.after) ?? []), look]);
  }
  const tickets = new Map<number, LookTicket>();
  const differences: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  for (let i = 0; i < Math.min(until, log.frames.length); i += 1) {
    for (const look of answers.get(i) ?? []) {
      const ticket = tickets.get(look.id);
      if (!ticket) {
        differences.push(`look ${look.id}: answered before frame ${i}, but the replay never started it`);
        continue;
      }
      if (look.found) board.answer(ticket, look.found);
      else judge.abandon(ticket);
    }
    const f = log.frames[i];
    if (f.target) {
      judge.target.lines = { ...f.target.lines };
      if (required === undefined) board.setRequired(f.target.required);
      board.targetX = f.target.x;
      board.plates = f.target.plates;
    }
    const landmarks = landmarksFrom(
      f.landmarks && log.float32 ? f.landmarks.map((v) => Math.fround(v)) : f.landmarks,
    );
    const out = board.step({
      tMs: f.tMs,
      width: f.w,
      height: f.h,
      landmarks,
      armed: f.armed,
      ballCheck: f.mode === 'target',
      windowSide: config.ball.windows ? WINDOW_SIDE : null,
    });
    const depth = out.depth.ok ? out.depth.depth : null;
    if (depth !== f.depth) differences.push(`frame ${i} (${f.tMs} ms): depth ${depth} against ${f.depth}`);
    if (judge.counter.state !== f.state)
      differences.push(`frame ${i} (${f.tMs} ms): state ${judge.counter.state} against ${f.state}`);
    if ((out.look !== null) !== (f.look !== undefined)) {
      differences.push(
        `frame ${i} (${f.tMs} ms): look ${out.look ? 'started' : 'not started'} against the log`,
      );
    } else if (out.look && f.look !== undefined) {
      tickets.set(f.look, out.look);
      const logged = log.looks[f.look].window;
      if (!same(out.look.window, logged))
        differences.push(
          `frame ${i}: look window ${JSON.stringify(out.look.window)} against ${JSON.stringify(logged)}`,
        );
    }
    const verdict = out.verdict ? loggedVerdict(out.verdict) : undefined;
    if (!same(verdict, f.verdict))
      differences.push(
        `frame ${i} (${f.tMs} ms): verdict ${JSON.stringify(verdict)} against ${JSON.stringify(f.verdict)}`,
      );
  }
  if (until >= log.frames.length && log.end) {
    const last = board.end(log.end.tMs);
    const verdict = last ? loggedVerdict(last) : null;
    if (!same(verdict, log.end.verdict))
      differences.push(`end: verdict ${JSON.stringify(verdict)} against ${JSON.stringify(log.end.verdict)}`);
  }
  return { differences, valid, noRep, board };
}
