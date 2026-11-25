/**
 * The founder-approved soundtrack in a real browser (decision AU5, docs/AUDIO_RELEASE.md). `tests/audio/releaseWiring.test.ts`
 * proves the wiring with a fake player; this proves what the PLAYER ACTUALLY DOES in Chromium with the production build and
 * the shipped files: the menu theme, each City Rumble arena's own district song, the Sudden Death hand-over, the boss levels,
 * the result stingers, Data Saver, the fallbacks, the return to the menu, and that nothing is downloaded early.
 *
 * The expected arena -> song table below is written out here on purpose, independently of the manifest, so that a manifest
 * edit that moves a song is caught. `WAHALA_AUDIO_ALL_ARENAS=1` runs the seven-arena Sudden Death check (about a minute per
 * arena on a software renderer: kept out of the default CI run); the default run checks one representative arena.
 *
 * The sim is frozen and stepped by hand (`&nobots&sdhold`), so nothing waits on the wall clock but the audio hand-over itself.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseStage, inMatch, mutate, open, startMatch, stepTicks, toRumbleSetup } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The founder's approved mapping: arena id -> the family of its district song (`dist_<family>_a|b`, `_sd`). */
const DISTRICTS: Record<string, string> = {
  rumbleOjuelegba: 'ojuelegba',
  rumbleOshodi: 'oshodi',
  rumbleMushin: 'mushin',
  rumbleFadeyi: 'fadeyi',
  rumbleEbuteMetta: 'ebute',
  rumbleLagosIsland: 'lagosisland',
  rumbleLekki: 'lekki',
};
const REPRESENTATIVE = 'rumbleOjuelegba';

interface MusicState {
  scene: string;
  track: string | null;
  arenaId: string | null;
  available: string[];
  paused: boolean;
  rate: number;
  position: number;
  playing: boolean;
  history: string[];
}
const music = (page: Page): Promise<MusicState> =>
  page.evaluate(() => (window as any).__WAHALA__.music() as MusicState);

/** Records every audio GET / HEAD (url, bytes), every one-shot sample started (buffer duration) and every playing media element. */
async function instrument(page: Page): Promise<{
  gets: () => string[];
  heads: () => string[];
  bytes: () => number;
}> {
  await page.addInitScript(() => {
    const w = window as any;
    w.__starts = [] as { dur: number }[];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a: [number?, number?, number?]) {
      w.__starts.push({ dur: this.buffer?.duration ?? 0 });
      return start.apply(this, a);
    };
    w.__media = new Set<HTMLMediaElement>();
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      w.__media.add(this);
      return play.call(this);
    };
  });
  const gets: string[] = [];
  const heads: string[] = [];
  let bytes = 0;
  const audioPath = (u: string) =>
    u.includes('/audio/') ? new URL(u).pathname.replace(/^.*\/audio\//, '') : null;
  page.on('request', (r) => {
    const p = audioPath(r.url());
    if (!p) return;
    (r.method() === 'HEAD' ? heads : gets).push(p);
  });
  page.on('response', (r) => {
    if (r.request().method() === 'GET' && audioPath(r.url()))
      bytes += Number(r.headers()['content-length'] ?? 0);
  });
  return { gets: () => [...gets], heads: () => [...heads], bytes: () => bytes };
}

const playingStreams = (page: Page): Promise<number> =>
  page.evaluate(
    () => [...((window as any).__media as Set<HTMLMediaElement>)].filter((e) => !e.paused && !e.ended).length,
  );

const sdTie = `s.crush = null;
     s.endgameTraps = { waves: [], liveAt: [], warned: 0, live: 0, warnings: [], };
     s.players.forEach((p, i) => { if (i > 1) { p.alive = false; p.eliminatedTick = s.tick; p.elimination = { kind: 'crush', eventId: 0 }; } });
     s.players[0].stats.kills = 2; s.players[1].stats.kills = 2;
     s.players[0].protectedUntil = 0; s.players[1].protectedUntil = 0;
     s.match.playTicks = s.config.match.durationTicks - 2;`;

/** Starts a frozen 8-fighter City Rumble on `arena` through the real menu. */
async function startRumble(page: Page, arena: string): Promise<void> {
  await open(page, '&nobots&sdhold&noattract');
  await toRumbleSetup(page, 'survival');
  await chooseStage(page, arena);
  await page.getByTestId('rumble-8').click();
  await startMatch(page, { game: 'rumble' });
}

