// Story-panel captures (docs/STORY_VISUALS.md): raw, HUD-free stills of the game's own scenes for the campaign's story
// panels. The raw captures go to tools/story/masters/<id>.jpg; tools/story/build_story_art.py grades them into
// src/assets/story/<id>.webp. Nothing here changes the game: it only stages the real scene (players moved, a free
// camera) and screenshots the canvas.
//
//   npm run dev -- --port 5199 --strictPort &
//   WAHALA_CHROMIUM=/opt/pw-browsers/chromium node scripts/story-shots.mjs [--only id,id] [--out dir] [--survey district]
//     [--config tools/story/shots.config.mjs] [--url http://localhost:5199/] [--size 1280x720]
//
// Software GL is slow: scenes are grouped so one load serves every shot of that scene.
// A shot (see tools/story/shots.config.mjs):
//   { id, scene: 'boss:oshodi' | 'field:oshodi.approach' | 'raid:warehouseDispatchDepot' | 'rumble:rumbleOjuelegba',
//     tod: 'day' | 'night', ticks, hideCrowd?, stage: [{ id, x, y, slot?, face? }], cam: { from: [x, y, h], at: [x, y, h], fov } }
// Coordinates are TILES (x, y) plus a height in metres, so a shot is described in the game's own units.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback;
};
const outDir = flag('out', 'tools/story/masters');
const only = (flag('only', '') || '').split(',').filter(Boolean);
const survey = flag('survey', '');
const serve = flag('serve', '');
const baseUrl = flag('url', process.env.SHOT_URL ?? 'http://localhost:5199/');
const [W, H] = flag('size', '1280x720').split('x').map(Number);
const configPath = resolve(flag('config', 'tools/story/shots.config.mjs'));
mkdirSync(outDir, { recursive: true });

const SECTIONS = {
  oshodi: ['approach', 'railEdge'],
  mushin: ['approach', 'market'],
  fadeyiSomolu: ['approach', 'junctions'],
  ebuteMetta: ['approach', 'railYard'],
  lagosIsland: ['approach', 'press'],
  lekki: ['approach', 'estate'],
};
const ORDER = Object.keys(SECTIONS);

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

