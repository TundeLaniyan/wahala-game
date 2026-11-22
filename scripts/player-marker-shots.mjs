// Player identification marker review (decision PI1, docs/PLAYER_MARKER.md): the three marker styles on the same
// staged, crowded scene: the human with rivals standing next to them, on a bright day board (a Classic match) and a
// dark night raid (the Records Vault). One page per scene, quality and device; the style is switched live through
// `__WAHALA__.playerMarker(mode)`, so every style is the same frame of the same scene. Also writes the draw calls and
// triangles of each style (measurements.json) and a close crop around the player.
//
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/player-marker-shots.mjs [outDir] [day,night] [low,high] [phone,desktop] [original,indicator,indicatorGround]
//
// Staging (positions of the rivals) is screenshot-only; the sim and the rules are untouched. Software rendering:
// counts compare styles on this machine only.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [
  outDir = 'docs/screenshots/player-marker',
  scenes = 'day,night',
  quals = 'low,high',
  devices = 'phone,desktop',
  modes = 'original,indicator,indicatorGround',
] = process.argv.slice(2);
const base = process.env.SHOT_URL ?? 'http://localhost:4500/wahala-game/';
const DEVICES = {
  phone: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 720 } },
};
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

async function start(page, scene) {
  if (scene === 'day') {
    await page.getByTestId('home-play').click();
    await page.getByTestId('home-classic').click();
    await page.getByTestId('classic-setup').waitFor();
    const arena = page.getByTestId('arena-danfoBusPark');
    await arena.scrollIntoViewIfNeeded();
    await arena.click();
    await page.getByTestId('players-4').click();
    await page.getByTestId('setup-start').click();
    await page.getByTestId('hud').waitFor({ timeout: 240_000 });
    await page.waitForTimeout(1500);
    return;
  }
  const ok = await page.evaluate(() => {
    const c = window.__WAHALA__.campaign();
    c.load();
    c.startNew();
    c.storyDone();
    return c.debugStartRaid('recordsVault');
  });
  if (!ok) throw new Error('raid did not start');
  await page.waitForFunction(
    () => window.__WAHALA__.matchLoad().state === null && !!window.__WAHALA__.getState(),
    null,
    {
      timeout: 300_000,
    },
  );
}

/** Rivals next to the human (walkable ring first), or `far` away from them. Screenshot staging only. */
const stage = (page, crowd) =>
  page.evaluate((crowd) => {
    const s = window.__WAHALA__.getState();
    const me = s.players.find((p) => !p.isBot);
    if (s.match.phase === 'countdown') {
      s.match.phase = 'playing';
      s.match.countdownRemaining = 0;
    }
    s.tiles = s.tiles.map((t) => (t === 2 ? 0 : t));
    const free = (x, y) => x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === 0;
    const place = (p, x, y) => {
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
      p.alive = true;
    };
    let mx = Math.round(me.x);
    let my = Math.round(me.y);
    if (crowd) {
      // an open spot with several open neighbours
      let best = [mx, my, -1];
      for (let y = 1; y < s.height - 1; y++)
        for (let x = 1; x < s.width - 1; x++) {
          if (!free(x, y)) continue;
          const n = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [-1, -1],
          ].filter(([dx, dy]) => free(x + dx, y + dy)).length;
          const dist = Math.abs(x - s.width / 2) + Math.abs(y - s.height / 2);
          const score = n * 10 - dist;
          if (score > best[2]) best = [x, y, score];
        }
      [mx, my] = best;
      place(me, mx, my);
    }
    const rivals = s.players.filter((p) => p !== me);
    const ring = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, -1],
      [2, 0],
      [-2, 0],
    ];
    let i = 0;
    for (const r of rivals) {
      if (crowd) {
        let spot = ring.slice(i).find(([dx, dy]) => free(mx + dx, my + dy));
        if (!spot) continue;
        i = ring.indexOf(spot) + 1;
        place(r, mx + spot[0], my + spot[1]);
      } else {
        // as far as the board allows
        let best = [r.x, r.y, -1];
        for (let y = 0; y < s.height; y++)
          for (let x = 0; x < s.width; x++)
            if (free(x, y) && Math.abs(x - mx) + Math.abs(y - my) > best[2])
              best = [x, y, Math.abs(x - mx) + Math.abs(y - my)];
        place(r, best[0], best[1]);
      }
    }
    return {
      me: [mx, my],
      rivals: rivals.length,
      near: rivals.filter((r) => Math.hypot(r.x - mx, r.y - my) < 2.5).length,
    };
  }, crowd);

