/**
 * Combat HUD in a real browser (decisions HC1-HC5): the kill feed, the shield chip, QUICK HANDS stored, the SUDDEN
 * DEATH status and the mission panel sit in the HUD rail (a standard arena) or the City Rumble left panel, never over
 * the board, the timer, the portraits, the inventory or the controls, on the desktop and on a phone. The kills are
 * written into the live game state (the simulation rules are covered by the unit tests); everything after that is the
 * real game loop and the real HUD.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseArena, open, startMatch } from './helpers';

type Debug = {
  __WAHALA__: {
    advance(n: number): void;
    controller(): { frozen: boolean };
    store: { getState(): Record<string, unknown>; setState(p: Record<string, unknown>): void };
  };
};

const shot = (page: Page, project: string, name: string) =>
  page.screenshot({ path: `e2e-shots/${project}-${name}.png`, timeout: 180_000 });

/**
 * Writes the staged kills into the live state, advances one tick (the real event path: the kill feed lists them) and
 * pins the lines in the same synchronous step. A line lives about 4 s of real time (asserted by the unit tests),
 * which software WebGL frames can outlast between two checks, so the lines the real path just produced get their
 * expiry pushed out for the assertions and the shots.
 */
async function stageAndPublish(page: Page, code: string): Promise<void> {
  await page.waitForTimeout(160);
  await page.evaluate((src) => {
    const w = (window as unknown as Debug).__WAHALA__ as unknown as {
      getState(): unknown;
    } & Debug['__WAHALA__'];
    new Function('s', src)(w.getState());
    w.advance(1);
    const feed = (w.store.getState().killFeed ?? []) as { expires: number }[];
    w.store.setState({ killFeed: feed.map((l) => ({ ...l, expires: Number.MAX_SAFE_INTEGER })) });
  }, code);
}

/** Local player takes out P1; the city takes P2 (one more credited kill is P3's against P2 on a 4-player board). */
const STAGE = `
  const me = s.players[0];
  me.protectedUntil = 0;
  me.armour = 2;
  me.streakRewards.quickHandsBank = 11 * 60;
  const down = (v, by, cause) => {
    const p = s.players[v];
    if (!p) return;
    p.alive = false; p.eliminatedTick = s.tick; p.eliminatedBy = by; p.elimination = cause;
    p.respawnAt = null;
  };
  down(1, 0, { kind: 'flame', ownerId: 0, eventId: 1 });
  down(2, 3, { kind: 'vehicle', ownerId: 3, vehicleKind: 'danfo', eventId: 1 });
  down(3, null, { kind: 'crush', eventId: 1 });
`;

/** The fighters' names, upper case, as the feed writes them. */
const playerNames = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window as unknown as { __WAHALA__: { getState(): { players: { name: string }[] } } }).__WAHALA__
      .getState()
      .players.map((p) => p.name.toUpperCase()),
  );

type Rect = { left: number; right: number; top: number; bottom: number };

const rectsOf = (page: Page, selector: string): Promise<Rect[]> =>
  page.evaluate(
    (q) =>
      [...document.querySelectorAll(q)]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
    selector,
  );

