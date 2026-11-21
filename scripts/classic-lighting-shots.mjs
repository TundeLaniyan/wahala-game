// Classic lighting review (docs/CLASSIC_LIGHTING.md, decisions NL1-NL9): one screenshot per target, quality and device,
// plus a READABILITY measurement of the rendered picture (not of the code):
//   board      mean / p10 / p50 / p90 luminance (0..255, Rec. 709 on the sRGB pixels) of the walkable floor, sampled as a
//              7 x 7 px window at every open floor tile's centre
//   solid      mean luminance of the solid tiles (walls, crates, cargo) at their top face
//   contrast   |solid - floor| / max(solid, floor): can an obstacle be told from the floor
//   fighter    the local fighter's 9 x 9 px window at chest height vs the floor around it (same formula)
//   enemies    the same for every enemy on the board (mean, min); `lit` counts the ones the night mask shows
// Targets: `raid:<raidId>` (a classic raid through `campaign().debugStartRaid`) or `arena:<arenaId>` (a standard Classic
// match through the real menu). Needs a preview server (SHOT_URL, default http://localhost:4451/wahala-game/):
//
//   WAHALA_CHROMIUM=/opt/pw-browsers/chromium node scripts/classic-lighting-shots.mjs <outDir> <targets,...> \
//     [low,high] [desktop,phone] [--ticks=260] [--walk=right,down] [--tag=after] [--blast]
//
// `--walk` presses those directions for half a second each after the warm-up (the flashlight in motion); `--blast`
// places a generator at the fighter first (a warning on the board). Software rendering: never a phone measurement.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const flag = (name, d) => flags.find((f) => f.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [outDir, targetList, qualities = 'low,high', devices = 'desktop'] = args.filter(
  (a) => !a.startsWith('--'),
);
if (!outDir || !targetList)
  throw new Error('usage: classic-lighting-shots.mjs <outDir> <targets> [q] [devices]');
mkdirSync(outDir, { recursive: true });
const tag = flag('tag', '');
const ticks = Number(flag('ticks', 260));
const walk = flag('walk', '').split(',').filter(Boolean);
const blast = flags.includes('--blast');
const base = process.env.SHOT_URL ?? 'http://localhost:4451/wahala-game/';
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

const browser = await chromium.launch({
  executablePath: process.env.WAHALA_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

async function startArena(page, arenaId) {
  await page.getByTestId('home-play').click();
  await page.getByTestId('home-classic').click();
  const card = page.getByTestId(`arena-${arenaId}`);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.getByTestId('players-4').click();
  await page.getByTestId('setup-start').click();
  for (let i = 0; i < 4 && (await page.getByTestId('hud').count()) === 0; i++) {
    if ((await page.getByTestId('menu-continue').count()) > 0)
      await page.getByTestId('menu-continue').click();
    else if ((await page.getByTestId('start-button').count()) > 0)
      await page.getByTestId('start-button').click();
    else await page.waitForTimeout(500);
  }
}

/** In the page: the readability numbers of the frame `png` (a data URL of the screenshot). */
async function measure(page, png) {
  return page.evaluate(async (src) => {
    const w = window.__WAHALA__;
    const r = w.renderer();
    const s = w.getState();
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    const k = img.width / window.innerWidth; // device pixels per CSS pixel
    const canvasRect = document.querySelector('canvas').getBoundingClientRect();
    const lin = (v) => v; // sRGB code values: what the eye compares on screen
    const lumAt = (x, y) => {
      const i = (Math.round(y) * c.width + Math.round(x)) * 4;
      return 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
    };
    const win = (cx, cy, half) => {
      let sum = 0;
      let n = 0;
      for (let dy = -half; dy <= half; dy++)
        for (let dx = -half; dx <= half; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
          sum += lumAt(x, y);
          n++;
        }
      return n ? sum / n : 0;
    };
    // world -> screen (device px) with the renderer's own camera and layout
    const cam = r.rig.camera;
    cam.updateMatrixWorld();
    const proj = (wx, wy, wz) => {
      const v = [wx, wy, wz, 1];
      const m1 = cam.matrixWorldInverse.elements;
      const m2 = cam.projectionMatrix.elements;
      const mul = (m, p) =>
        [0, 1, 2, 3].map((row) => m[row] * p[0] + m[4 + row] * p[1] + m[8 + row] * p[2] + m[12 + row] * p[3]);
      const cl = mul(m2, mul(m1, v));
      const nx = cl[0] / cl[3];
      const ny = cl[1] / cl[3];
      return {
        x: (canvasRect.left + ((nx + 1) / 2) * canvasRect.width) * k,
        y: (canvasRect.top + ((1 - ny) / 2) * canvasRect.height) * k,
      };
    };
    const L = r.layout;
    const floor = [];
    const solid = [];
    for (let y = 0; y < s.height; y++)
      for (let x = 0; x < s.width; x++) {
        const t = s.tiles[y * s.width + x];
        const p = t === 0 ? proj(L.wx(x), 0.02, L.wz(y)) : proj(L.wx(x), 0.9, L.wz(y));
        (t === 0 ? floor : solid).push(win(p.x, p.y, Math.round(3 * k)));
      }
    floor.sort((a, b) => a - b);
    const pct = (arr, q) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(q * arr.length))] : 0);
    const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const fm = mean(floor);
    const sm = mean(solid);
    const contrast = (a, b) => Math.abs(a - b) / Math.max(1, a, b);
    const around = (x, y) => {
      const ring = [];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= s.width || ty >= s.height || s.tiles[ty * s.width + tx] !== 0) continue;
        const p = proj(L.wx(tx), 0.02, L.wz(ty));
        ring.push(win(p.x, p.y, Math.round(3 * k)));
      }
      return ring.length ? mean(ring) : fm;
    };
    const body = (pl) => {
      const p = proj(L.wx(pl.x), 0.75, L.wz(pl.y));
      return contrast(win(p.x, p.y, Math.round(4 * k)), around(Math.round(pl.x), Math.round(pl.y)));
    };
    const local = s.players.find((p) => !p.isBot && p.alive);
    const enemies = s.players.filter((p) => p.isBot && p.alive);
    const ec = enemies.map(body);
    const night = r.nightStatus?.() ?? null;
    return {
      board: {
        mean: +fm.toFixed(1),
        p10: +pct(floor, 0.1).toFixed(1),
        p50: +pct(floor, 0.5).toFixed(1),
        p90: +pct(floor, 0.9).toFixed(1),
      },
      solid: +sm.toFixed(1),
      contrast: +contrast(sm, fm).toFixed(3),
      fighter: local ? +body(local).toFixed(3) : null,
      enemies: {
        n: ec.length,
        mean: +mean(ec).toFixed(3),
        min: ec.length ? +Math.min(...ec).toFixed(3) : null,
      },
      night,
      stats: w.stats(),
    };
  }, png);
}