async function shoot(page, file, clipAroundPlayer) {
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
  await page.waitForTimeout(1200); // the eased prominence settles
  // the renderer's counts of the last frame: the median of five samples, 150 ms apart
  const samples = [];
  for (let i = 0; i < 5; i++) {
    samples.push(await page.evaluate(() => window.__WAHALA__.stats()));
    await page.waitForTimeout(150);
  }
  const med = (k) => samples.map((s) => s[k]).sort((a, b) => a - b)[2];
  const stats = { drawCalls: med('drawCalls'), triangles: med('triangles') };
  await page.screenshot({ path: `${file}.jpg`, type: 'jpeg', quality: 86, timeout: 180_000 });
  if (clipAroundPlayer) {
    const clip = await page.evaluate(() => {
      const w = window.__WAHALA__;
      const me = w.getState().players.find((p) => !p.isBot);
      const pt = w.renderer().projectTiles([{ x: me.x, y: me.y }])?.[0];
      return pt ? { x: pt.x, y: pt.y, vw: innerWidth, vh: innerHeight } : null;
    });
    if (clip) {
      const w = Math.min(clip.vw, 340);
      const h = Math.min(clip.vh, 220);
      const x = Math.max(0, Math.min(clip.vw - w, clip.x - w / 2));
      const y = Math.max(0, Math.min(clip.vh - h, clip.y - h * 0.68));
      await page.screenshot({
        path: `${file}-crop.jpg`,
        type: 'jpeg',
        quality: 88,
        clip: { x, y, width: w, height: h },
        timeout: 180_000,
      });
    }
  }
  return { drawCalls: stats.drawCalls, triangles: stats.triangles };
}

const rows = [];
for (const scene of scenes.split(',')) {
  for (const q of quals.split(',')) {
    for (const device of devices.split(',')) {
      const ctx = await browser.newContext(DEVICES[device]);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}?debug&noattract&seed=7&q=${q}`);
      await page.getByTestId('title-screen').waitFor();
      await page.waitForFunction(() => window.__WAHALA__?.store.getState().loading === null, null, {
        timeout: 300_000,
      });
      await start(page, scene);
      await page.evaluate(() => {
        const w = window.__WAHALA__;
        w.controller().frozen = true;
        w.stepTicks(260);
        w.advance(30);
      });
      const staged = await stage(page, true);
      for (const mode of modes.split(',')) {
        await page.evaluate((m) => window.__WAHALA__.playerMarker(m), mode);
        const m = await shoot(page, join(outDir, `${scene}-${q}-${device}-${mode}`), true);
        rows.push({ scene, q, device, mode, crowd: true, staged, ...m });
        console.log(JSON.stringify({ scene, q, device, mode, ...m, errors }));
      }
      // the same marker with nobody near: subtle
      await stage(page, false);
      await page.evaluate(() => window.__WAHALA__.playerMarker('indicator'));
      const alone = await shoot(page, join(outDir, `${scene}-${q}-${device}-indicator-alone`), true);
      rows.push({ scene, q, device, mode: 'indicator', crowd: false, ...alone });
      await ctx.close();
    }
  }
}
writeFileSync(join(outDir, 'measurements.json'), JSON.stringify(rows, null, 2));
await browser.close();
