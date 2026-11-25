#!/usr/bin/env node
/**
 * Copies the UNAPPROVED audition candidates into the git-ignored public/audio/candidates/ so `npm run dev` (or a local
 * preview build) can play them with ?audiodraft. Never commit the staged folder; never run this in CI or release.
 *   node tools/audio/candidates/stage.mjs [--clean]
 *
 * Packs (each a folder with manifest.json and MP3s, plus lite/ for the Data Saver files):
 *   lagos_no_dey_sleep_v1  committed: the approved theme's arrangements (menu, rumble, boss, stingers)
 *   lagos_districts_v1     built locally by tools/audio/production/build_districts.sh (MP3s are git-ignored; only the
 *                          manifest, report and QA text are committed). Skipped when it has not been built.
 * Their manifests are merged: tracks are concatenated; menu, default playlist and slots come from the first pack that has
 * them; syncGroups, variants (boss, suddenDeath, suddenDeathFor) and arenaMap are unioned.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PACKS = ['lagos_no_dey_sleep_v1', 'lagos_districts_v1'];
const DEST = join(here, '..', '..', '..', 'public', 'audio', 'candidates');

if (process.argv.includes('--clean')) {
  rmSync(DEST, { recursive: true, force: true });
  console.log('removed', DEST);
} else {
  rmSync(DEST, { recursive: true, force: true });
  mkdirSync(join(DEST, 'lite'), { recursive: true });
  const merged = {
    version: 2,
    approvalStatus: 'candidates-awaiting-founder-listening',
    tracks: [],
    playlists: { default: [], arenas: {} },
    menu: [],
    syncGroups: {},
    variants: {},
    arenaMap: {},
  };
  let slots = null;
  const used = [];
  let copied = 0;
  for (const pack of PACKS) {
    const dir = join(here, pack);
    if (!existsSync(join(dir, 'manifest.json'))) continue;
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    const files = new Set(readdirSync(dir).filter((f) => f.endsWith('.mp3')));
    const have = m.tracks.filter((t) => files.has(t.file));
    if (have.length === 0) {
      console.log(`pack ${pack}: no MP3s here (not built); skipped`);
      continue;
    }
    for (const f of files) {
      cpSync(join(dir, f), join(DEST, f));
      copied++;
    }
    if (existsSync(join(dir, 'lite')))
      for (const f of readdirSync(join(dir, 'lite'))) cpSync(join(dir, 'lite', f), join(DEST, 'lite', f));
    merged.tracks.push(...m.tracks.filter((t) => !merged.tracks.some((x) => x.id === t.id)));
    if (!merged.menu.length) merged.menu = m.menu ?? [];
    if (!merged.playlists.default.length) merged.playlists.default = m.playlists?.default ?? [];
    Object.assign(merged.syncGroups, m.syncGroups ?? {});
    Object.assign(merged.arenaMap, m.arenaMap ?? {});
    const v = m.variants ?? {};
    if (v.suddenDeath && !merged.variants.suddenDeath) merged.variants.suddenDeath = v.suddenDeath;
    if (v.boss && !merged.variants.boss) merged.variants.boss = v.boss;
    if (v.suddenDeathFor)
      merged.variants.suddenDeathFor = { ...(merged.variants.suddenDeathFor ?? {}), ...v.suddenDeathFor };
    if (!slots && existsSync(join(dir, 'slots.json')))
      slots = JSON.parse(readFileSync(join(dir, 'slots.json'), 'utf8'));
    used.push(pack);
  }
  if (!used.length) {
    console.error('nothing to stage: build a pack first');
    process.exit(1);
  }
  writeFileSync(join(DEST, 'manifest.json'), JSON.stringify(merged, null, 2));
  if (slots) writeFileSync(join(DEST, 'slots.json'), JSON.stringify(slots, null, 2));
  console.log(
    `staged ${copied} MP3s from ${used.join(' + ')} in ${DEST} (git-ignored; try /?audiodraft or ?audiodraft=menu|match|lnds|stings)`,
  );
}
