// Usage: node tools/viewer/roster-sheet.mjs <out.png> <view=front|three|side|back|head> <id1,id2,...> [clip=Idle@0.5] [cellW=330] [cellH=620]
// Renders src/assets/models/lazy/char_<id>.glb (or `hero:<id>` -> src/assets/models/char_<id>.glb) side by side. Needs the dev server.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [out, view = 'three', list, clipSpec = 'Idle@0.5', cw = '330', ch = '620'] = process.argv.slice(2);
const [clip, t = '0'] = clipSpec.split('@');
const base = process.env.VIEWER_BASE ?? 'http://localhost:5199';
const dir = mkdtempSync(join(tmpdir(), 'roster-'));
const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM || undefined,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const files = [];
const ids = list.split(',');
for (const [i, id] of ids.entries()) {
  const path = id.startsWith('hero:')
    ? `/src/assets/models/char_${id.slice(5)}.glb`
    : `/src/assets/models/lazy/char_${id}.glb`;
  const page = await browser.newPage({ viewport: { width: +cw, height: +ch } });
  await page.goto(
    `${base}/tools/viewer/viewer.html?w=${cw}&h=${ch}&model=${path}&view=${view}&clip=${clip}&t=${t}&scale=1&grid=0&bg=3a3a3e${process.env.VIEWER_EXTRA ?? ''}`,
  );
  await page.waitForFunction(() => window.__VIEWER__?.ready, null, { timeout: 60000 });
  const info = await page.evaluate(() => window.__VIEWER__.stats);
  console.log(id, info.triangles, 'tris', info.materials, 'mats', JSON.stringify(info.bbox));
  await page.waitForTimeout(150);
  const f = join(dir, `${String(i).padStart(2, '0')}.png`);
  await page.screenshot({ path: f });
  files.push(f);
  if (process.env.KEEP)
    (await import('node:fs')).copyFileSync(f, join(process.env.KEEP, `${view}-${id.replace(':', '_')}.png`));
  await page.close();
}
await browser.close();
execFileSync('python3', [
  '-I',
  '-c',
  `
import sys
from PIL import Image, ImageDraw
files, out, labels, cols = sys.argv[1].split('|'), sys.argv[2], sys.argv[3].split(','), int(sys.argv[4])
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows))
d = ImageDraw.Draw(sheet)
for i, (im, lab) in enumerate(zip(ims, labels)):
    sheet.paste(im, ((i % cols) * w, (i // cols) * h)); d.text(((i % cols) * w + 8, (i // cols) * h + 8), lab, fill=(255, 255, 0))
sheet.save(out)
`,
  files.join('|'),
  out,
  list,
  process.env.COLS ?? String(Math.min(ids.length, 6)),
]);
rmSync(dir, { recursive: true, force: true });
console.log('wrote', out);
