// Mission guidance screenshots (docs/MISSION_GUIDANCE.md): the briefings, the raid hand-over, the pins and the rail.
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/guidance-shots.mjs [out-dir] [device,...] [scenario,...] [quality]
// Devices: phone740 (740 x 360 @2), phone844 (844 x 390 @2), desktop (1280 x 720). Quality: low (default) | medium | high.
// Scenarios (staging only: positions are read from the running state; the sim is frozen and debug-stepped):
//   brief      the field briefing of the first mission (Continue story)
//   boss       the Oshodi boss briefing with the card (earlier sections cleared through the controller)
//   railedge   Rail Edge in play on its relay-box leg: equipment pins, the counter, the route cue
//   raidbrief  the warehouse raid's instructions at the door hand-over (the raid held)
//   raid       the raid in play: cargo pins, 0/3, the route cue
//   raidexit   the raid after the last marked cargo: the exit pin and REACH THE EXIT
//   pause      the pause review in the raid
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [
  outDir = 'docs/screenshots/campaign-guidance-expansion/guidance',
  devices = 'phone740,phone844,desktop',
  list = 'brief,boss,railedge,raidbrief,raid,raidexit,pause',
  quality = 'low',
] = process.argv.slice(2);
const VP = {
  phone740: { viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone844: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
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
const URL = process.env.SHOT_URL ?? 'http://localhost:4411/wahala-game/';

async function waitMatch(page) {
  await page.getByTestId('hud').waitFor({ timeout: 180_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="match-loading"]'), null, {
    timeout: 240_000,
  });
}

async function freezeToPlay(page) {
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    w.controller().frozen = true;
    const s = w.getState();
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    w.advance(2);
  });
}

async function toRaid(page) {
  await page.evaluate(() => window.__WAHALA__.campaign().startSectionMission('oshodi.approach'));
  await waitMatch(page);
  await freezeToPlay(page);
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    const s = w.getState();
    const p = s.players[0];
    const at = (x, y, n) => {
      p.x = p.stepFromX = x;
      p.y = p.stepFromY = y;
      p.stepRemaining = 0;
      p.protectedUntil = s.tick + 100000;
      w.stepTicks(n);
    };
    for (const n of s.mission.nodes.filter((o) => /^mk\d+$/.test(o.id))) at(n.x, n.y, 2);
    const d = s.mission.field.doors.find((o) => o.required);
    at(d.x, d.y, 70);
  });
  await page.waitForFunction(() => !!window.__WAHALA__.getState()?.raid, null, { timeout: 180_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="match-loading"]'), null, {
    timeout: 240_000,
  });
  await page.getByTestId('raid-brief').waitFor();
}

async function destroyMarked(page, n) {
  await page.evaluate((count) => {
    const w = window.__WAHALA__;
    const s = w.getState();
    const free = (x, y) => s.tiles[y * s.width + x] === 0;
    const me = s.players[0];
    const stand = (x, y) => {
      me.x = me.stepFromX = x;
      me.y = me.stepFromY = y;
      me.stepRemaining = 0;
      me.protectedUntil = s.tick + 100000;
      if (me.vitals) me.vitals.invulnUntil = s.tick + 100000;
    };
    for (let k = 0; k < count; k++) {
      const c = s.raid.cargo.find((o) => o.marked && !o.destroyed);
      if (!c) return;
      for (let i = 0; i < 4 && !c.destroyed; i++) {
        const a = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
          .map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }))
          .find((t) => free(t.x, t.y));
        stand(a.x, a.y);
        w.controller().forceIntent(0, { place: true });
        w.advance(1);
        stand(s.raid.entrance.x, s.raid.entrance.y);
        const g = s.generators.find((o) => o.ownerId === 0);
        w.stepTicks(Math.max(0, (g?.timer ?? 0) - 3));
        w.advance(30);
        w.stepTicks(60);
      }
    }
  }, n);
}

for (const device of devices.split(',')) {
  for (const scenario of list.split(',')) {
    const page = await (await browser.newContext(VP[device])).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${URL}?debug&noattract&seed=7&q=${quality}`);
    await page.getByTestId('title-screen').waitFor();
    await page.evaluate(() => {
      const c = window.__WAHALA__.campaign();
      c.load();
      c.startNew();
      c.storyDone();
    });
    if (scenario === 'brief') {
      await page.getByTestId('campaign-continue').click();
      await page.getByTestId('menu-missionBrief').waitFor();
      await page.waitForSelector('[data-preview="live"]', { timeout: 60_000 }).catch(() => undefined);
    } else if (scenario === 'boss') {
      await page.evaluate(() => {
        const c = window.__WAHALA__.campaign();
        for (const id of ['oshodi.approach', 'oshodi.railEdge'])
          c.finishMission({
            result: 'won',
            missionId: 'oshodi',
            modifiers: [],
            seconds: 100,
            livesUsed: 0,
            phasesCleared: 0,
            defeat: null,
            stars: 2,
            creditedKills: 0,
            sectionMissionId: id,
          });
        c.beginBriefing('oshodi');
      });
      await page.getByTestId('menu-briefing').waitFor();
      await page.waitForSelector('[data-preview="live"]', { timeout: 60_000 }).catch(() => undefined);
    } else if (scenario === 'railedge') {
      await page.evaluate(() => window.__WAHALA__.startFieldMission('oshodi.railEdge'));
      await waitMatch(page);
      await freezeToPlay(page);
      await page.evaluate(() => {
        const w = window.__WAHALA__;
        const s = w.getState();
        for (const seat of s.mission.seats.filter((x) => x.group === 'hawkers'))
          s.players[seat.playerId].alive = false;
        w.advance(3);
        // stand the fighter a few tiles from the nearest relay box so it and its pin are in the follow camera
        const t = s.mission.field.targets.find((o) => o.leg === s.mission.field.leg);
        const me = s.players[0];
        for (const [dx, dy] of [
          [0, 3],
          [3, 0],
          [-3, 0],
          [0, -3],
          [0, 2],
          [2, 0],
        ]) {
          const x = t.x + dx,
            y = t.y + dy;
          if (s.tiles[y * s.width + x] === 0) {
            me.x = me.stepFromX = x;
            me.y = me.stepFromY = y;
            break;
          }
        }
        me.protectedUntil = s.tick + 100000;
        w.advance(6);
      });
    } else {
      await toRaid(page);
      if (scenario !== 'raidbrief') {
        await page.getByTestId('raid-brief-start').click();
        await freezeToPlay(page);
        if (scenario === 'raidexit') await destroyMarked(page, 3);
        else if (scenario === 'pause')
          await page.evaluate(() => window.__WAHALA__.controller().setPaused(true));
        else await page.evaluate(() => window.__WAHALA__.advance(4));
      }
      await page.waitForSelector('[data-preview="live"]', { timeout: 30_000 }).catch(() => undefined);
    }
    await page.waitForTimeout(1200);
    const file = `${outDir}/${scenario}-${device}.jpg`;
    await page.screenshot({ path: file, type: 'jpeg', quality: 78 });
    console.log(file, errors.length ? `ERRORS ${errors.join(' | ')}` : '');
    await page.context().close();
  }
}
await browser.close();