/** Ends the round in a tie so the real simulation enters Sudden Death (the banner spec's setup). */
async function enterSuddenDeath(page: Page): Promise<void> {
  await mutate(page, sdTie);
  await stepTicks(page, 4);
  await page.evaluate(() => (window as any).__WAHALA__.advance(1));
}

/** Plays out one arena: its own district song, then (when asked) its Sudden Death loop. Returns the observed lines. */
async function districtRun(page: Page, arena: string, suddenDeath: boolean): Promise<string[]> {
  const family = DISTRICTS[arena]!;
  const out: string[] = [];
  const t0 = Date.now();
  await startRumble(page, arena);
  await expect
    .poll(async () => (await music(page)).track, {
      timeout: 90_000,
      message: `${arena} plays its district song`,
    })
    .toMatch(new RegExp(`^dist_${family}_[ab]$`));
  const song = await music(page);
  expect(song.scene).toBe('match');
  expect(song.arenaId).toBe(arena);
  out.push(`${arena}: ${song.track} playing=${song.playing} at ${Math.round((Date.now() - t0) / 1000)} s`);
  if (!suddenDeath) return out;
  await enterSuddenDeath(page);
  await expect
    .poll(async () => (await music(page)).track, {
      timeout: 60_000,
      message: `${arena} hands over to its Sudden Death loop`,
    })
    .toBe(`dist_${family}_sd`);
  const a = await music(page);
  await expect
    .poll(async () => (await music(page)).position, { timeout: 20_000 })
    .toBeGreaterThan(a.position);
  expect((await music(page)).playing).toBe(true);
  out.push(`${arena}: -> ${a.track} (position advancing) at ${Math.round((Date.now() - t0) / 1000)} s`);
  return out;
}