const rows = [];
const targets = targetList.split(',').map((t) => t.split(':'));
async function openPage(q, device) {
  const page = await (await browser.newContext(VP[device])).newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
  await page.goto(`${base}?debug&noattract&q=${q}&seed=7${process.env.QUERY ?? ''}`);
  await page.getByTestId('title-screen').waitFor({ timeout: 180000 });
  return page;
}
async function shoot(page, kind, id, q, device) {
  if (kind === 'raid') {
    const arenaId = await page.evaluate((rid) => {
      const c = window.__WAHALA__.campaign();
      if (!c.debugStarted) {
        c.load?.();
        c.startNew?.();
        c.storyDone?.();
        c.debugStarted = true;
      }
      if (!c.debugStartRaid(rid)) throw new Error(`debugStartRaid(${rid}) failed`);
      return `raid${rid[0].toUpperCase()}${rid.slice(1)}`;
    }, id);
    await page.waitForFunction((a) => window.__WAHALA__.getState()?.arenaId === a, arenaId, {
      timeout: 240000,
    });
  } else await startArena(page, id);
  await page.getByTestId('hud').waitFor({ timeout: 240000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="match-loading"]') === null, null, {
    timeout: 240000,
  });
  await page.evaluate((n) => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    w.stepTicks(Math.max(0, n - 30));
    w.advance(Math.min(n, 30));
    w.controller().frozen = false;
  }, ticks);
  if (blast) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
  }
  for (const d of walk) {
    await page.keyboard.down(KEYS[d]);
    await page.waitForTimeout(Number(process.env.WALKMS ?? 700));
    await page.keyboard.up(KEYS[d]);
  }
  await page.waitForTimeout(Number(process.env.RUNMS ?? 1200));
  await page.evaluate(() => (window.__WAHALA__.controller().frozen = true));
  // STEP=N plays N more ticks frozen (e.g. a generator's fuse down to its warning: lanes show in the last 100 ticks)
  if (process.env.STEP) await page.evaluate((n) => window.__WAHALA__.advance(n), Number(process.env.STEP));
  // NOBEAMS=1 (art review): hide the night beams to judge the mask alone
  if (process.env.NOBEAMS)
    await page.evaluate(() => (window.__WAHALA__.renderer().night.group.visible = false));
  await page.waitForTimeout(700);
  const name = `${id}-${q}-${device}${tag ? `-${tag}` : ''}`;
  const buf = await page.screenshot({ type: 'png', timeout: 180000 });
  await page.screenshot({ path: join(outDir, `${name}.jpg`), type: 'jpeg', quality: 78, timeout: 180000 });
  const m = await measure(page, `data:image/png;base64,${buf.toString('base64')}`);
  const row = { target: `${kind}:${id}`, q, device, ...m, errors: page.errors.splice(0).slice(0, 3) };
  rows.push(row);
  console.log(JSON.stringify(row));
}
for (const q of qualities.split(','))
  for (const device of devices.split(',')) {
    // raids share one page per quality and device (a raid can start from another); a standard match needs the menu
    const raids = targets.filter(([k]) => k === 'raid');
    if (raids.length) {
      const page = await openPage(q, device);
      for (const [kind, id] of raids) await shoot(page, kind, id, q, device);
      await page.context().close();
    }
    for (const [kind, id] of targets.filter(([k]) => k !== 'raid')) {
      const page = await openPage(q, device);
      await shoot(page, kind, id, q, device);
      await page.context().close();
    }
  }
await browser.close();
