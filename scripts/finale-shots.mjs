// Ojuelegba finale screenshots (docs/CAMPAIGN_SECTOR_AI.md "Part: Ojuelegba finale"): each of missions 19-21 started
// through the real campaign controller (a save with the six districts cleared; for the boss, missions 19 and 20 won
// too), a few seconds of real play with the bots, the human staged on a tile of interest, the follow camera settled, a
// JPEG of the landscape-phone frame (740 x 360 CSS px, device scale 2).
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/finale-shots.mjs [out-dir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] ?? 'docs/screenshots/campaign-sector-ai';
mkdirSync(outDir, { recursive: true });
const SHOTS = [
  // mission 19: the lane barrier (its two locks) at the bend, the patrol lane beyond
  { name: 'finale-19-return', mission: 'ojuelegba.return', at: [18, 27], play: 150 },
  // mission 20: the bus stop under the flyover, the waves on their way
  { name: 'finale-20-junction', mission: 'ojuelegba.junction', at: [20, 19], play: 240 },
  // mission 21: the danfo pocket, a control point and the Landlord at the impound
  { name: 'finale-21-boss', mission: 'ojuelegba.boss', at: [35, 26], play: 120 },
];
const win = (missionId, extra = {}) => ({
  result: 'won',
  missionId,
  modifiers: [],
  seconds: 150,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: 'eliminated',
  stars: 2,
  creditedKills: 3,
  ...extra,
});
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
for (const shot of SHOTS) {
  const page = await (
    await browser.newContext({
      viewport: { width: 740, height: 360 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    })
  ).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    `${process.env.SHOT_URL ?? 'http://localhost:5199/wahala-game/'}?debug&noattract&seed=7&q=low`,
  );
  await page.getByTestId('title-screen').waitFor();
  const started = await page.evaluate(
    ({ mission, wins }) => {
      const c = window.__WAHALA__.campaign();
      c.load();
      c.startNew();
      c.storyDone();
      for (const w of wins) c.finishMission(w);
      c.toMap();
      return mission.endsWith('.boss') ? c.startMission('ojuelegba') : c.startSectionMission(mission);
    },
    {
      mission: shot.mission,
      wins: [
        ...['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'].map((d) => win(d)),
        ...(shot.mission.endsWith('.boss')
          ? ['ojuelegba.return', 'ojuelegba.junction'].map((ref) =>
              win('ojuelegba', { defeat: null, sectionMissionId: ref, raidBonus: 0 }),
            )
          : []),
      ],
    },
  );
  if (!started) throw new Error(`${shot.mission} did not start`);
  await page.waitForFunction(
    () => window.__WAHALA__.matchLoad().state === null && !!window.__WAHALA__.getState(),
    null,
    { timeout: 240_000 },
  );
  await page.waitForTimeout(800);
  const info = await page.evaluate(
    ({ at, play }) => {
      const w = window.__WAHALA__;
      const c = w.controller();
      c.frozen = true;
      const s = c.state;
      while (s.match.phase !== 'playing') w.stepTicks(10);
      const p = s.players[0];
      p.protectedUntil = s.tick + 100000; // staging only: the shot, not a fight
      w.advance(play);
      p.x = p.stepFromX = at[0];
      p.y = p.stepFromY = at[1];
      p.stepRemaining = 0;
      w.renderer().cutCamera();
      w.advance(4);
      return { sector: s.sector?.id ?? null, tick: s.tick };
    },
    { at: shot.at, play: shot.play },
  );
  await page.waitForTimeout(2600);
  const file = `${outDir}/${shot.name}.jpg`;
  await page.screenshot({ path: file, type: 'jpeg', quality: 70 });
  console.log(file, JSON.stringify(info), errors.length ? `errors: ${errors.join(' | ')}` : '');
  await page.close();
}
await browser.close();
