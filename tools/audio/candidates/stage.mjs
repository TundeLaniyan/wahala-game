#!/usr/bin/env node
/**
 * Copies the UNAPPROVED audition candidates into the git-ignored public/audio/candidates/ so `npm run dev` (or a local
 * preview build) can play them with ?audiodraft. Never commit the staged folder; never run this in CI or release.
 *   node tools/audio/candidates/stage.mjs [--clean]
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'lagos_no_dey_sleep_v1');
const DEST = join(here, '..', '..', '..', 'public', 'audio', 'candidates');

if (process.argv.includes('--clean')) {
  rmSync(DEST, { recursive: true, force: true });
  console.log('removed', DEST);
} else {
  mkdirSync(DEST, { recursive: true });
  const files = readdirSync(SRC).filter((f) => /\.(mp3|json)$/.test(f) && f !== 'report.json');
  for (const f of files) cpSync(join(SRC, f), join(DEST, f));
  mkdirSync(join(DEST, 'lite'), { recursive: true });
  for (const f of readdirSync(join(SRC, 'lite'))) cpSync(join(SRC, 'lite', f), join(DEST, 'lite', f)); // Data Saver files
  console.log(
    `staged ${files.length} candidate files in ${DEST} (git-ignored; try /?audiodraft or ?audiodraft=menu|match|stings)`,
  );
  if (!existsSync(join(DEST, 'manifest.json'))) process.exitCode = 1;
}
