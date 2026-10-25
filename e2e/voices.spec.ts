import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getState, mutate, open, startMatch, stepTicks, thumb, chooseArena, openSettings, pauseSettings, launch } from './helpers';

/** The founder-approved voice clips and the catalogue they belong to. */
const RECORDED = (
  JSON.parse(readFileSync(new URL('../public/audio/voices/recorded.json', import.meta.url), 'utf8')) as {
    clips: { id: string; file: string; duration: number }[];
  }
).clips;
const VOICES = JSON.parse(
  readFileSync(new URL('../public/audio/voices/voices.json', import.meta.url), 'utf8'),
) as {
  zones: Record<string, string[]>;
  lines: { id: string; trigger: string; zone: string; text: string }[];
};
const CATALOGUE = VOICES.lines;
const lineOf = (id: string) => CATALOGUE.find((l) => l.id === id)!;
const EVERYWHERE = RECORDED.filter((c) => lineOf(c.id).zone === 'all').map((c) => c.id);
/** Clips an arena loads: the everywhere lines plus those of every location zone the arena belongs to. */
const clipsFor = (arena: string) =>
  RECORDED.filter((c) => {
    const zone = lineOf(c.id).zone;
    return zone === 'all' || (VOICES.zones[zone] ?? []).includes(arena);
  }).map((c) => c.id);
/** A planned trigger that has no approved clip yet (it must stay silent). */
const SILENT_TRIGGER = CATALOGUE.map((l) => l.trigger).find(
  (t) => !RECORDED.some((c) => lineOf(c.id).trigger === t),
)!;

interface Spoken {
  clipId: string;
  trigger: string;
  text: string;
  urgent: boolean;
  ambient: boolean;
  interrupted: string | null;
}
interface VoiceStatus {
  scene: string | null;
  registered: number;
  loaded: string[];
  failed: { id: string; reason: string }[];
  pending: string[];
  speaking: string | null;
}
type Debug = {
  __WAHALA__: {
    voices(): VoiceStatus | null;
    voiceSceneLoaded(): Promise<void> | null;
    spoken(): Spoken[];
    previewVoice(trigger: string): boolean;
    hear(events: unknown[]): void;
    advance(n: number): void;
    store: { getState(): Record<string, unknown>; setState(p: Record<string, unknown>): void };
  };
};

const voices = (page: Page) => page.evaluate(() => (window as unknown as Debug).__WAHALA__.voices());
const spoken = (page: Page) => page.evaluate(() => (window as unknown as Debug).__WAHALA__.spoken());
const sceneLoaded = (page: Page) =>
  page.evaluate(async () => {
    await (window as unknown as Debug).__WAHALA__.voiceSceneLoaded();
  });
const preview = (page: Page, trigger: string) =>
  page.evaluate((t) => (window as unknown as Debug).__WAHALA__.previewVoice(t), trigger);
const hear = (page: Page, events: unknown[]) =>
  page.evaluate((e) => (window as unknown as Debug).__WAHALA__.hear(e), events);
const lastSpoken = async (page: Page) => (await spoken(page)).at(-1);
/** Waits until no foreground line is speaking (the audio clock runs in real time). */
const quiet = (page: Page) =>
  expect.poll(async () => (await voices(page))?.speaking ?? null, { timeout: 15_000 }).toBeNull();

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  return errors;
}

async function startOn(page: Page, arena: string, query = '&nobots&noattract'): Promise<void> {
  await open(page, query);
  await chooseArena(page, arena);
  await startMatch(page, { competitors: 2 });
  await sceneLoaded(page);
}

/** The screen rectangles of every transient text element on the HUD (notices and subtitles). */
const transientRects = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-testid="hud-rail"] > *, [data-testid="hud-rail"] .stage-alert, [data-testid="subtitle"], .caption, .captions > *',
      ),
    ]
      .map((e) => {
        const r = e.getBoundingClientRect();
        return {
          cls: (e as HTMLElement).className,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
        };
      })
      .filter((r) => r.right > r.left && r.bottom > r.top),
  );

const board = (page: Page) =>
  page.evaluate(
    () => (window as unknown as Debug).__WAHALA__.store.getState().board as { x: number; y: number }[] | null,
  );

/** X of the board's left edge at screen height y. */
function leftEdgeAt(b: { x: number; y: number }[], y: number): number {
  const far = b[0]!;
  const near = b[3]!;
  const t = Math.min(1, Math.max(0, (y - far.y) / (near.y - far.y)));
  return far.x + (near.x - far.x) * t;
}

/**
 * Review frames: software WebGL makes a screenshot take seconds, longer than a notice or subtitle stays up,
 * so the frame pins a representative notice and subtitle in the store first (the timed behaviour itself is
 * asserted above).
 */