/** Opens a page on the scene (a district boss mission, a field section, a raid) and freezes the sim. */
async function openScene(scene, tod) {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const [kind, arg] = scene.split(':');
  if (kind === 'rumble')
    await context.addInitScript(
      ([id, n]) => {
        const key = 'wahala.settings.v1';
        const s = JSON.parse(localStorage.getItem(key) || '{}');
        localStorage.setItem(
          key,
          JSON.stringify({
            ...s,
            play: 'rumble',
            rumbleArenaId: id,
            rumbleCompetitors: n,
            rumbleMode: 'deathmatch',
            difficulty: 'standard',
          }),
        );
      },
      [arg, 12],
    );
  const page = await context.newPage();
  page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(
    `${baseUrl}?debug&noattract&seed=7&q=high${tod === 'night' ? '&tod=night' : ''}${kind === 'rumble' ? '&nobots' : ''}`,
  );
  await page.getByTestId('title-screen').waitFor();
  if (kind === 'rumble') {
    const quick = page.getByTestId('quick-play');
    if ((await quick.count()) > 0) await quick.click();
    else await page.getByTestId('start-button').click();
  }
  await page.evaluate(
    ({ kind, arg, order, sections, raids }) => {
      const c = window.__WAHALA__.campaign();
      c.load();
      c.startNew();
      c.storyDone();
      const won = (m, o) => ({
        result: 'won',
        missionId: m,
        modifiers: [],
        seconds: 100,
        livesUsed: 0,
        phasesCleared: 3,
        defeat: 'eliminated',
        stars: 3,
        creditedKills: 1,
        ...o,
      });
      const clear = (d, includingBoss) => {
        for (const s of sections[d]) {
          // a standalone raid section is cleared with a raid result, a field section with a mission result
          if (raids[`${d}.${s}`])
            c.finishRaidMission(`${d}.${s}`, {
              raidId: raids[`${d}.${s}`],
              result: 'completed',
              seconds: 60,
              optionalRoomsOpened: 0,
              optionalRoomsTotal: 0,
              cargoDestroyed: 3,
              cargoTotal: 3,
              hpLeft: 3,
              livesUsed: 0,
              stars: 2,
            });
          else c.finishMission(won(d, { defeat: null, sectionMissionId: `${d}.${s}`, raidBonus: 0 }));
        }
        if (includingBoss) c.finishMission(won(d, {}));
      };
      if (kind === 'rumble') return;
      if (kind === 'boss') {
        for (const d of order.slice(0, order.indexOf(arg))) clear(d, true);
        clear(arg, false);
        c.beginBriefing(arg);
        c.startFromBriefing();
        c.bossIntroDone();
      } else if (kind === 'field') {
        const d = arg.split('.')[0];
        for (const e of order.slice(0, order.indexOf(d))) clear(e, true);
        c.startSectionMission(arg);
      } else if (kind === 'raid') {
        c.debugStartRaid(arg);
      }
    },
    { kind, arg, order: ORDER, sections: SECTIONS, raids: { 'ebuteMetta.railYard': 'railYardGoods' } },
  );
  await page.getByTestId('hud').waitFor({ timeout: 180000 });
  await page.waitForTimeout(1200);
  await page.addStyleTag({
    content:
      '.game-root > *:not(canvas) { display: none !important; } .vignette { display: none !important; }',
  });
  await page.evaluate(() => {
    const w = window.__WAHALA__;
    const c = w.controller();
    c.frozen = true;
    w.stepTicks(200);
    const r = w.renderer();
    r.debugHideMissionMarkers?.(true);
    // free camera + no overlays: applied after the rig's own update, before every draw
    const st = (window.__story = { cam: null, hideUi: true, look: {} });
    const rig = r.rig;
    const origUpdate = rig.update.bind(rig);
    rig.update = (...a) => {
      origUpdate(...a);
      if (!st.cam) return;
      const g = r.layout;
      const p = (v) => [g.wx(v[0]), v[2], g.wz(v[1])];
      const f = p(st.cam.from);
      const t = p(st.cam.at);
      rig.camera.position.set(f[0], f[1], f[2]);
      rig.camera.up.set(0, 1, 0);
      rig.camera.lookAt(t[0], t[1], t[2]);
      rig.camera.fov = st.cam.fov ?? 40;
      rig.camera.updateProjectionMatrix();
      rig.camera.updateMatrixWorld(true);
    };
    const gl = r.renderer;
    const origRender = gl.render.bind(gl);
    gl.render = (scene, camera) => {
      const L = st.look;
      // the sky is painted a flat key colour; tools/story/build_story_art.py replaces it with a graded gradient
      if (L.keySky !== false && scene.background?.isColor) scene.background.set(0xff00ff);
      if (L.fog !== undefined && scene.fog) scene.fog.color.set(L.fog);
      if (L.fogFar && scene.fog) scene.fog.far = L.fogFar;
      if (L.env !== undefined) scene.environmentIntensity = L.env;
      if (L.exposure !== undefined) gl.toneMappingExposure = L.exposure;
      if (L.sun !== undefined || L.sunK !== undefined || L.hemiK !== undefined)
        scene.traverse((o) => {
          if (o.isDirectionalLight) {
            o.userData.k0 ??= o.intensity;
            if (L.sun !== undefined) o.color.set(L.sun);
            if (L.sunK !== undefined) o.intensity = o.userData.k0 * L.sunK;
          } else if (o.isHemisphereLight && L.hemiK !== undefined) {
            o.userData.k0 ??= o.intensity;
            o.intensity = o.userData.k0 * L.hemiK;
          }
        });
      if (st.hideUi)
        scene.traverse((o) => {
          if (o.isSprite) o.visible = false;
          else if (
            o.isMesh &&
            o.renderOrder === 4 &&
            o.material?.transparent &&
            o.material.depthWrite === false
          )
            o.visible = false;
        });
      origRender(scene, camera);
    };
  });
  return page;
}

