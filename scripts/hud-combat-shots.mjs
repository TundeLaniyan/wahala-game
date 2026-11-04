// HUD combat review frames + geometry check (needs a preview server; HUD_URL defaults to http://localhost:5199/wahala-game/):
//   node scripts/hud-combat-shots.mjs <out-dir> [rumble|classic]
// Plays a City Rumble (or Classic) match on a desktop and a phone viewport, stages kills, a shield hit and QUICK HANDS
// stored through the debug handle, screenshots the HUD, and asserts that the kill feed sits in the rail and that no
// rail text covers the timer, the portraits, the inventory, the touch controls or the bottom row of the board.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'docs/screenshots/hud-combat';
const game = process.argv[3] ?? 'rumble';
mkdirSync(out, { recursive: true });
const VP = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const base = process.env.HUD_URL ?? 'http://localhost:5199/wahala-game/';
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
const failures = [];
for (const [device, ctx] of Object.entries(VP)) {
  const page = await (await browser.newContext(ctx)).newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?debug&noattract&q=low&seed=7`);
  await page.getByTestId('title-screen').waitFor();
  if (game === 'rumble') {
    await page.getByTestId('home-rumble').click();
    await page.getByTestId('mode-deathmatch').click();
    await page.getByTestId('rumble-16').click();
  } else {
    await page.getByTestId('home-classic').click();
    await page.getByTestId('players-4').click();
  }
  if ((await page.getByTestId('menu-setup').count()) > 0) await page.getByTestId('menu-continue').click();
  if ((await page.getByTestId('menu-fighter').count()) > 0) await page.getByTestId('menu-continue').click();
  await page.getByTestId('start-button').click();
  await page.getByTestId('hud').waitFor();
  await page.evaluate(() => window.__WAHALA__.stepTicks(200));
  await page.evaluate(() => {
    window.__WAHALA__.controller().frozen = true;
  });
  const publish = async () => {
    await page.waitForTimeout(160);
    await page.evaluate(() => window.__WAHALA__.advance(1));
    await page.waitForTimeout(160);
  };
  // stage: the local player takes out P3; P5 takes out P6; P7 runs over P8; the city takes P9; armour x2, QUICK HANDS stored
  await page.evaluate((g) => {
    window.__game = g;
    const s = window.__WAHALA__.getState();
    const me = s.players[0];
    me.protectedUntil = 0;
    me.armour = 2;
    me.streakRewards.quickHandsBank = 11 * 60;
    const kill = (victim, by, cause) => {
      const v = s.players[victim];
      if (!v) return;
      v.alive = false;
      v.eliminatedTick = s.tick;
      v.eliminatedBy = by;
      v.elimination = cause ?? { kind: 'flame', ownerId: by ?? 0, eventId: 0 };
    };
    kill(1, 0);
    kill(2, 3, { kind: 'vehicle', ownerId: 3, vehicleKind: 'danfo', eventId: 0 });
    if (g !== 'classic') kill(3, null, { kind: 'crush', eventId: 0 }); // classic: keep a rival alive
    window.__WAHALA__.advance(1);
    // the mission panel is written into the HUD snapshot (a fixture; real missions come from the mission sim)
    const st = window.__WAHALA__.store;
    const mission = {
      missionId: 'oshodi',
      objective: 'dispatchRelays',
      phase: 1,
      phaseCount: 3,
      phaseState: 'active',
      progress: { done: 1, goal: 3, label: 'relays jammed' },
      nodes: [],
      warnings: [
        { kind: 'convoy', x: 3, y: 3, tiles: [], remainingTicks: 240 },
        { kind: 'strike', x: 5, y: 5, tiles: [], remainingTicks: 90 },
      ],
      boss: { playerId: 1, shielded: true, exposed: false, exposedRemainingTicks: 0, defeated: false },
      lives: { used: 1, max: 3 },
      timeRemainingSec: 252,
      callout: 'Jam two relays before the next convoy',
      crewAlive: 3,
      outcome: null,
    };
    const pin = () => {
      const hud = st.getState().hud;
      if (hud) st.setState({ hud: { ...hud, mission } });
      const feed = st.getState().killFeed ?? [];
      st.setState({ killFeed: feed.map((l) => ({ ...l, expires: Number.MAX_SAFE_INTEGER })) });
    };
    pin();
    setInterval(pin, 30);
    // every HUD publish keeps the fixture (the game republishes the snapshot without a mission)
    const set = st.setState.bind(st);
    st.setState = (p, replace) => set(p && p.hud ? { ...p, hud: { ...p.hud, mission } } : p, replace);
  }, game);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${game}-${device}-kill-feed.png`, timeout: 180000 });
  const rects = await page.evaluate(() => {
    const r = (q) =>
      [...document.querySelectorAll(q)]
        .map((e) => e.getBoundingClientRect())
        .filter((b) => b.width > 0 && b.height > 0);
    return {
      feed: r('[data-testid="kill-feed"]'),
      mission: r('[data-testid="mission-panel"]'),
      rail: r('[data-testid="rail-combat"]'),
      side: r('[data-testid="rail-side"]'),
      others: [
        '.timer',
        '.portrait',
        '.round-btn',
        '[data-testid="inventory"]',
        '.abtn',
        '[data-testid="stick-pad"]',
      ].flatMap((q) => r(q).map((b) => ({ q, b }))),
      vh: window.innerHeight,
      board: window.__WAHALA__.store.getState().board,
    };
  });
  console.log(device, game, 'feed lines:', rects.feed.length, 'board:', JSON.stringify(rects.board));
  if (rects.feed.length === 0) failures.push(`${device}: kill feed empty`);
  if (rects.mission.length === 0) failures.push(`${device}: mission panel missing`);
  for (const f of [...rects.feed, ...rects.rail, ...rects.side]) {
    for (const { q, b } of rects.others)
      if (f.left < b.right && f.right > b.left && f.top < b.bottom && f.bottom > b.top)
        failures.push(`${device}: rail text overlaps ${q}`);
    if (game === 'classic' && rects.board && rects.rail.includes(f)) {
      const [far, , , near] = rects.board;
      const t = Math.min(1, Math.max(0, (f.bottom - far.y) / (near.y - far.y)));
      if (f.right > far.x + (near.x - far.x) * t + 0.5)
        failures.push(`${device}: rail text reaches the board`);
    }
  }
  console.log(device, 'errors:', errors.slice(0, 3));
  await page.close();
}
await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
