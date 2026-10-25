/**
 * Art-review screenshots of every menu screen (and the pause / results overlays) at the release viewports.
 * Usage: build, start `npx vite preview --port 4317`, then
 *   node scripts/menu-shots.mjs [outDir] [viewportName ...]
 * Writes <outDir>/<viewport>-<screen>.png. Judge the rendered pictures, not just a passing run.
 */
import { chromium } from 'playwright';

const BASE = process.env.WAHALA_URL ?? 'http://localhost:4317/wahala-game/';
const OUT = process.argv[2] ?? 'menu-shots';
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 720 },
  portrait: { width: 390, height: 844, mobile: true },
  landscape: { width: 844, height: 390, mobile: true },
  small: { width: 667, height: 375, mobile: true },
};
const only = process.argv.slice(3);

const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const [name, vp] of Object.entries(VIEWPORTS)) {
  if (only.length && !only.includes(name)) continue;
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  await page.goto(`${BASE}?debug&q=low&seed=7&nobots`);
  await page.getByTestId('title-screen').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=menu-loading]'), null, { timeout: 120000 });
  await page.waitForTimeout(600);
  const shot = async (s) => {
    // software WebGL renders a few frames a second: let the screen's entrance animation finish first
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}-${s}.png` });
    console.log(`${name}-${s}`);
  };
  await shot('01-home');
  await page.getByTestId('home-rumble').click();
  await shot('02-mode');
  await page.getByTestId('menu-continue').click();
  await shot('03-setup-rumble');
  await page.getByTestId('setup-arena').click();
  await shot('04-arena-rumble');
  await page.getByTestId('arena-confirm').click();
  await page.getByTestId('menu-continue').click();
  await shot('05-fighter');
  await page.getByTestId('menu-continue').click();
  await shot('06-ready');
  await page.getByTestId('menu-back').click();
  await page.getByTestId('menu-back').click();
  await page.getByTestId('menu-back').click();
  await page.getByTestId('mode-classic').click();
  await page.getByTestId('menu-continue').click();
  await shot('07-setup-classic');
  await page.getByTestId('setup-arena').click();
  await shot('08-arena-classic');
  await page.getByTestId('arena-confirm').click();
  await page.evaluate(() => {
    const w = window;
    w.__WAHALA__.store.setState({ menu: { stack: ['home', 'settings'] } });
  });
  await shot('09-settings-audio');
  await page.getByTestId('settings-tab-controls').click();
  await shot('10-settings-controls');
  await page.getByTestId('settings-tab-access').click();
  await shot('11-settings-access');
  await page.getByTestId('settings-close').click();
  await page.getByTestId('home-academy').click();
  await shot('12-academy');
  await page.getByTestId('menu-back').click();
  await page.getByTestId('quick-play').click();
  await page.getByTestId('hud').waitFor();
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(200);
    w.controller().setPaused(true);
  });
  // the pause menu is reachable in portrait too (play itself asks for landscape)
  await shot('13-pause');
  await page.getByTestId('pause-settings-open').click();
  await shot('14-pause-settings');
  await page.getByTestId('pause-settings-close').click();
  await page.getByTestId('resume').click();
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.getState();
    for (const p of s.players) if (p.id !== 0) p.alive = false;
    w.stepTicks(5);
    w.controller().finishSkip?.();
  });
  await page.getByTestId('results').waitFor({ timeout: 60000 });
  await shot('15-results');
  await ctx.close();
}
await browser.close();
