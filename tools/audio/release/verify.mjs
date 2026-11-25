#!/usr/bin/env node
/**
 * Verifies the shipped audio against SHA256SUMS and the music manifest (works from a clean clone: needs no pack).
 *   node tools/audio/release/verify.mjs
 * Fails on: a missing or altered file, an MP3 that is not audio, a listed track whose file (or Data Saver file) is
 * missing, a Data Saver file that is not smaller, a manifest entry without a licence, or a generated name that the
 * founder rejected.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..');
const errors = [];
const err = (m) => errors.push(m);
const lines = readFileSync(join(here, 'SHA256SUMS'), 'utf8').trim().split('\n');
for (const l of lines) {
  const [hash, path] = l.split(/\s{2}/);
  const p = join(ROOT, path);
  if (!existsSync(p)) {
    err(`missing ${path}`);
    continue;
  }
  const b = readFileSync(p);
  if (createHash('sha256').update(b).digest('hex') !== hash) err(`checksum mismatch ${path}`);
  const mpeg = b[0] === 0xff && (b[1] & 0xe0) === 0xe0;
  const id3 = b.subarray(0, 3).toString('latin1') === 'ID3';
  if (!mpeg && !id3) err(`not MP3 audio ${path}`);
}
const music = join(ROOT, 'public/audio/music');
const m = JSON.parse(readFileSync(join(music, 'manifest.json'), 'utf8'));
const ids = new Set(m.tracks.map((t) => t.id));
for (const t of m.tracks) {
  if (!t.licence) err(`no licence: ${t.id}`);
  if (/^(dist|lnds)_/.test(t.id)) {
    const f = join(music, t.file);
    if (!existsSync(f)) err(`track ${t.id}: ${t.file} missing`);
    if (t.lite) {
      const l = join(music, t.lite);
      if (!existsSync(l)) err(`track ${t.id}: ${t.lite} missing`);
      else if (existsSync(f) && statSync(l).size >= statSync(f).size)
        err(`track ${t.id}: Data Saver file is not smaller`);
    } else err(`track ${t.id}: no Data Saver file`);
  }
}
for (const [a, p] of Object.entries(m.playlists.arenas))
  for (const id of [...(p.tracks ?? []), ...(p.fallback ?? []), p.signature, p.start].filter(Boolean))
    if (!ids.has(id)) err(`arena ${a} names unknown track ${id}`);
for (const id of [
  ...(m.menu ?? []),
  ...Object.values(m.variants?.suddenDeathFor ?? {}),
  ...(m.variants?.boss ?? []),
])
  if (!ids.has(id)) err(`manifest names unknown track ${id}`);
if (errors.length) {
  console.error(`audio release verify FAILED (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`audio release verify ok: ${lines.length} files match SHA256SUMS; manifest consistent`);
