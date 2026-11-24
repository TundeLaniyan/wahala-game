// Records each track's Data Saver file (public/audio/music/lite/<file>) in manifest.json as `"lite": "lite/<file>"`.
// Only tracks whose lite file exists are touched; run after tools/audio/make_lite_music.sh.
import fs from 'node:fs';
import path from 'node:path';

const dir = 'public/audio/music';
const file = path.join(dir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
let n = 0;
for (const t of manifest.tracks) {
  const lite = `lite/${t.file}`;
  if (fs.existsSync(path.join(dir, lite))) {
    t.lite = lite;
    n++;
  }
}
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${n} of ${manifest.tracks.length} tracks have a Data Saver file`);
