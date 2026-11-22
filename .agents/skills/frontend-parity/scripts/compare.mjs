#!/usr/bin/env node
/**
 * Compares what the PWA and the Android app draw by hand: every SVG shape written with literal numbers, and the
 * colour tokens. Run it from the repository root. It prints each shape that one frontend draws and the other does not,
 * and each colour that differs, then exits 1 when it found any.
 *
 * A shape computed from variables is skipped: compare those on screen. A shape that only one frontend has by design
 * (a screen the other app lacks) still prints; the skill's table says which.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PWA_FILES = ['index.html'];
const ANDROID_DIR = 'mobile/app/ui';
/** PWA drawings whose shapes `src/demo-scene.ts` moves in both apps: their literals are only a first frame. */
const MOVING = ['home-demo'];
/** PWA symbols for a feature the Android app has another way, as the skill's table of intended differences says. */
const PWA_ONLY = ['icon-save'];
const GEOMETRY = [
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'width',
  'height',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
];

/** A path's commands and numbers, one token each, so spacing and number spelling do not count. */
function tokens(d) {
  return (d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [])
    .map((t) => (/[a-zA-Z]/.test(t) ? t : String(Number(t))))
    .join(' ');
}

function signature(type, attrs) {
  const parts = GEOMETRY.filter((name) => name in attrs).map((name) => {
    const value = attrs[name];
    return `${name}=${name === 'd' || name === 'points' ? tokens(value) : String(Number(value))}`;
  });
  return `${type.toLowerCase()} ${parts.join(' ')}`;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function ranges(text, ids, end) {
  return ids.flatMap((id) => {
    const start = text.indexOf(`id="${id}"`);
    return start < 0 ? [] : [[start, text.indexOf(end, start)]];
  });
}

function pwaShapes(file) {
  const text = readFileSync(file, 'utf8');
  const moving = [...ranges(text, MOVING, '</svg>'), ...ranges(text, PWA_ONLY, '</symbol>')];
  const shapes = [];
  for (const m of text.matchAll(/<(path|circle|rect|line|polyline|polygon)\b([^>]*?)\/?>/g)) {
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    shapes.push({
      key: signature(m[1], attrs),
      at: `${file}:${lineOf(text, m.index)}`,
      moves: moving.some(([from, to]) => m.index > from && m.index < to),
    });
  }
  return shapes;
}

/** The values a JSX prop can take: a literal, a string constant of the file, or either side of a ternary of those. */
function propValues(braced, constants) {
  const value = braced.trim();
  if (/^-?[\d.]+$/.test(value)) return [value];
  if (/^'[^']*'$|^"[^"]*"$/.test(value)) return [value.slice(1, -1)];
  const names = value.match(/^[\w.]+\s*\?\s*(\w+)\s*:\s*(\w+)$/)?.slice(1) ?? [value];
  return names.every((name) => constants.has(name)) ? names.map((name) => constants.get(name)) : null;
}

function androidShapes(file) {
  const text = readFileSync(file, 'utf8');
  const constants = new Map([...text.matchAll(/^const (\w+) = '([^']*)';/gm)].map((m) => [m[1], m[2]]));
  const shapes = [];
  for (const m of text.matchAll(/<(Path|Circle|Rect|Line|Polyline|Polygon)\b([^>]*?)\/?>/gs)) {
    let variants = [{}];
    let computed = false;
    for (const a of m[2].matchAll(/([\w]+)=(?:"([^"]*)"|\{([^}]*)\})/g)) {
      const [, name, quoted, braced] = a;
      if (!GEOMETRY.includes(name)) continue;
      const values = quoted !== undefined ? [quoted] : propValues(braced, constants);
      if (!values) computed = true;
      else variants = variants.flatMap((attrs) => values.map((value) => ({ ...attrs, [name]: value })));
    }
    if (computed) continue;
    for (const attrs of variants)
      shapes.push({ key: signature(m[1], attrs), at: `${file}:${lineOf(text, m.index)}` });
  }
  return shapes;
}

function oneSided(mine, theirs) {
  const other = new Set(theirs.map((s) => s.key));
  return mine.filter((s) => !s.moves && !other.has(s.key));
}

const hex = (value) => {
  const v = value.trim().toLowerCase();
  return /^#[0-9a-f]{3}$/.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join('')}` : v;
};
const camel = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());

function colourDifferences() {
  const css = readFileSync('src/styles/base.css', 'utf8');
  const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
  const pwa = new Map(
    [...root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((m) => [camel(m[1]), hex(m[2])]),
  );
  const theme = readFileSync(join(ANDROID_DIR, 'theme.ts'), 'utf8');
  const block = theme.match(/COLOURS\s*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? '';
  const android = new Map(
    [...block.matchAll(/(\w+):\s*'(#[0-9a-fA-F]{3,8})'/g)].map((m) => [m[1], hex(m[2])]),
  );
  const out = [];
  for (const [name, value] of pwa) {
    if (!android.has(name)) out.push(`only the PWA has --${name} ${value}`);
    else if (android.get(name) !== value) out.push(`${name}: PWA ${value}, Android ${android.get(name)}`);
  }
  return out;
}

const pwa = PWA_FILES.flatMap(pwaShapes);
const android = readdirSync(ANDROID_DIR)
  .filter((f) => f.endsWith('.tsx'))
  .flatMap((f) => androidShapes(join(ANDROID_DIR, f)));

const report = [
  ['Shapes only the PWA draws', oneSided(pwa, android).map((s) => `${s.at}  ${s.key}`)],
  ['Shapes only the Android app draws', oneSided(android, pwa).map((s) => `${s.at}  ${s.key}`)],
  ['Colours that differ', colourDifferences()],
];
for (const [title, lines] of report) {
  console.log(`${title}: ${lines.length}`);
  for (const line of lines) console.log(`  ${line}`);
}
process.exit(report.some(([, lines]) => lines.length) ? 1 : 0);
