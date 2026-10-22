// Usage: node tools/viewer/shot.mjs <out.png> "<query string>" [width] [height]
// Needs a running Vite dev server (npm run dev -- --port 5199 --strictPort) and WAHALA_CHROMIUM or the default chromium path.
import { chromium } from '@playwright/test';

const [out, query = '', width = '900', height = '700'] = process.argv.slice(2);
const base = process.env.VIEWER_BASE ?? 'http://localhost:5199';
const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM || undefined,
  args: [
    '--single-process',
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: +width, height: +height } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/tools/viewer/viewer.html?w=${width}&h=${height}&${query}`);
await page.waitForFunction(() => window.__VIEWER__?.ready, null, { timeout: 60000 });
const info = await page.evaluate(() => window.__VIEWER__);
await page.waitForTimeout(150);
await page.screenshot({ path: out });
console.log(JSON.stringify({ ...info, errors }, null, 1));
await browser.close();
