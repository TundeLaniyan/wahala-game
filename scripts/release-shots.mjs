// Release-integration review (docs/RELEASE_INTEGRATION.md): the Classic raid AI / night lighting and the 18-character
// roster together, in real matches with live bots. One fresh page per scenario, quality and device; after the start the
// countdown is skipped and the match plays `--ticks` ticks of live AI (no staging), then a screenshot and the numbers:
// page errors, on-demand models loaded / failed, draw calls, triangles, GPU geometries / textures, frame mean.
//
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/release-shots.mjs <outDir> [scenarios] [low,high] [desktop,phone] [--ticks=900] [--seconds=6]
//
// Scenarios: `raid:<raidId>` (a classic raid on its own), `field:<fieldId>`, `boss:<districtId>` (the district's boss,
// the districts before it won in a throw-away save), `rumble` (City Rumble Survival from the real menu). Software
// rendering: frame times compare builds on this machine only, never phones.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const flag = (name, d) => flags.find((f) => f.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const [
  outDir = 'docs/screenshots/release-integration',
  list = 'raid:warehouseDispatchDepot,raid:recordsVault,field:oshodi.approach,boss:oshodi,rumble',
  quals = 'low,high',
  devices = 'desktop,phone',
] = args.filter((a) => !a.startsWith('--'));
const seconds = Number(flag('seconds', 6));
const ticks = Number(flag('ticks', 900));
const base = process.env.SHOT_URL ?? 'http://localhost:4470/wahala-game/';
const ORDER = ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'];
const DEVICES = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
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

async function startScenario(page, scenario) {
  const [kind, id] = scenario.split(':');
  if (kind === 'rumble') {
    await page.getByTestId('home-play').click();
    await page.getByTestId('home-rumble').click();
    await page.getByTestId('mode-survival').click();
    await page.getByTestId('setup-start').click();
    return;
  }
  const ok = await page.evaluate(
    ({ kind, id, order }) => {
      const w = window.__WAHALA__;
      if (kind === 'field') return w.startFieldMission(id);
      const c = w.campaign();
      c.load();
      if (kind === 'raid') return c.debugStartRaid(id);
      if (kind === 'boss') {
        c.startNew();
        c.storyDone();
        for (const d of order.slice(0, order.indexOf(id) + 1))
          c.finishMission({
            result: 'won',
            missionId: d,
            modifiers: [],
            seconds: 100,
            livesUsed: 0,
            phasesCleared: 3,
            defeat: 'eliminated',
            stars: 3,
            creditedKills: 1,
          });
        c.toMap();
        return c.startMission(id);
      }
      return false;
    },
    { kind, id, order: ORDER },
  );
  if (!ok) throw new Error(`${scenario} did not start`);
}

const rows = [];
for (const scenario of list.split(',')) {
  for (const q of quals.split(',')) {
    for (const device of devices.split(',')) {
      const ctx = await browser.newContext(DEVICES[device]);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // a throw-away browser profile: the boss scenario's save never reaches a real player
      await page.goto(`${base}?debug&noattract&seed=7&q=${q}`);
      await page.getByTestId('title-screen').waitFor();
      await page.waitForFunction(() => window.__WAHALA__?.store.getState().loading === null, null, {
        timeout: 300_000,
      });
      await startScenario(page, scenario);
      await page.waitForFunction(
        () => window.__WAHALA__.matchLoad().state === null && !!window.__WAHALA__.getState(),
        null,
        { timeout: 300_000 },
      );
      await page.evaluate(() => {
        const s = window.__WAHALA__.getState();
        if (s.match.phase === 'countdown') {
          s.match.phase = 'playing';
          s.match.countdownRemaining = 0;
        }
      });
      // the match plays `--ticks` simulation ticks with every bot deciding (the real loop, frozen to the step), then
      // runs freely for the frame measurement: enemies have entered, patrolled and reacted by the screenshot
      await page.evaluate((n) => {
        const w = window.__WAHALA__;
        w.controller().frozen = true;
        w.stepTicks(Math.max(0, n - 30)); // the sim and every bot, without per-tick presentation (fast)
        w.advance(Math.min(n, 30)); // the last half second with its events reaching the renderer (poses, cues)
        w.controller().frozen = false;
      }, ticks);
      const t0 = await page.evaluate(() => performance.now());
      const f0 = await page.evaluate(() => window.__WAHALA__.matchLoad().frames);
      await page.waitForTimeout(seconds * 1000);
      const stats = await page.evaluate(
        ({ t0, f0 }) => {
          const w = window.__WAHALA__;
          const s = w.stats();
          const st = w.getState();
          const frames = w.matchLoad().frames - f0;
          return {
            drawCalls: s.drawCalls,
            triangles: s.triangles,
            geometries: s.geometries,
            textures: s.textures,
            frameMs: frames > 0 ? Math.round((performance.now() - t0) / frames) : null,
            frames,
            tick: st.tick,
            arena: st.arenaId,
            players: st.players.length,
            alive: st.players.filter((p) => p.alive).length,
            generators: st.generators?.length ?? 0,
            models: w.assets().loaded.filter((i) => i.startsWith('char_')),
            failed: w.assets().failed,
          };
        },
        { t0, f0 },
      );
      const name = `${scenario.replace(':', '-')}-${q}-${device}.jpg`;
      await page.screenshot({ path: join(outDir, name), type: 'jpeg', quality: 72, timeout: 180_000 });
      rows.push({ scenario, q, device, ...stats, errors });
      console.log(JSON.stringify({ scenario, q, device, ...stats, models: stats.models.length, errors }));
      await ctx.close();
    }
  }
}
writeFileSync(join(outDir, 'measurements.json'), JSON.stringify(rows, null, 2));
await browser.close();
