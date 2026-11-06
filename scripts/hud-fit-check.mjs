// Mobile HUD fit check (docs/CAMPAIGN_INTEGRATION.md): the campaign dock (objective, health, lives) must be fully visible
// at phone sizes, clear of the touch controls. Stages the Oshodi field through the real runtime at several viewports and
// prints, per viewport, the dock's content height vs its visible height and overlaps with .abtn / the movement pad.
//   SHOT_URL=http://localhost:<port>/wahala-game/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/hud-fit-check.mjs [outDir]   (exit 1 when any viewport clips)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const SIZES = [
  ['desktop', 1280, 720, false],
  ['phone-667x375', 667, 375, true],
  ['phone-844x390', 844, 390, true],
  ['phone-915x412', 915, 412, true],
  ['phone-932x430', 932, 430, true],
  ['portrait-390x844', 390, 844, true],
  ['portrait-360x740', 360, 740, true],
  ['portrait-430x932', 430, 932, true],
];
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
let bad = 0;
for (const [name, width, height, touch] of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: touch,
    hasTouch: touch,
    deviceScaleFactor: touch ? 2 : 1,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  await page.goto(`${process.env.SHOT_URL ?? 'http://localhost:4931/wahala-game/'}?debug&noattract&seed=7`);
  await page.getByTestId('title-screen').waitFor();
  await page.evaluate(() => {
    const c = window.__WAHALA__.campaign();
    c.load();
    c.startNew();
    c.storyDone();
    c.startSectionMission('oshodi.approach');
  });
  await page.getByTestId('hud').waitFor();
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    const c = w.controller();
    c.frozen = true;
    const s = c.state;
    while (s.match.phase !== 'playing') w.stepTicks(10);
    w.stepTicks(120);
    const p = s.players[0];
    p.protectedUntil = s.tick + 100000;
    const legs = [
      [9, 39],
      [19, 39],
      [26, 40],
    ];
    for (const [lx, ly] of legs) {
      p.x = p.stepFromX = lx;
      p.y = p.stepFromY = ly;
      p.stepRemaining = 0;
      w.stepTicks(2);
    }
    p.x = p.stepFromX = 25;
    p.y = p.stepFromY = 44;
    p.stepRemaining = 0; // on the depot door after the three checkpoints: the longest content (the hold bar)
    w.stepTicks(24);
  });
  await page.waitForTimeout(2200);
  const r = await page.evaluate(() => {
    const dock = document.querySelector('[data-testid="mission-dock"]');
    if (!dock) return { dock: false };
    const d = dock.getBoundingClientRect();
    const kids = [...dock.children].map((k) => k.getBoundingClientRect());
    const contentBottom = Math.max(...kids.map((k) => k.bottom));
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom };
    };
    const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    const me = rect(dock);
    const ctl = [
      ...document.querySelectorAll('.abtn, .dpad, .stick, [data-testid="move-pad"], .touch-move'),
    ].map(rect);
    const lives = !!dock.querySelector('[data-testid="mission-lives"]');
    const hold = !!dock.querySelector('[data-testid="field-hold"]');
    return {
      dock: true,
      top: d.top,
      bottom: d.bottom,
      contentBottom,
      clipped: Math.max(0, Math.round(contentBottom - d.bottom)),
      overlapControls: ctl.some((c) => hit(me, c)),
      hold,
      lives,
      right: d.right,
      vw: innerWidth,
      vh: innerHeight,
    };
  });
  const clipped = !r.dock || r.clipped > 1 || r.overlapControls || !r.hold || !r.lives;
  if (clipped) bad++;
  console.log(name, JSON.stringify(r), clipped ? 'FAIL' : 'ok');
  if (out) await page.screenshot({ path: `${out}/hud-${name}.jpg`, type: 'jpeg', quality: 78 });
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