/** Applies a shot's staging (players moved / re-dressed) and camera, then screenshots the canvas. */
async function takeShot(page, shot, out) {
  await page
    .evaluate((s) => {
      const w = window.__WAHALA__;
      const state = w.getState();
      const r = w.renderer();
      if (s.ticks) w.stepTicks(s.ticks);
      let redress = false;
      for (const e of s.stage ?? []) {
        const crew = state.mission
          ? state.players.filter((q) => q.id !== 0 && q.id !== state.mission.bossId)
          : state.players.slice(1);
        const pid =
          e.id === 'boss'
            ? state.mission.bossId
            : typeof e.id === 'string' && e.id.startsWith('crew:')
              ? crew[Number(e.id.slice(5))]?.id
              : e.id;
        const p = state.players[pid];
        if (!p) continue;
        if (e.x !== undefined) {
          p.x = p.stepFromX = e.x;
          p.y = p.stepFromY = e.y;
          p.stepRemaining = 0;
        }
        if (e.face) p.facing = e.face;
        if (e.char) {
          p.characterId = e.char;
          redress = true;
        }
        if (e.slot !== undefined) {
          p.slot = e.slot;
          redress = true;
        }
      }
      if (redress) {
        // the renderer builds a fighter's kit from its slot when it first draws it: rebuild them all with the new slots
        const pv = r.views.find((v) => v.visuals instanceof Map && 'group' in v);
        if (pv) {
          pv.group.clear();
          pv.visuals.clear();
        }
      }
      window.__story.cam = s.cam;
      window.__story.look = s.look ?? {};
      window.__story.hideUi = !s.showUi;
      w.advance(2);
      return { w: state.width, h: state.height, players: state.players.map((p) => [p.id, p.x, p.y]) };
    }, shot)
    .then((info) => shot.info && console.log('  board', JSON.stringify(info)));
  await page.waitForTimeout(shot.waitMs ?? 1800);
  await page.screenshot({ path: out, type: 'jpeg', quality: 72, timeout: 180000 });
  console.log('  wrote', out);
}

if (survey) {
  // an ASCII dump of a district's board plus where its people are, for planning cameras
  const page = await openScene(`boss:${survey}`, 'day');
  const info = await page.evaluate(() => {
    const s = window.__WAHALA__.getState();
    const rows = [];
    for (let y = 0; y < s.height; y++) {
      let row = '';
      for (let x = 0; x < s.width; x++) {
        const t = s.tiles[y * s.width + x];
        row += t === 0 ? '.' : t === 1 ? '#' : t === 2 ? 'o' : String(t);
      }
      rows.push(row);
    }
    return {
      w: s.width,
      h: s.height,
      rows,
      players: s.players.map((p) => `${p.id}:${p.characterId}@${p.x},${p.y}`),
      mission: s.mission ? { nodes: s.mission.nodes?.map((n) => [n.x, n.y]), boss: s.mission.bossId } : null,
    };
  });
  writeFileSync(
    `${outDir}/survey-${survey}.txt`,
    `${info.rows.join('\n')}\n${JSON.stringify({ ...info, rows: undefined })}\n`,
  );
  console.log(info.rows.join('\n'));
  console.log(JSON.stringify({ ...info, rows: undefined }));
  await browser.close();
  process.exit(0);
}

if (serve) {
  // one loaded scene, many shots: write a shot (JSON) to <serve-dir>/cmd.json; it is taken and cmd.json is removed.
  // Used to iterate on cameras and staging without paying a scene load for every try. Ctrl-C / `quit` in cmd.json ends it.
  const [scene, tod = 'day'] = serve.split('|');
  const dir = flag('dir', 'tools/story/.serve');
  mkdirSync(dir, { recursive: true });
  const page = await openScene(scene, tod);
  console.log(`serving ${scene} (${tod}); write ${dir}/cmd.json`);
  for (let quit = false; !quit;) {
    await new Promise((r) => setTimeout(r, 700));
    // every cmd*.json in the folder, in name order (cmd.json, cmd-1.json, cmd-2.json ...): one shot each
    for (const f of readdirSync(dir)
      .filter((n) => /^cmd.*\.json$/.test(n))
      .sort()) {
      let cmd;
      try {
        cmd = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
      } catch {
        continue; // half-written
      }
      rmSync(`${dir}/${f}`);
      if (cmd.quit) {
        quit = true;
        break;
      }
      try {
        await takeShot(page, cmd, `${outDir}/${cmd.id}.jpg`);
      } catch (e) {
        console.log('  shot failed:', e.message.split('\n')[0]);
      }
    }
  }
  await browser.close();
  process.exit(0);
}

const { SHOTS } = await import(pathToFileURL(configPath).href);
const todo = SHOTS.filter((s) => only.length === 0 || only.includes(s.id));
const groups = new Map();
for (const s of todo) {
  const k = `${s.scene}|${s.tod ?? 'day'}`;
  groups.set(k, [...(groups.get(k) ?? []), s]);
}
for (const [k, shots] of groups) {
  const [scene, tod] = k.split('|');
  console.log(`scene ${scene} (${tod}): ${shots.map((s) => s.id).join(', ')}`);
  const page = await openScene(scene, tod);
  for (const shot of shots) await takeShot(page, shot, `${outDir}/${shot.id}.jpg`);
  await page.context().close();
}
await browser.close();