async function pinForScreenshot(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const st = (window as unknown as Debug).__WAHALA__.store;
    st.setState({
      toasts: [{ id: 90001, text: 'FINAL 30s: FLOOR TRAPS!', tone: 'bad', expires: Number.MAX_SAFE_INTEGER }],
      subtitle: { id: 90002, text: t, urgent: true, ambient: false },
    });
  }, text);
  await expect(page.getByTestId('subtitle')).toBeVisible();
}

test.describe('Nigerian voice clips', () => {
  test.beforeEach(() => test.setTimeout(5 * 60_000));

  test('the approved clips decode in the browser, load per arena, and nothing loads on the title screen', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const requested: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/audio/voices/recorded/')) requested.push(r.url().split('/').pop()!);
    });
    await open(page, '&nobots&noattract');
    await page.getByTestId('home-settings').click(); // first gesture: audio unlocks, manifests load
    await page.waitForTimeout(1500);
    expect(requested).toEqual([]); // the title screen loads no clip

    const decoded = await page.evaluate(
      async (files) => {
        const ctx = new AudioContext();
        const out: { file: string; seconds: number }[] = [];
        for (const f of files) {
          try {
            const res = await fetch(`audio/voices/recorded/${f}`);
            out.push({ file: f, seconds: (await ctx.decodeAudioData(await res.arrayBuffer())).duration });
          } catch {
            out.push({ file: f, seconds: 0 });
          }
        }
        await ctx.close();
        return out;
      },
      RECORDED.map((c) => c.file),
    );
    for (const c of RECORDED) {
      const d = decoded.find((x) => x.file === c.file)!;
      expect(d.seconds, c.file).toBeGreaterThan(c.duration - 0.05);
      expect(d.seconds, c.file).toBeLessThan(c.duration + 0.2); // MP3 frame padding only
    }
    requested.length = 0;

    await chooseArena(page, 'danfoBusPark');
    await startMatch(page, { competitors: 2 });
    await sceneLoaded(page);
    const park = (await voices(page))!;
    expect(park.registered).toBe(RECORDED.length);
    expect(park.failed).toEqual([]);
    // the everywhere lines plus the bus-park talk; no market talk at the bus park
    expect(park.loaded.sort()).toEqual(clipsFor('danfoBusPark').sort());
    expect(park.loaded).not.toContain('market_come_buy_01');
    expect(requested.sort()).toEqual(
      clipsFor('danfoBusPark')
        .map((id) => `${id}.mp3`)
        .sort(),
    );
    expect(errors).toEqual([]);
  });

  test('gameplay events trigger their voices; an urgent warning cuts a less urgent line', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await startOn(page, 'danfoBusPark');
    const me = (await getState(page)).players[0]!;

    // an approaching Keke (a bot's): the Keke warning line
    await hear(page, [
      { type: 'vehicleWarning', vehicleId: 9, kind: 'keke', ownerId: 1, entry: { x: 0, y: me.y } },
    ]);
    await expect.poll(async () => (await lastSpoken(page))?.trigger).toBe('ON_KEKE_HAZARD_SPAWN');
    const keke = (await lastSpoken(page))!;
    expect(lineOf(keke.clipId).trigger).toBe('ON_KEKE_HAZARD_SPAWN');

    // a generator about to blow with the player in its cross: the urgent warning interrupts the Keke line
    await mutate(
      page,
      `const me = s.players[0]; s.generators.push({ id: 900, ownerId: 1, x: me.x + 1, y: me.y, stepFromX: me.x + 1, stepFromY: me.y,
        range: 2, pierce: false, mode: 'timed', timer: 70, carriedBy: null, carryBonusUsed: false, slide: null, flight: null,
        triggered: false, placedTick: s.tick });`,
    );
    await page.evaluate(() => (window as unknown as Debug).__WAHALA__.advance(1));
    await expect.poll(async () => (await lastSpoken(page))?.trigger).toBe('ON_GENERATOR_CRITICAL_PROXIMITY');
    const run = (await lastSpoken(page))!;
    expect(run.urgent).toBe(true);
    expect(run.interrupted).toBe(keke.clipId);
    expect(run.clipId).toMatch(/^danger_run_0[123]$/);

    // the player run over by a Danfo
    await quiet(page);
    await hear(page, [
      {
        type: 'playerEliminated',
        playerId: 0,
        cause: { kind: 'vehicle', ownerId: 1, vehicleKind: 'danfo', eventId: 7 },
        x: me.x,
        y: me.y,
      },
    ]);
    await expect.poll(async () => (await lastSpoken(page))?.clipId).toMatch(/^danfo_hit_0[123]$/);

    // every other trigger with a clip plays one of its own lines in the real browser
    const triggers = [...new Set(EVERYWHERE.map((id) => lineOf(id).trigger))];
    for (const t of triggers) {
      expect(await preview(page, t), t).toBe(true);
      const s = (await lastSpoken(page))!;
      expect(s.trigger).toBe(t);
      expect(lineOf(s.clipId).trigger).toBe(t);
    }
    // a trigger that has no clip yet stays silent (and shows nothing)
    expect(SILENT_TRIGGER).toBeDefined();
    expect(await preview(page, SILENT_TRIGGER)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('the market arena loads and plays its own street talk', async ({ page }) => {
    await startOn(page, 'balogunMarket');
    const st = (await voices(page))!;
    expect(st.loaded).toContain('market_come_buy_01');
    expect(await preview(page, 'AMBIENT_SCHEDULER_MARKET')).toBe(true);
    expect((await lastSpoken(page))!.clipId).toBe('market_come_buy_01');
  });

  test('a missing or broken clip never breaks playback: it is skipped and the others still speak', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.route('**/audio/voices/recorded/danger_run_01.mp3', (r) =>
      r.fulfill({ status: 404, body: 'nope' }),
    );
    await page.route('**/audio/voices/recorded/danger_run_02.mp3', (r) =>
      r.fulfill({ status: 200, contentType: 'audio/mpeg', body: '<html>not audio</html>' }),
    );
    await startOn(page, 'danfoBusPark');
    const st = (await voices(page))!;
    expect(st.failed.map((f) => f.id).sort()).toEqual(['danger_run_01', 'danger_run_02']);
    expect(st.loaded).toHaveLength(clipsFor('danfoBusPark').length - 2);
    for (let i = 0; i < 4; i++) {
      expect(await preview(page, 'ON_GENERATOR_CRITICAL_PROXIMITY')).toBe(true);
      expect((await lastSpoken(page))!.clipId).toBe('danger_run_03');
    }
    expect(errors.filter((e) => e.startsWith('pageerror'))).toEqual([]);
  });

  test('subtitles: off by default, on shows the line beside the board; no notice or subtitle covers a playable tile', async ({
    page,
  }, info) => {
    await open(page, '&nobots&noattract');
    await openSettings(page, 'access');
    await expect(page.getByTestId('subtitles-off')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('settings-close').click();
    await chooseArena(page, 'danfoBusPark');
    await startMatch(page, { competitors: 4 });
    await sceneLoaded(page);
    expect(await preview(page, 'ON_PLAYER_ELIMINATED')).toBe(true);
    await page.waitForTimeout(300);
    await expect(page.getByTestId('subtitle')).toHaveCount(0); // subtitles are off

    // turn them on from the pause menu's Settings, then back to the match
    await page.keyboard.press('p');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await pauseSettings(page, 'audio');
    await page.getByTestId('toggle-subtitles').click();
    await expect(page.getByTestId('toggle-subtitles')).toHaveAttribute('data-mode', 'on');
    await page.getByTestId('pause-settings-close').click();
    await page.keyboard.press('p');
    await expect(page.getByTestId('pause-overlay')).toHaveCount(0);

    // the final-30 s floor traps (a status notice) and a voice line with its subtitle, at the same time
    await mutate(page, 's.match.playTicks = s.config.match.durationTicks - 30 * 60 - 2;');
    await page.evaluate(() => (window as unknown as Debug).__WAHALA__.advance(6));
    await expect(page.getByTestId('toast').first()).toContainText(/FLOOR TRAPS/);
    expect(await preview(page, 'ON_PLAYER_ELIMINATED')).toBe(true);
    const sub = page.getByTestId('subtitle');
    await expect(sub).toBeVisible();
    expect(lineOf((await lastSpoken(page))!.clipId).text).toBe(await sub.textContent());
    await expect(page.locator('.caption')).toHaveCount(0); // the old crowd speech bubbles are gone

    const b = (await board(page))!;
    expect(b).not.toBeNull();
    const rects = await transientRects(page);
    expect(rects.length).toBeGreaterThanOrEqual(2);
    const nearY = b[3]!.y;
    for (const r of rects) {
      // left of the board edge at the element's lowest point (the board widens downwards) and above the near row
      expect(r.right, `${r.cls} overlaps the board`).toBeLessThanOrEqual(leftEdgeAt(b, r.bottom) + 0.5);
      expect(r.bottom, r.cls).toBeLessThan(nearY);
    }
    // the bottom row (and the lower-left spawn) is free of every HUD text element
    const rowTop = nearY - (nearY - b[0]!.y) / 10;
    const covering = await page.evaluate(
      ({ left, right, top, bottom }) =>
        [...document.querySelectorAll('.hud *')]
          .filter((e) => (e.textContent ?? '').trim().length > 0 && e.children.length === 0)
          .filter((e) => {
            const r = e.getBoundingClientRect();
            const style = getComputedStyle(e);
            if (style.visibility === 'hidden' || style.display === 'none' || r.width === 0) return false;
            return r.left < right && r.right > left && r.top < bottom && r.bottom > top;
          })
          .map((e) => `${e.className}: ${e.textContent}`),
      { left: b[3]!.x, right: b[2]!.x, top: rowTop, bottom: nearY },
    );
    expect(covering).toEqual([]);
    await pinForScreenshot(page, lineOf('elimination_03').text);
    for (const r of await transientRects(page))
      expect(r.right, `${r.cls} overlaps the board`).toBeLessThanOrEqual(leftEdgeAt(b, r.bottom) + 0.5);
    await page.screenshot({
      path: `e2e-shots/${info.project.name}-voice-subtitle-bottom-row.png`,
      animations: 'disabled',
    });

    // large subtitles stay off the board too
    await page.evaluate(() => {
      const st = (window as unknown as Debug).__WAHALA__.store;
      st.setState({ settings: { ...(st.getState().settings as object), subtitles: 'large' } });
    });
    expect(await preview(page, 'ON_GENERATOR_DETONATE')).toBe(true);
    await expect(page.locator('[data-testid="subtitle"].large')).toBeVisible();
    for (const r of await transientRects(page))
      expect(r.right, `${r.cls} overlaps the board`).toBeLessThanOrEqual(leftEdgeAt(b, r.bottom) + 0.5);
  });

  test('the Power Yard rule (countdown) fits whole in the rail, off the board, even on an iPhone SE (regression)', async ({
    page,
  }, info) => {
    if (info.project.use.isMobile) await page.setViewportSize({ width: 568, height: 320 });
    await open(page, '&nobots&noattract');
    await chooseArena(page, 'surulerePowerYard');
    await launch(page);
    const banner = page.getByTestId('rule-banner');
    await expect(banner).toBeVisible();
    await page.evaluate(() => {
      (
        window as unknown as { __WAHALA__: { controller(): { frozen: boolean } } }
      ).__WAHALA__.controller().frozen = true;
    });
    await expect.poll(() => board(page)).not.toBeNull();
    await page.waitForTimeout(400); // the rail's 0.2 s slide-in
    const g = await page.evaluate(() => {
      const box = (sel: string) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      const text = document.querySelector('[data-testid=rule-banner] span') as HTMLElement;
      return {
        banner: box('[data-testid=rule-banner]'),
        rail: box('[data-testid=hud-rail]'),
        clipped: text.scrollHeight > text.clientHeight + 1,
      };
    });
    const b = (await board(page))!;
    expect(g.banner.bottom, 'the rule is cut off by the rail').toBeLessThanOrEqual(g.rail.bottom + 0.5);
    expect(g.clipped).toBe(false);
    expect(g.banner.right).toBeLessThanOrEqual(leftEdgeAt(b, g.banner.bottom) + 0.5);
    await page.screenshot({
      path: `e2e-shots/${info.project.name}-power-yard-rule-rail.png`,
      animations: 'disabled',
    });
  });

  test('phone: the thumbstick and generator placement still work while a subtitle and notices are shown', async ({
    page,
  }, info) => {
    test.skip(!info.project.use.isMobile, 'mobile project only');
    await open(page, '&nobots&noattract');
    await openSettings(page, 'access');
    await page.getByTestId('subtitles-on').click();
    await page.getByTestId('settings-close').click();
    await startMatch(page, { competitors: 4 });
    await sceneLoaded(page);
    expect(await preview(page, 'ON_PLAYER_NARROW_ESCAPE')).toBe(true);
    await expect(page.getByTestId('subtitle')).toBeVisible();
    await pinForScreenshot(page, lineOf('danger_run_03').text);
    await page.screenshot({
      path: `e2e-shots/${info.project.name}-voice-spawn-row.png`,
      animations: 'disabled',
    });
    await page.evaluate(() =>
      (window as unknown as Debug).__WAHALA__.store.setState({ toasts: [], subtitle: null }),
    );
    const start = (await getState(page)).players[0]!;
    await thumb(page, 'up', 3);
    expect((await getState(page)).players[0]!.y).toBe(start.y - 1);
    await page.getByTestId('btn-place').dispatchEvent('pointerdown');
    await stepTicks(page, 2);
    expect((await getState(page)).generators).toHaveLength(1);
  });
});
