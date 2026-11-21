// Agbero art-review shots (docs/CHARACTER_PRODUCTION_AGBERO.md): the real campaign renderer with an Agbero staged next
// to the camera focus, "new" (dedicated model) vs "legacy" (`?legacyEnemies`, the temporary kit look), at chosen
// qualities and viewports. Also measures frame time and the renderer's draw statistics.
//   SHOT_URL=http://localhost:5199/ WAHALA_CHROMIUM=/opt/pw-browsers/chromium \
//   node scripts/agbero-shots.mjs <out-dir> [looks=new,legacy] [viewports=desktop,phone844] [qualities=high,low] [poses=idle,windup,strike,run,alert]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [
  outDir = 'docs/screenshots/agbero-3d',
  looks = 'new,legacy',
  vps = 'desktop,phone844',
  quals = 'high,low',
  poseList = 'idle,windup,strike,run,alert',
] = process.argv.slice(2);
const VIEWPORTS = {
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
const base = process.env.SHOT_URL ?? 'http://localhost:5199/';
const report = [];

for (const vpName of vps.split(',')) {
  for (const quality of quals.split(',')) {
    for (const look of looks.split(',')) {
      const page = await (await browser.newContext(VIEWPORTS[vpName])).newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(
        `${base}?debug&noattract&seed=7&q=${quality}${look === 'legacy' ? '&legacyEnemies' : ''}`,
      );
      await page.getByTestId('title-screen').waitFor();
      await page.waitForFunction(() => window.__WAHALA__?.store.getState().loading === null, null, {
        timeout: 180_000,
      });
      await page.evaluate(
        ({ m, order }) => {
          const w = window.__WAHALA__;
          const [kind, id] = m.includes(':') ? m.split(':') : ['field', m];
          if (kind === 'field') return w.startFieldMission(id);
          const c = w.campaign();
          c.load();
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
        },
        {
          m: process.env.MISSION ?? 'oshodi.approach',
          order: ['oshodi', 'mushin', 'fadeyiSomolu', 'ebuteMetta', 'lagosIsland', 'lekki'],
        },
      );
      await page.waitForFunction(() => !!window.__WAHALA__.getState(), null, { timeout: 180_000 });
      await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 4000));
      // stage: the human beside an Agbero, everyone else frozen out of the way; the camera follows the human
      const staged = await page.evaluate((variant) => {
        const w = window.__WAHALA__;
        const s = w.getState();
        const c = w.controller();
        c.frozen = true;
        while (s.match.phase === 'countdown') w.stepTicks(10);
        const foe = s.players.find(
          (p) =>
            (variant.startsWith('name:')
              ? p.name === variant.slice(5)
              : (p.enemyVariant ?? p.enemyKind) === variant) && p.alive,
        );
        if (!foe) return null;
        const me = s.players[0];
        me.x = foe.x;
        me.y = foe.y + 3;
        me.facing = 'up';
        foe.facing = 'down';
        w.renderer().cutCamera();
        return { id: foe.id, variant: foe.enemyVariant ?? null, assets: w.assets() };
      }, process.env.VARIANT ?? 'agbero');
      if (!staged) throw new Error(`no ${process.env.VARIANT ?? 'agbero'} in the mission`);
      for (const pose of poseList.split(',')) {
        await page.evaluate(
          ({ id, pose }) => {
            const w = window.__WAHALA__;
            const v = w.renderer().players?.visuals?.get(id); // private in TS, reachable at runtime
            const r = v?.model.rigged;
            if (!r) return;
            if (pose === 'idle') r.setLoop('Idle', 0);
            if (pose === 'run') r.setLoop('Run', 0);
            if (pose === 'walk') r.setLoop(r.has('Walk') ? 'Walk' : 'Run', 0);
            if (pose === 'windup' || pose === 'windupEnd') r.playOnceOver('Push', 1.0, 0);
            if (pose === 'strike') r.playOnce('Push', 0, 1);
            if (pose === 'alert') r.playOnce(r.has('Alert') ? 'Alert' : 'Idle', 0);
            if (pose === 'stagger') r.playOnce('Stumble', 0, 1);
            if (pose === 'defeat') w.getState().players[id].alive = false; // the real death branch (tumble, DieBlast clip)
          },
          { id: staged.id, pose },
        );
        const wait =
          {
            windup: 800,
            windupEnd: 980,
            strike: 220,
            alert: 300,
            stagger: 300,
            defeat: 420,
            idle: 600,
            run: 400,
            walk: 400,
          }[pose] ?? 400;
        // advance the animation in real time without ticking the sim (the match stays frozen)
        await page.waitForTimeout(wait);
        // the whole gameplay frame once per run, then the same camera angle moved in close on the enemy for every pose
        const base = `${outDir}/${look}-${vpName}-${quality}`;
        if (pose === poseList.split(',')[0])
          await page.screenshot({ path: `${base}-gameplay.png`, timeout: 180_000 });
        await page.evaluate(
          ({ id, zoom }) => {
            const w = window.__WAHALA__;
            const root = w.renderer().players.visuals.get(id).model.root;
            w.renderer().debugInspect({ x: root.position.x, z: root.position.z, zoom });
          },
          { id: staged.id, zoom: +(process.env.ZOOM ?? 0.75) },
        );
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${base}-${pose}.png`, timeout: 180_000 });
        await page.evaluate(() => window.__WAHALA__.renderer().debugInspect(null));
      }
      report.push({ look, vp: vpName, quality, variant: staged.variant, errors });
      await page.context().close();
    }
  }
}
await browser.close();
writeFileSync(`${outDir}/shots-report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
