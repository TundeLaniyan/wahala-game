#!/usr/bin/env node
/**
 * Builds the founder-approved audio release into public/audio/ from the two candidate packs (decision AU4).
 *   node tools/audio/release/build_release.mjs [--check]
 * Reads release.config.json, copies the approved MP3s (standard + Data Saver) and the two result stingers, rewrites the
 * WAHALA! entries of public/audio/music/manifest.json (the Pixabay entries are never touched), writes slots.json,
 * SHA256SUMS and audio-release.json. Idempotent: running it twice changes nothing. --check builds in memory and fails
 * when the committed files differ (CI-friendly).
 * Needs the district pack MP3s, which are built from the founder's ZIP by tools/audio/production/build_districts.sh
 * (they are git-ignored; the committed public/audio files are the shipped truth, pinned by SHA256SUMS).
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..');
const AUDIO = join(ROOT, 'public', 'audio');
const MUSIC = join(AUDIO, 'music');
const PACKS = join(here, '..', 'candidates');
const cfg = JSON.parse(readFileSync(join(here, 'release.config.json'), 'utf8'));
const check = process.argv.includes('--check');

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const rj = (p) => JSON.parse(readFileSync(p, 'utf8'));
const pack = (name) => ({ dir: join(PACKS, name), manifest: rj(join(PACKS, name, 'manifest.json')) });
const WAHALA_ID = /^(dist|lnds)_/;

const dist = pack(cfg.districts.pack);
const lnds = pack(cfg.lnds.pack);
const byId = (m, id) => {
  const t = m.manifest.tracks.find((x) => x.id === id);
  if (!t) throw new Error(`track ${id} is not in pack ${m.dir}`);
  return t;
};

/** files to install: [source, destination] (destinations relative to public/audio) */
const copies = [];
const need = (src) => {
  if (!existsSync(src))
    throw new Error(`missing ${src}: build the pack first (tools/audio/production/build_districts.sh)`);
  return src;
};
const add = (srcDir, rel, destRel) => copies.push([need(join(srcDir, rel)), destRel]);

const tracks = [];
const arenas = {};
const suddenDeathFor = {};
const approvedFields = (t, extra) => ({
  id: t.id,
  title: t.title.replace(/, start point [A-D]$/, (m) => m), // keep the pack's title
  artist: null,
  source: t.source,
  licence: cfg.licence,
  file: t.file,
  ...(t.lite ? { lite: t.lite } : {}),
  approved: true,
  gain: 1,
  loudnessLufs: t.loudnessLufs,
  ...extra,
});

for (const [family, s] of Object.entries(cfg.districts.songs)) {
  const ids = cfg.districts.shipTracks.map((x) => `dist_${family}_${x}`);
  for (const id of ids) {
    const t = byId(dist, id);
    tracks.push(approvedFields(t, { startAt: t.startAt, grid: t.grid, family }));
  }
  const sd = byId(dist, `dist_${family}_sd`);
  tracks.push(approvedFields(sd, { grid: sd.grid, family }));
  suddenDeathFor[family] = sd.id;
  arenas[s.arena] = { tracks: ids, start: ids[0], signature: null, fallback: s.pixabayFallback };
  for (const f of new Set([...ids, sd.id].map((id) => byId(dist, id).file))) {
    add(dist.dir, f, `music/${f}`);
    add(dist.dir, `lite/${f}`, `music/lite/${f}`);
  }
}
for (const id of [cfg.lnds.menu, ...cfg.lnds.boss]) {
  const t = byId(lnds, id);
  const boss = cfg.lnds.boss.includes(id);
  tracks.push(
    approvedFields(t, boss ? { syncGroup: cfg.lnds.bossSyncGroup, grid: { bpm: 110, first: 0 } } : {}),
  );
  add(lnds.dir, t.file, `music/${t.file}`);
  add(lnds.dir, `lite/${t.file}`, `music/lite/${t.file}`);
}
const slots = {};
const packSlots = rj(join(lnds.dir, 'slots.json')).slots;
for (const [slot, id] of Object.entries(cfg.lnds.stingers)) {
  const ps = Object.values(packSlots).find((x) => x.file === `${id}.mp3`);
  if (!ps) throw new Error(`stinger ${id} is not in ${cfg.lnds.pack}/slots.json`);
  add(lnds.dir, ps.file, ps.file);
  slots[slot] = {
    file: ps.file,
    license: `${cfg.licence}. Derived from the founder-selected Gemini-generated song "Lagos No Dey Sleep".`,
    source: ps.source,
    gain: ps.gain ?? 1,
  };
}