const hits = (a: Rect, b: Rect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Things the combat text must never cover. */
const KEEP_CLEAR = [
  '.timer',
  '.portrait',
  '.round-btn',
  '[data-testid="inventory"]',
  '.abtn',
  '[data-testid="stick-pad"]',
  '[data-testid="minimap"]',
];

async function clearOf(page: Page, selector: string): Promise<void> {
  for (const q of KEEP_CLEAR) {
    const others = await rectsOf(page, q);
    for (const r of await rectsOf(page, selector))
      for (const o of others)
        expect(hits(r, o), `${selector} ${JSON.stringify(r)} covers ${q} ${JSON.stringify(o)}`).toBe(false);
  }
}

/** X of the board's left edge at screen height y (it widens towards the near row). */
function leftEdgeAt(b: { x: number; y: number }[], y: number): number {
  const far = b[0]!;
  const near = b[3]!;
  const t = Math.min(1, Math.max(0, (y - far.y) / (near.y - far.y)));
  return far.x + (near.x - far.x) * t;
}

/** X of the board's right edge at screen height y. */
function boardRightEdgeAt(b: { x: number; y: number }[], y: number): number {
  const far = b[1]!;
  const near = b[2]!;
  const t = Math.min(1, Math.max(0, (y - far.y) / (near.y - far.y)));
  return far.x + (near.x - far.x) * t;
}

test.describe('combat HUD', () => {
  test.setTimeout(600_000); // software WebGL

  test('standard arena: kill feed, shield chip, stored QUICK HANDS and the mission panel sit in the rail, off the board and the bottom row', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&nobots&noattract');
    await chooseArena(page, 'danfoBusPark');
    await startMatch(page, { competitors: 4 });
    await page.evaluate(() => ((window as unknown as Debug).__WAHALA__.controller().frozen = true));
    // the last rival stays alive, or the match would end and take the inventory away
    await stageAndPublish(page, STAGE.replace(/ {2}down\(3,.*\n/, ''));

    const feed = page.getByTestId('kill-feed');
    await expect(feed).toBeVisible();
    const lines = page.getByTestId('kill-feed-line');
    await expect(lines).toHaveCount(2);
    const names = await playerNames(page);
    await expect(feed).toContainText(`YOU ELIMINATED ${names[1]}`);
    await expect(feed).toContainText(`${names[3]} ELIMINATED ${names[2]}`);
    await expect(feed).toContainText('VEHICLE');
    // a landscape phone hangs the feed right of the board; everywhere else it is the rail's own list
    const feedHome = info.project.use.isMobile ? 'rail-side' : 'hud-rail';
    await expect(page.locator(`[data-testid="${feedHome}"] [data-testid="kill-feed"]`)).toBeVisible();

    const chip = page.getByTestId('shield-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('SHIELD x2');
    await expect(chip).toHaveAttribute('data-layers', '2');

    // the mission panel, written into the HUD snapshot (a real mission is the mission-sim workstream's)
    await page.evaluate(() => {
      const st = (window as unknown as Debug).__WAHALA__.store;
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
      // the game republishes the HUD every ~100 ms and would drop the field: keep writing it for the check
      setInterval(() => {
        const hud = st.getState().hud as Record<string, unknown> | null;
        if (hud) st.setState({ hud: { ...hud, mission } });
      }, 30);
    });
    const panel = page.getByTestId('mission-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('mission-boss')).toContainText('BOSS SHIELDED');
    await expect(page.getByTestId('mission-warnings')).toContainText('STRIKE 2s');
    await expect(page.locator('[data-testid="hud-rail"] [data-testid="mission-panel"]')).toBeVisible();

    await shot(page, info.project.name, 'hud-combat-classic');
    // geometry: every rail block is left of the board edge at its lowest point and above the near row
    const board = (await page.evaluate(
      () => (window as unknown as Debug).__WAHALA__.store.getState().board,
    )) as { x: number; y: number }[];
    expect(board).not.toBeNull();
    const nearY = board[3]!.y;
    // the rail clips what does not fit: only the part inside the rail is visible
    const [rail] = await rectsOf(page, '[data-testid="hud-rail"]');
    for (const block of await rectsOf(page, '[data-testid="hud-rail"] > *')) {
      const r = { ...block, bottom: Math.min(block.bottom, rail!.bottom) };
      expect(r.right, 'a rail block overlaps the board').toBeLessThanOrEqual(
        leftEdgeAt(board, r.bottom) + 0.5,
      );
      expect(r.bottom).toBeLessThan(nearY);
    }
    if (info.project.use.isMobile) {
      const [side] = await rectsOf(page, '[data-testid="rail-side"]');
      expect(side!.left, 'the side feed overlaps the board').toBeGreaterThanOrEqual(
        boardRightEdgeAt(board, side!.bottom) - 0.5,
      );
      expect(side!.right).toBeLessThanOrEqual(page.viewportSize()!.width);
      await clearOf(page, '[data-testid="rail-side"]');
      for (const l of await rectsOf(page, '[data-testid="kill-feed-line"]'))
        expect(l.bottom, 'a feed line is clipped away').toBeLessThanOrEqual(side!.bottom + 0.5);
    }
    await clearOf(page, '[data-testid="rail-combat"]'); // the combat block is clipped above the move pad
    // nothing with text covers the board's bottom row
    const rowTop = nearY - (nearY - board[0]!.y) / 10;
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
      { left: board[3]!.x, right: board[2]!.x, top: rowTop, bottom: nearY },
    );
    expect(covering).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('City Rumble: the kill feed is in the left panel under the counter, clear of the camera centre, the timer and the controls', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '&nobots&noattract');
    await startMatch(page, { game: 'rumble' });
    await page.evaluate(() => ((window as unknown as Debug).__WAHALA__.controller().frozen = true));
    await stageAndPublish(page, STAGE);

    const feed = page.getByTestId('kill-feed');
    await expect(feed).toBeVisible();
    await expect(feed).toContainText(`YOU ELIMINATED ${(await playerNames(page))[1]}`);
    const vp = page.viewportSize()!;
    for (const r of await rectsOf(page, '[data-testid="kill-feed-line"]')) {
      // top-left column: well above the bottom row, left of the centre where the followed player stands
      expect(r.bottom, 'kill feed reaches the bottom rows').toBeLessThan(vp.height * 0.6);
      expect(r.right, 'kill feed reaches the camera centre').toBeLessThan(vp.width * 0.5);
    }
    await clearOf(page, '[data-testid="kill-feed-line"]');
    await clearOf(page, '[data-testid="hud-rail"] > *');
    for (const r of await rectsOf(page, '[data-testid="hud-rail"] > *'))
      expect(r.bottom).toBeLessThan(vp.height * 0.7);
    await shot(page, info.project.name, 'hud-combat-rumble');
    expect(errors).toEqual([]);
  });
});
