// Usage: node tools/viewer/pose-sheet.mjs <out.png> <model.glb url> "<Clip@t,Clip@t,...>" [view=three] [cellW=330] [cellH=520] [bg=2c2c30]
// Renders each clip pose with the dev viewer (needs `npm run dev -- --port 5199 --strictPort`) and joins them in one row
// (stitched with Pillow). Example:
//   node tools/viewer/pose-sheet.mjs out.png /src/assets/models/char_agbero.glb "Idle@0,Windup@0.3,Windup@0.8,Windup@1,Strike@0.5"
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [out, model, list, view = 'three', cw = '330', ch = '520', bg = '2c2c30'] = process.argv.slice(2);
const base = process.env.VIEWER_BASE ?? 'http://localhost:5199';
const dir = mkdtempSync(join(tmpdir(), 'poses-'));
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
for (const [i, item] of list.split(',').entries()) {
  const [clip, t = '0'] = item.split('@');
  const page = await browser.newPage({ viewport: { width: +cw, height: +ch } });
  await page.goto(
    `${base}/tools/viewer/viewer.html?w=${cw}&h=${ch}&model=${model}&view=${view}&clip=${clip}&t=${t}&scale=1&grid=0&bg=${bg}`,
  );
  await page.waitForFunction(() => window.__VIEWER__?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(200);
  const f = join(dir, `${String(i).padStart(2, '0')}.png`);
  await page.screenshot({ path: f });
  files.push(f);
  await page.close();
}
await browser.close();
execFileSync('python3', [
  '-c',
  `
import sys
from PIL import Image, ImageDraw
files, out, labels = sys.argv[1].split('|'), sys.argv[2], sys.argv[3].split(',')
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
sheet = Image.new('RGB', (w * len(ims), h))
d = ImageDraw.Draw(sheet)
for i, (im, lab) in enumerate(zip(ims, labels)):
    sheet.paste(im, (i * w, 0))
    d.text((i * w + 8, 8), lab, fill=(255, 255, 255))
sheet.save(out)
`,
  files.join('|'),
  out,
  list,
]);
rmSync(dir, { recursive: true, force: true });
console.log('wrote', out);
