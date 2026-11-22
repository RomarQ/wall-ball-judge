#!/usr/bin/env node
/**
 * Fetches every model file into public/models, for a build that serves them
 * itself (`VITE_MODELS=local`), a gym with no signal, or the evaluation page.
 *
 * The pose models come from Google's storage. The trained detectors are
 * either committed under public/models already, when models/manifest.json
 * says `repo`, and are then only verified, or fetched from the Hugging Face
 * Hub at the manifest's revision. Either way their sha256 is checked against
 * the manifest, so a wrong or tampered file never lands beside the app.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'models');
const manifest = JSON.parse(await readFile(join(root, 'models', 'manifest.json'), 'utf8'));

const GOOGLE = 'https://storage.googleapis.com/mediapipe-models';
const files = [
  {
    name: 'pose_landmarker_lite.task',
    url: `${GOOGLE}/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`,
  },
  {
    name: 'pose_landmarker_full.task',
    url: `${GOOGLE}/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task`,
  },
  ...Object.entries(manifest.files).map(([name, meta]) => ({
    name,
    url:
      manifest.source === 'hub'
        ? `https://huggingface.co/${manifest.repo}/resolve/${manifest.revision}/${name}`
        : null,
    sha256: meta.sha256,
    bytes: meta.bytes,
  })),
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

await mkdir(out, { recursive: true });
for (const file of files) {
  const path = join(out, file.name);
  const present = await stat(path).catch(() => null);
  if (present && file.sha256 && sha256(await readFile(path)) === file.sha256) {
    console.log(`${file.name}: already here and verified`);
    continue;
  }
  if (!file.url) {
    throw new Error(
      `${file.name}: the manifest says it is committed in public/models, but it is missing or differs`,
    );
  }
  process.stdout.write(`${file.name}: fetching... `);
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`${file.url} answered ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (file.sha256 && sha256(buf) !== file.sha256) {
    throw new Error(`${file.name}: sha256 mismatch, the manifest says ${file.sha256}`);
  }
  if (file.bytes && buf.length !== file.bytes) {
    throw new Error(`${file.name}: ${buf.length} bytes, the manifest says ${file.bytes}`);
  }
  await writeFile(path, buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
}
console.log(`\nmodels in ${out}. Build with VITE_MODELS=local to serve them from the app.`);