test.describe('the approved soundtrack, real browser', () => {
  test.beforeEach(async ({ page: _page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop run; the phone behaviour is the same player');
  });

  test('menu: nothing plays before the first gesture; then the Lagos No Dey Sleep instrumental', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const net = await instrument(page);
    await open(page, '&noattract');
    await page.waitForTimeout(3000);
    expect(net.gets(), 'no audio GET before the first gesture').toEqual([]);
    expect(net.heads(), 'no audio HEAD before the first gesture').toEqual([]);
    expect((await music(page)).track).toBeNull();
    await page.mouse.click(6, 6);
    await expect.poll(async () => (await music(page)).track, { timeout: 60_000 }).toBe('lnds_menu');
    const m = await music(page);
    expect(m.scene).toBe('menu');
    await expect
      .poll(async () => (await music(page)).position, { timeout: 20_000 })
      .toBeGreaterThan(m.position);
    expect(net.gets().filter((p) => p.startsWith('music/') && !p.includes('lnds_menu'))).toEqual([]);
  });

  test('a district arena plays its own song, no other arena song is fetched, Sudden Death hands over, the menu returns', async ({
    page,
  }) => {
    test.setTimeout(480_000);
    const net = await instrument(page);
    const family = DISTRICTS[REPRESENTATIVE]!;
    const lines = await districtRun(page, REPRESENTATIVE, true);
    console.log(`[audio-release] ${lines.join(' | ')}`);
    const musicGets = net.gets().filter((p) => /^music\/(lite\/)?[^/]+\.mp3$/.test(p));
    // only the menu theme, this arena's song and its Sudden Death loop (the match began on the A or B start of ONE file)
    for (const p of musicGets)
      expect(p, `unexpected music download: ${p}`).toMatch(
        new RegExp(`lnds_menu|dist_${family}(_sd)?\\.mp3$`),
      );
    expect(musicGets.some((p) => /lnds_rumble|dist_(?!ojuelegba)/.test(p))).toBe(false);
    // the player HEAD-probes each distinct file once (headers only); never a body
    const heads = net.heads();
    expect(new Set(heads).size, 'each file probed once').toBe(heads.length);
    console.log(
      `[audio-release] music GETs ${musicGets.join(', ')}; ${heads.length} HEAD probes; ${net.bytes()} audio body bytes`,
    );
    // back to the menu: its theme returns and exactly one stream plays after the crossfade
    await page.keyboard.press('Escape');
    await page.getByTestId('quit').click();
    await page.getByTestId('exit-confirm-leave').click();
    await expect(page.getByTestId('menu-home')).toBeVisible();
    await expect.poll(async () => (await music(page)).track, { timeout: 60_000 }).toBe('lnds_menu');
    await expect.poll(() => playingStreams(page), { timeout: 30_000 }).toBe(1);
  });

  test('all seven City Rumble arenas: district song, then that arena’s Sudden Death loop', async ({
    browser,
  }) => {
    test.skip(
      process.env.WAHALA_AUDIO_ALL_ARENAS !== '1',
      'set WAHALA_AUDIO_ALL_ARENAS=1 (about a minute per arena)',
    );
    test.setTimeout(3_600_000);
    for (const arena of Object.keys(DISTRICTS)) {
      const ctx = await browser.newContext(test.info().project.use as never);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const lines = await districtRun(page, arena, true);
      console.log(`[audio-release:seven] ${lines.join(' | ')}`);
      expect(errors, arena).toEqual([]);
      await ctx.close();
    }
  });

  test('campaign boss: the boss music family, rising with the encounter', async ({ page }) => {
    test.setTimeout(480_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&noattract');
    await page.evaluate(() => {
      const c = (window as any).__WAHALA__.campaign();
      c.load();
      c.startNew();
      c.storyDone();
      // staging: a cleared district lets the boss mission be replayed (as e2e/campaign-expansion-smoke.spec.ts does)
      c.finishMission({
        result: 'won',
        missionId: 'oshodi',
        modifiers: [],
        seconds: 100,
        livesUsed: 0,
        phasesCleared: 3,
        defeat: 'eliminated',
        stars: 3,
        creditedKills: 1,
      });
      c.beginBriefing('oshodi');
      c.startFromBriefing();
      c.bossIntroDone();
    });
    await inMatch(page);
    await expect(page.getByTestId('boss-bar')).toBeVisible();
    await expect.poll(async () => (await music(page)).track, { timeout: 90_000 }).toBe('lnds_boss_1');
    // the encounter moves on (the mission phase is what the music follows; the simulation decides, the audio only looks)
    await mutate(page, 's.mission.phase = 1;');
    await page.evaluate(() => (window as any).__WAHALA__.advance(2));
    await expect.poll(async () => (await music(page)).track, { timeout: 60_000 }).toBe('lnds_boss_2');
    await mutate(page, 's.mission.phase = 2;');
    await page.evaluate(() => (window as any).__WAHALA__.advance(2));
    await expect.poll(async () => (await music(page)).track, { timeout: 60_000 }).toBe('lnds_boss_3');
    const m = await music(page);
    expect(m.playing).toBe(true);
    expect(errors).toEqual([]);
  });

  test('match result: the victory stinger for a win, the defeat stinger for a loss', async ({ browser }) => {
    test.setTimeout(480_000);
    const kill = (who: string) =>
      `s.players.forEach((p, i) => { if (${who}) { p.alive = false; p.eliminatedTick = s.tick; p.elimination = { kind: 'crush', eventId: 0 }; } });`;
    const observed: Record<string, number[]> = {};
    for (const [label, who] of [
      ['win', 'i > 0'],
      ['loss', 'i === 0'],
    ] as const) {
      const ctx = await browser.newContext(test.info().project.use as never);
      const page = await ctx.newPage();
      await instrument(page);
      await open(page, '&nobots&noattract');
      await startMatch(page, { competitors: 2 });
      // the stingers' own decoded lengths, from the shipped files
      const lengths = await page.evaluate(async () => {
        const c = new AudioContext();
        const len = async (f: string) =>
          (await c.decodeAudioData(await (await fetch(f)).arrayBuffer())).duration;
        const r = {
          victory: await len('audio/lnds_victory.mp3'),
          defeat: await len('audio/lnds_defeat.mp3'),
        };
        await c.close();
        return r;
      });
      await page.evaluate(() => ((window as any).__starts.length = 0));
      await mutate(page, kill(who));
      await stepTicks(page, 120);
      await page.evaluate(() => (window as any).__WAHALA__.advance(2));
      const starts = () =>
        page.evaluate(() => ((window as any).__starts as { dur: number }[]).map((x) => x.dur));
      const near = (a: number, b: number) => Math.abs(a - b) < 0.002;
      const expected = label === 'win' ? lengths.victory : lengths.defeat;
      // the stinger starts a moment after the match-ended event (the sample may still be decoding): wait for it
      await expect
        .poll(async () => (await starts()).some((d) => near(d, expected)), {
          timeout: 30_000,
          message: `${label}: the ${label === 'win' ? 'victory' : 'defeat'} stinger (${expected.toFixed(2)} s) starts`,
        })
        .toBe(true);
      await page.waitForTimeout(3000); // the other stinger, had it been wrongly chosen, would have started by now
      const durs = await starts();
      observed[label] = durs;
      const hasVictory = durs.some((d) => near(d, lengths.victory));
      const hasDefeat = durs.some((d) => near(d, lengths.defeat));
      console.log(
        `[audio-release] ${label}: one-shot lengths ${durs.map((d) => d.toFixed(2)).join(', ')}; victory ${lengths.victory.toFixed(2)} s, defeat ${lengths.defeat.toFixed(2)} s`,
      );
      expect(hasVictory, `${label}: victory stinger`).toBe(label === 'win');
      expect(hasDefeat, `${label}: defeat stinger`).toBe(label === 'loss');
      await ctx.close();
    }
  });

  test('Music Data Saver: the saved setting picks the smaller file for the menu and for the arena, off picks the full file', async ({
    browser,
  }) => {
    test.setTimeout(480_000);
    for (const ds of ['on', 'off'] as const) {
      const ctx = await browser.newContext(test.info().project.use as never);
      await ctx.addInitScript((v) => {
        try {
          if (!localStorage.getItem('wahala.settings.v1'))
            localStorage.setItem('wahala.settings.v1', JSON.stringify({ dataSaver: v }));
        } catch {
          /* private mode */
        }
      }, ds);
      const page = await ctx.newPage();
      const net = await instrument(page);
      await startRumble(page, REPRESENTATIVE);
      await expect
        .poll(async () => (await music(page)).track, { timeout: 90_000 })
        .toMatch(/^dist_ojuelegba_[ab]$/);
      const gets = net.gets().filter((p) => /\.mp3$/.test(p) && p.startsWith('music/'));
      const lite = (name: string) => gets.some((p) => p === `music/lite/${name}.mp3`);
      const full = (name: string) => gets.some((p) => p === `music/${name}.mp3`);
      for (const name of ['lnds_menu', 'dist_ojuelegba']) {
        expect(lite(name), `${name} lite (data saver ${ds})`).toBe(ds === 'on');
        expect(full(name), `${name} full (data saver ${ds})`).toBe(ds === 'off');
      }
      await ctx.close();
    }
  });

  test('missing files: an arena never goes silent; a missing Sudden Death loop leaves the song playing; all music failing still plays', async ({
    browser,
  }) => {
    test.setTimeout(900_000);
    const family = DISTRICTS[REPRESENTATIVE]!;
    // 1. the arena's own district song is missing (full and Data Saver file): its listed fallback plays
    {
      const ctx = await browser.newContext(test.info().project.use as never);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route(new RegExp(`/audio/music/(lite/)?dist_${family}(_sd)?\\.mp3`), (r) =>
        r.fulfill({ status: 404, body: '' }),
      );
      await startRumble(page, REPRESENTATIVE);
      await expect.poll(async () => (await music(page)).track, { timeout: 90_000 }).toMatch(/^pixabay_\d+$/);
      const m = await music(page);
      expect(m.playing).toBe(true);
      console.log(`[audio-release] own song 404 -> ${m.track}`);
      expect(errors).toEqual([]);
      await ctx.close();
    }
    // 2. only the Sudden Death loop is missing: the song keeps playing
    {
      const ctx = await browser.newContext(test.info().project.use as never);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route(new RegExp(`/audio/music/(lite/)?dist_${family}_sd\\.mp3`), (r) =>
        r.fulfill({ status: 404, body: '' }),
      );
      await startRumble(page, REPRESENTATIVE);
      await expect
        .poll(async () => (await music(page)).track, { timeout: 90_000 })
        .toMatch(new RegExp(`^dist_${family}_[ab]$`));
      await enterSuddenDeath(page);
      await page.waitForTimeout(15_000);
      const m = await music(page);
      expect(m.track).toMatch(new RegExp(`^dist_${family}_[ab]$`));
      expect(m.playing).toBe(true);
      expect(errors).toEqual([]);
      await ctx.close();
    }
    // 3. every music file fails: the game still starts and plays, silently, without errors
    {
      const ctx = await browser.newContext(test.info().project.use as never);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route(/\/audio\/music\/.*\.mp3/, (r) => r.fulfill({ status: 404, body: '' }));
      await open(page, '&noattract');
      await startMatch(page, { competitors: 2 });
      await stepTicks(page, 120);
      expect(errors).toEqual([]);
      expect(
        (await page.evaluate(() => (window as any).__WAHALA__.getState().tick)) as number,
      ).toBeGreaterThan(100);
      await ctx.close();
    }
  });
});