// ---- manifest: Pixabay entries untouched, WAHALA! entries replaced
const mpath = join(MUSIC, 'manifest.json');
const live = rj(mpath);
const keep = live.tracks.filter((t) => !WAHALA_ID.test(t.id));
const out = {
  ...live,
  tracks: [...keep, ...tracks],
  menu: [cfg.lnds.menu],
  variants: { suddenDeathFor, boss: cfg.lnds.boss },
};
for (const [a, v] of Object.entries(arenas)) out.playlists.arenas[a] = v;
delete out.variants.suddenDeath;

const sums = [];
const files = [];
const files_for = (rel) => {
  const p = join(AUDIO, rel);
  return { rel: `public/audio/${rel}`, bytes: statSync(p).size, sha256: sha(p) };
};

if (!check) {
  mkdirSync(join(MUSIC, 'lite'), { recursive: true });
  for (const [src, dest] of copies) copyFileSync(src, join(AUDIO, dest));
  writeFileSync(mpath, `${JSON.stringify(out, null, 2)}\n`);
  writeFileSync(join(AUDIO, 'slots.json'), `${JSON.stringify({ slots }, null, 2)}\n`);
}
const shipped = [...new Set(copies.map(([, d]) => d))].sort();
for (const rel of shipped) files.push(files_for(rel));
for (const f of files) sums.push(`${f.sha256}  ${f.rel}`);
const sumsText = `${sums.join('\n')}\n`;
const rel = {
  _comment:
    'Integration manifest of the founder-approved audio release (decision AU4). Generated by build_release.mjs; verify with `npm run audio:release-verify`.',
  approvedOn: cfg.approvedOn,
  licence: cfg.licence,
  files: files.map((f) => ({
    ...f,
    kind: f.rel.includes('/lite/') ? 'music-lite' : f.rel.includes('/music/') ? 'music' : 'sting',
  })),
  arenaMap: Object.fromEntries(
    Object.entries(arenas).map(([a, v]) => [a, { tracks: v.tracks, start: v.start, fallback: v.fallback }]),
  ),
  suddenDeathFor,
  boss: cfg.lnds.boss,
  menu: cfg.lnds.menu,
  stingers: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, v.file])),
  notShipped: cfg.lnds.notShipped,
  totals: {
    music: files
      .filter((f) => f.rel.includes('/music/') && !f.rel.includes('/lite/'))
      .reduce((n, f) => n + f.bytes, 0),
    musicLite: files.filter((f) => f.rel.includes('/lite/')).reduce((n, f) => n + f.bytes, 0),
    stingers: files.filter((f) => !f.rel.includes('/music/')).reduce((n, f) => n + f.bytes, 0),
  },
};
const relText = `${JSON.stringify(rel, null, 2)}\n`;
const sumsPath = join(here, 'SHA256SUMS');
const relPath = join(here, 'audio-release.json');
if (check) {
  const bad = [];
  if (readFileSync(sumsPath, 'utf8') !== sumsText) bad.push('SHA256SUMS');
  if (readFileSync(relPath, 'utf8') !== relText) bad.push('audio-release.json');
  if (JSON.stringify(rj(mpath)) !== JSON.stringify(out)) bad.push('public/audio/music/manifest.json');
  if (bad.length) {
    console.error(`release check FAILED: ${bad.join(', ')} differ from a fresh build`);
    process.exit(1);
  }
  console.log(`release check ok: ${shipped.length} files`);
} else {
  writeFileSync(sumsPath, sumsText);
  writeFileSync(relPath, relText);
  console.log(
    `release built: ${shipped.length} files (${(rel.totals.music / 1e6).toFixed(1)} MB music, ${(rel.totals.musicLite / 1e6).toFixed(1)} MB Data Saver, ${(rel.totals.stingers / 1e3).toFixed(0)} kB stingers)`,
  );
}
